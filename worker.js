// Servidor del sitio en Cloudflare. Guarda los menús y las cuentas en la
// base de datos D1 (enlace `DB`) y sirve los archivos del sitio. Las rutas
// de /api/... están en api/_core.js (las mismas que en Vercel).
import { handleApi } from './api/_core.js';

function d1(DB) {
  let schemaReady;
  const toUser = (r) =>
    r && { email: r.email, salt: r.salt, hash: r.hash, isSuper: r.is_super === 1, failed: r.failed, lockedUntil: r.locked_until, createdAt: r.created_at };

  return {
    init() {
      if (!schemaReady) {
        schemaReady = DB.batch([
          DB.prepare('CREATE TABLE IF NOT EXISTS menus (slug TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at INTEGER NOT NULL)'),
          DB.prepare(
            'CREATE TABLE IF NOT EXISTS users (email TEXT PRIMARY KEY, salt TEXT NOT NULL, hash TEXT NOT NULL, is_super INTEGER NOT NULL DEFAULT 0, failed INTEGER NOT NULL DEFAULT 0, locked_until INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)',
          ),
          DB.prepare('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)'),
        ]).catch((err) => {
          schemaReady = null;
          throw err;
        });
      }
      return schemaReady;
    },

    async getMenu(slug) {
      const row = await DB.prepare('SELECT data FROM menus WHERE slug = ?').bind(slug).first();
      return row ? JSON.parse(row.data) : null;
    },
    async putMenu(slug, menu) {
      await DB.prepare(
        'INSERT INTO menus (slug, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(slug) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at',
      )
        .bind(slug, JSON.stringify(menu), Date.now())
        .run();
    },
    async deleteMenu(slug) {
      await DB.prepare('DELETE FROM menus WHERE slug = ?').bind(slug).run();
    },
    async listMenus() {
      const { results } = await DB.prepare('SELECT slug, data FROM menus').all();
      return results.map((r) => ({ slug: r.slug, menu: JSON.parse(r.data) }));
    },

    async getUser(email) {
      return toUser(await DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first());
    },
    async putUser(u) {
      await DB.prepare(
        'INSERT INTO users (email, salt, hash, is_super, failed, locked_until, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(email) DO UPDATE SET salt = excluded.salt, hash = excluded.hash, is_super = excluded.is_super, failed = excluded.failed, locked_until = excluded.locked_until',
      )
        .bind(u.email, u.salt, u.hash, u.isSuper ? 1 : 0, u.failed || 0, u.lockedUntil || 0, u.createdAt || Date.now())
        .run();
    },
    async deleteUser(email) {
      await DB.prepare('DELETE FROM users WHERE email = ?').bind(email).run();
    },
    async listUsers() {
      const { results } = await DB.prepare('SELECT * FROM users').all();
      return results.map(toUser);
    },
    async countUsers() {
      return (await DB.prepare('SELECT COUNT(*) AS n FROM users').first()).n;
    },

    async getSetting(key) {
      const row = await DB.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first();
      return row ? row.value : null;
    },
    async addSetting(key, value) {
      await DB.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').bind(key, value).run();
    },
  };
}

let db;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    if (env.DB && !db) db = d1(env.DB);
    // allowExport: el sitio de Vercel copia de aquí los menús y las cuentas.
    return handleApi(request, env.DB ? db : null, url.pathname.slice(4), { allowExport: true });
  },
};
