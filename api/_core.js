// Lógica del servidor (/api/...), común a Vercel (api/handler.js) y
// Cloudflare (worker.js). Cada plataforma aporta su base de datos (`db`).
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
//   GET    /api/export             copia completa para mudar el sitio (superadministrador,
//                                  solo si la plataforma lo activa con allowExport)
//
// Interfaz de `db` (todo asíncrono):
//   init()
//   getMenu(slug) -> menú | null       putMenu(slug, menu)      deleteMenu(slug)
//   listMenus() -> [{ slug, menu }]
//   getUser(email) -> cuenta | null    putUser(cuenta)          deleteUser(email)
//   listUsers() -> [cuenta]            countUsers() -> número
//   getSetting(key) -> texto | null    addSetting(key, value)   (solo si no existe)
// cuenta = { email, salt, hash, isSuper, failed, lockedUntil, createdAt }

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

// Crea la cuenta o le pone contraseña nueva (y la desbloquea).
async function saveUser(db, email, password, isSuper) {
  const existing = await db.getUser(email);
  const salt = toBase64Url(crypto.getRandomValues(new Uint8Array(16)));
  const hash = await hashPassword(password, salt);
  await db.putUser({
    email,
    salt,
    hash,
    isSuper: existing ? existing.isSuper : Boolean(isSuper),
    failed: 0,
    lockedUntil: 0,
    createdAt: existing ? existing.createdAt : Date.now(),
  });
  return hash;
}

