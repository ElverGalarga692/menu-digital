// Servidor del sitio en Cloudflare. Guarda los menús y las cuentas en la
// base de datos D1 (enlace `DB`) y sirve los archivos del sitio.
//
//   GET    /api/menu/<id>          menú (público)
//   PUT    /api/menu/<id>          guardar (dueño o superadministrador)
//   DELETE /api/menu/<id>          eliminar (superadministrador)
//   GET    /api/menus              lista de menús (superadministrador)
//   POST   /api/login              { email, password } -> { token, user }
//   GET    /api/me                 usuario de la sesión
//   POST   /api/password           { current, next } cambia la propia contraseña
//   GET    /api/users              cuentas (superadministrador)
//   PUT    /api/users/<correo>     { password } crea la cuenta o cambia su contraseña
//   DELETE /api/users/<correo>     elimina la cuenta
const SESSION_DAYS = 30;
const MAX_MENU_BYTES = 900_000;
const PBKDF2_ITERATIONS = 100_000;
const MAX_FAILED_LOGINS = 8;
const LOCK_MINUTES = 10;

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-allow-methods': 'GET, PUT, POST, DELETE, OPTIONS',
  'access-control-max-age': '86400',
};

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...CORS },
  });

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// ---------- Base de datos ----------

let schemaReady;
function ensureSchema(env) {
  if (!env.DB) throw new HttpError(503, 'La base de datos no está configurada en Cloudflare.');
  if (!schemaReady) {
    schemaReady = env.DB.batch([
      env.DB.prepare('CREATE TABLE IF NOT EXISTS menus (slug TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at INTEGER NOT NULL)'),
      env.DB.prepare(
        'CREATE TABLE IF NOT EXISTS users (email TEXT PRIMARY KEY, salt TEXT NOT NULL, hash TEXT NOT NULL, is_super INTEGER NOT NULL DEFAULT 0, failed INTEGER NOT NULL DEFAULT 0, locked_until INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)',
      ),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)'),
    ]).catch((err) => {
      schemaReady = null;
      throw err;
    });
  }
  return schemaReady;
}

async function getSetting(env, key) {
  const row = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first();
  return row ? row.value : null;
}

async function readMenu(env, slug) {
  const row = await env.DB.prepare('SELECT data FROM menus WHERE slug = ?').bind(slug).first();
  return row ? JSON.parse(row.data) : null;
}

const writeMenu = (env, slug, menu) =>
  env.DB.prepare('INSERT INTO menus (slug, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(slug) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at')
    .bind(slug, JSON.stringify(menu), Date.now())
    .run();

const readUser = (env, email) => env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();

// ---------- Contraseñas y sesiones ----------

const encoder = new TextEncoder();

function toBase64Url(bytes) {
  let text = '';
  for (const b of new Uint8Array(bytes)) text += String.fromCharCode(b);
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text) {
  const raw = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function sameText(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hashPassword(password, salt) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: fromBase64Url(salt), iterations: PBKDF2_ITERATIONS }, key, 256);
  return toBase64Url(bits);
}

async function saveUser(env, email, password, isSuper) {
  const salt = toBase64Url(crypto.getRandomValues(new Uint8Array(16)));
  const hash = await hashPassword(password, salt);
  await env.DB.prepare(
    'INSERT INTO users (email, salt, hash, is_super, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(email) DO UPDATE SET salt = excluded.salt, hash = excluded.hash, failed = 0, locked_until = 0',
  )
    .bind(email, salt, hash, isSuper ? 1 : 0, Date.now())
    .run();
  return hash;
}