// La clave con la que se firman las sesiones se genera sola la primera vez.
async function sessionKey(db) {
  let secret = await db.getSetting('session_secret');
  if (!secret) {
    await db.addSetting('session_secret', toBase64Url(crypto.getRandomValues(new Uint8Array(32))));
    secret = await db.getSetting('session_secret');
  }
  return crypto.subtle.importKey('raw', fromBase64Url(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

async function sign(db, payload) {
  return toBase64Url(await crypto.subtle.sign('HMAC', await sessionKey(db), encoder.encode(payload)));
}

// La sesión lleva una marca de la contraseña: al cambiarla, las sesiones
// anteriores dejan de valer.
async function createToken(db, email, hash) {
  const payload = toBase64Url(encoder.encode(JSON.stringify({ e: email, x: Date.now() + SESSION_DAYS * 86_400_000, p: hash.slice(0, 10) })));
  return `${payload}.${await sign(db, payload)}`;
}

async function currentUser(request, db) {
  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  if (!sameText(signature, await sign(db, payload))) return null;
  let data;
  try {
    data = JSON.parse(new TextDecoder().decode(fromBase64Url(payload)));
  } catch {
    return null;
  }
  if (!data.e || data.x < Date.now()) return null;
  const row = await db.getUser(data.e);
  if (!row || row.hash.slice(0, 10) !== data.p) return null;
  return { email: row.email, isSuper: row.isSuper };
}

async function requireUser(request, db) {
  const user = await currentUser(request, db);
  if (!user) throw new HttpError(401, 'La sesión no es válida o ha caducado. Vuelve a entrar.');
  return user;
}

async function requireSuper(request, db) {
  const user = await requireUser(request, db);
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

// ---------- Mudanza desde el sitio anterior (temporal) ----------
// Con `legacyApi` (dirección del sitio anterior): mientras este sitio no
// tenga cuentas, la primera vez que entra el superadministrador del sitio
// anterior se copian aquí todos los menús y cuentas, con sus contraseñas.
// Hasta entonces, los menús que aún no están aquí se leen del sitio anterior.

async function readLegacyMenu(db, legacyApi, slug) {
  if (!legacyApi || (await db.getSetting('migrated'))) return null;
  try {
    const res = await fetch(`${legacyApi}/api/menu/${slug}`, { headers: { accept: 'application/json' } });
    return res.ok ? (await res.json()).menu || null : null;
  } catch {
    return null;
  }
}

async function importFromLegacy(db, legacyApi, email, password) {
  if (!legacyApi || (await db.getSetting('migrated')) || (await db.countUsers()) > 0) return false;
  let session;
  try {
    const res = await fetch(`${legacyApi}/api/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) return false;
    session = await res.json();
  } catch {
    return false;
  }
  if (!session.user?.isSuper) return false;
  const failed = new HttpError(502, 'No se pudieron copiar los datos del sitio anterior. Asegúrate de que está actualizado y vuelve a intentarlo.');
  let data;
  try {
    const res = await fetch(`${legacyApi}/api/export`, { headers: { authorization: `Bearer ${session.token}` } });
    if (!res.ok) throw failed;
    data = await res.json();
  } catch {
    throw failed;
  }
  if (!Array.isArray(data.menus) || !Array.isArray(data.users)) throw failed;
  for (const { slug, menu } of data.menus) await db.putMenu(slug, menu);
  for (const user of data.users) await db.putUser(user);
  await db.addSetting('migrated', String(Date.now()));
  return true;
}

// ---------- Rutas ----------

async function login(request, db, options) {
  const body = await readBody(request);
  const email = cleanEmail(body.email);
  const password = String(body.password || '');
  const wrong = new HttpError(401, 'Correo o contraseña incorrectos.');
  let row = await db.getUser(email);
  if (!row && (await importFromLegacy(db, options.legacyApi, email, password))) row = await db.getUser(email);
  if (!row) {
    await hashPassword(password, 'AAAAAAAAAAAAAAAAAAAAAA'); // mismo tiempo de respuesta exista o no la cuenta
    throw wrong;
  }
  if (row.lockedUntil > Date.now()) throw new HttpError(429, `Demasiados intentos. Espera ${LOCK_MINUTES} minutos.`);
  if (!sameText(await hashPassword(password, row.salt), row.hash)) {
    const failed = row.failed + 1;
    const lock = failed >= MAX_FAILED_LOGINS ? Date.now() + LOCK_MINUTES * 60_000 : 0;
    await db.putUser({ ...row, failed: lock ? 0 : failed, lockedUntil: lock });
    throw wrong;
  }
  if (row.failed) await db.putUser({ ...row, failed: 0 });
  return json({ token: await createToken(db, email, row.hash), user: { email, isSuper: row.isSuper } });
}

async function route(request, db, path, options) {
  const method = request.method;
  await db.init();

  if (path === '/login' && method === 'POST') return login(request, db, options);

  if (path === '/me' && method === 'GET') return json({ user: await requireUser(request, db) });

  if (path === '/password' && method === 'POST') {
    const user = await requireUser(request, db);
    const body = await readBody(request);
    const row = await db.getUser(user.email);
    if (!sameText(await hashPassword(String(body.current || ''), row.salt), row.hash)) throw new HttpError(403, 'La contraseña actual no es correcta.');
    const hash = await saveUser(db, user.email, checkPassword(body.next), user.isSuper);
    return json({ token: await createToken(db, user.email, hash) });
  }

  if (path === '/menus' && method === 'GET') {
    await requireSuper(request, db);
    const menus = (await db.listMenus()).sort((a, b) => (a.slug < b.slug ? -1 : 1));
    return json({ menus: menus.map(({ slug, menu }) => ({ slug, name: menu.name || slug })) });
  }

  if (path === '/users' && method === 'GET') {
    await requireSuper(request, db);
    const users = (await db.listUsers()).sort((a, b) => b.isSuper - a.isSuper || (a.email < b.email ? -1 : 1));
    return json({ users: users.map((u) => ({ email: u.email, isSuper: u.isSuper })) });
  }

  if (path === '/export' && method === 'GET' && options.allowExport) {
    await requireSuper(request, db);
    return json({ menus: await db.listMenus(), users: await db.listUsers() });
  }

  const userMatch = path.match(/^\/users\/([^/]+)$/);
  if (userMatch) {
    const admin = await requireSuper(request, db);
    const email = cleanEmail(decodeURIComponent(userMatch[1]));
    const existing = await db.getUser(email);
    if (method === 'PUT') {
      const body = await readBody(request);
      await saveUser(db, email, checkPassword(body.password), false);
      return json({ ok: true, created: !existing });
    }
    if (method === 'DELETE') {
      if (email === admin.email) throw new HttpError(400, 'No puedes eliminar tu propia cuenta.');
      await db.deleteUser(email);
      return json({ ok: true });
    }
  }

  const menuMatch = path.match(/^\/menu\/([a-z0-9-]{1,60})$/);
  if (menuMatch) {
    const slug = menuMatch[1];
    if (method === 'GET') {
      const menu = (await db.getMenu(slug)) || (await readLegacyMenu(db, options.legacyApi, slug));
      if (!menu) return json({ error: 'No existe ese menú.' }, 404);
      // Los correos de los dueños no son públicos: solo los recibe quien
      // puede editar este menú.
      const viewer = await currentUser(request, db);
      const mayEdit = viewer && (viewer.isSuper || (menu.owners || []).includes(viewer.email));
      if (!mayEdit) delete menu.owners;
      return json({ menu });
    }
    if (method === 'PUT') {
      const user = await requireUser(request, db);
      const menu = await readBody(request);
      const existing = await db.getMenu(slug);
      // Si la petición no trae la lista de dueños, se conserva la guardada.
      if (!Array.isArray(menu?.owners) && existing) menu.owners = existing.owners || [];
      checkMenu(menu);
      if (!existing && !user.isSuper) throw new HttpError(403, 'Solo el superadministrador puede crear menús.');
      if (existing && !user.isSuper) {
        if (!(existing.owners || []).includes(user.email)) throw new HttpError(403, 'Tu cuenta no tiene permiso sobre este menú.');
        menu.owners = existing.owners; // un dueño no decide quién más edita
      }
      menu.updatedAt = Date.now();
      await db.putMenu(slug, menu);
      return json({ ok: true });
    }
    if (method === 'DELETE') {
      await requireSuper(request, db);
      await db.deleteMenu(slug);
      return json({ ok: true });
    }
  }

  throw new HttpError(404, 'No existe esa dirección.');
}

// Atiende una petición a /api. `path` es lo que sigue a /api (p. ej. '/menu/atono').
// db = null indica que la base de datos no está configurada en la plataforma.
export async function handleApi(request, db, path, options = {}) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  try {
    if (!db) throw new HttpError(503, 'La base de datos no está configurada.');
    return await route(request, db, path, options);
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message }, err.status);
    console.error(err);
    return json({ error: 'Error interno del servidor.' }, 500);
  }
}