// La clave con la que se firman las sesiones se genera sola la primera vez.
async function sessionKey(env) {
  let secret = await getSetting(env, 'session_secret');
  if (!secret) {
    await env.DB.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)')
      .bind('session_secret', toBase64Url(crypto.getRandomValues(new Uint8Array(32))))
      .run();
    secret = await getSetting(env, 'session_secret');
  }
  return crypto.subtle.importKey('raw', fromBase64Url(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

async function sign(env, payload) {
  return toBase64Url(await crypto.subtle.sign('HMAC', await sessionKey(env), encoder.encode(payload)));
}

// La sesión lleva una marca de la contraseña: al cambiarla, las sesiones
// anteriores dejan de valer.
async function createToken(env, email, hash) {
  const payload = toBase64Url(encoder.encode(JSON.stringify({ e: email, x: Date.now() + SESSION_DAYS * 86_400_000, p: hash.slice(0, 10) })));
  return `${payload}.${await sign(env, payload)}`;
}

async function currentUser(request, env) {
  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  if (!sameText(signature, await sign(env, payload))) return null;
  let data;
  try {
    data = JSON.parse(new TextDecoder().decode(fromBase64Url(payload)));
  } catch {
    return null;
  }
  if (!data.e || data.x < Date.now()) return null;
  const row = await readUser(env, data.e);
  if (!row || row.hash.slice(0, 10) !== data.p) return null;
  return { email: row.email, isSuper: row.is_super === 1 };
}

async function requireUser(request, env) {
  const user = await currentUser(request, env);
  if (!user) throw new HttpError(401, 'La sesión no es válida o ha caducado. Vuelve a entrar.');
  return user;
}

async function requireSuper(request, env) {
  const user = await requireUser(request, env);
  if (!user.isSuper) throw new HttpError(403, 'Esta acción solo la puede hacer el superadministrador.');
  return user;
}

// ---------- Validación ----------

function cleanEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (email.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'El correo no es válido.');
  return email;
}

function checkPassword(value) {
  const password = String(value || '');
  if (password.length < 8) throw new HttpError(400, 'La contraseña debe tener al menos 8 caracteres.');
  if (password.length > 200) throw new HttpError(400, 'La contraseña es demasiado larga.');
  return password;
}

async function readBody(request) {
  const text = await request.text();
  if (text.length > MAX_MENU_BYTES) throw new HttpError(413, 'El menú ocupa demasiado; prueba con un logo más ligero.');
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, 'La petición no es válida.');
  }
}

function checkMenu(menu) {
  const bad = () => new HttpError(400, 'El menú no tiene un formato válido.');
  if (!menu || typeof menu !== 'object' || Array.isArray(menu)) throw bad();
  if (typeof menu.name !== 'string' || !menu.name.trim() || menu.name.length > 100) throw bad();
  if (!Array.isArray(menu.categories) || menu.categories.length > 100) throw bad();
  for (const category of menu.categories) {
    if (!category || typeof category !== 'object' || typeof category.name !== 'string') throw bad();
    if (!Array.isArray(category.items) || category.items.length > 300) throw bad();
  }
  if (!Array.isArray(menu.owners)) menu.owners = [];
  if (menu.owners.length > 20 || menu.owners.some((o) => typeof o !== 'string')) throw bad();
  menu.owners = menu.owners.map((o) => o.trim().toLowerCase()).filter(Boolean);
}

// ---------- Rutas ----------

async function login(request, env) {
  const body = await readBody(request);
  const email = cleanEmail(body.email);
  const password = String(body.password || '');
  const wrong = new HttpError(401, 'Correo o contraseña incorrectos.');
  const row = await readUser(env, email);
  if (!row) {
    await hashPassword(password, 'AAAAAAAAAAAAAAAAAAAAAA'); // mismo tiempo de respuesta exista o no la cuenta
    throw wrong;
  }
  if (row.locked_until > Date.now()) throw new HttpError(429, `Demasiados intentos. Espera ${LOCK_MINUTES} minutos.`);
  if (!sameText(await hashPassword(password, row.salt), row.hash)) {
    const failed = row.failed + 1;
    const lock = failed >= MAX_FAILED_LOGINS ? Date.now() + LOCK_MINUTES * 60_000 : 0;
    await env.DB.prepare('UPDATE users SET failed = ?, locked_until = ? WHERE email = ?').bind(lock ? 0 : failed, lock, email).run();
    throw wrong;
  }
  if (row.failed) await env.DB.prepare('UPDATE users SET failed = 0 WHERE email = ?').bind(email).run();
  return json({ token: await createToken(env, email, row.hash), user: { email, isSuper: row.is_super === 1 } });
}

async function handleApi(request, env, path) {
  const method = request.method;
  await ensureSchema(env);

  if (path === '/login' && method === 'POST') return login(request, env);

  if (path === '/me' && method === 'GET') return json({ user: await requireUser(request, env) });

  if (path === '/password' && method === 'POST') {
    const user = await requireUser(request, env);
    const body = await readBody(request);
    const row = await readUser(env, user.email);
    if (!sameText(await hashPassword(String(body.current || ''), row.salt), row.hash)) throw new HttpError(403, 'La contraseña actual no es correcta.');
    const hash = await saveUser(env, user.email, checkPassword(body.next), user.isSuper);
    return json({ token: await createToken(env, user.email, hash) });
  }

  if (path === '/menus' && method === 'GET') {
    await requireSuper(request, env);
    const { results } = await env.DB.prepare('SELECT slug, data FROM menus ORDER BY slug').all();
    return json({ menus: results.map((r) => ({ slug: r.slug, name: JSON.parse(r.data).name || r.slug })) });
  }

  if (path === '/users' && method === 'GET') {
    await requireSuper(request, env);
    const { results } = await env.DB.prepare('SELECT email, is_super FROM users ORDER BY is_super DESC, email').all();
    return json({ users: results.map((r) => ({ email: r.email, isSuper: r.is_super === 1 })) });
  }

  const userMatch = path.match(/^\/users\/([^/]+)$/);
  if (userMatch) {
    const admin = await requireSuper(request, env);
    const email = cleanEmail(decodeURIComponent(userMatch[1]));
    const existing = await readUser(env, email);
    if (method === 'PUT') {
      const body = await readBody(request);
      await saveUser(env, email, checkPassword(body.password), existing ? existing.is_super === 1 : false);
      return json({ ok: true, created: !existing });
    }
    if (method === 'DELETE') {
      if (email === admin.email) throw new HttpError(400, 'No puedes eliminar tu propia cuenta.');
      await env.DB.prepare('DELETE FROM users WHERE email = ?').bind(email).run();
      return json({ ok: true });
    }
  }

  const menuMatch = path.match(/^\/menu\/([a-z0-9-]{1,60})$/);
  if (menuMatch) {
    const slug = menuMatch[1];
    if (method === 'GET') {
      const menu = await readMenu(env, slug);
      return menu ? json({ menu }) : json({ error: 'No existe ese menú.' }, 404);
    }
    if (method === 'PUT') {
      const user = await requireUser(request, env);
      const menu = await readBody(request);
      checkMenu(menu);
      const existing = await readMenu(env, slug);
      if (!existing && !user.isSuper) throw new HttpError(403, 'Solo el superadministrador puede crear menús.');
      if (existing && !user.isSuper) {
        if (!(existing.owners || []).includes(user.email)) throw new HttpError(403, 'Tu cuenta no tiene permiso sobre este menú.');
        menu.owners = existing.owners; // un dueño no decide quién más edita
      }
      menu.updatedAt = Date.now();
      await writeMenu(env, slug, menu);
      return json({ ok: true });
    }
    if (method === 'DELETE') {
      await requireSuper(request, env);
      await env.DB.prepare('DELETE FROM menus WHERE slug = ?').bind(slug).run();
      return json({ ok: true });
    }
  }

  throw new HttpError(404, 'No existe esa dirección.');
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    try {
      return await handleApi(request, env, url.pathname.slice(4));
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, err.status);
      console.error(err);
      return json({ error: 'Error interno del servidor.' }, 500);
    }
  },
};
