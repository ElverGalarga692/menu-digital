// Servidor del sitio en Vercel. vercel.json envía aquí todo /api/...; las
// rutas están en api/_core.js (las mismas que en Cloudflare).
//
// Los datos se guardan en Upstash Redis (Vercel → Storage → Upstash for
// Redis), que añade solas las variables KV_REST_API_URL y KV_REST_API_TOKEN
// (o UPSTASH_REDIS_REST_URL y UPSTASH_REDIS_REST_TOKEN).
//
// Claves en Redis (hashes):
//   menus     identificador -> menú (JSON)
//   users     correo -> cuenta (JSON)
//   settings  nombre -> valor
import { handleApi } from './_core.js';

// Sitio anterior del que se copian los datos la primera vez (ver _core.js).
// LEGACY_API="" en las variables de Vercel lo desactiva.
const LEGACY_API = process.env.LEGACY_API ?? 'https://menu.digital-a.workers.dev';

function upstash(url, token) {
  // Envía varios comandos en una sola petición y devuelve sus resultados.
  async function run(...commands) {
    const res = await fetch(`${url.replace(/\/$/, '')}/pipeline`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(commands),
    });
    if (!res.ok) throw new Error(`Redis respondió ${res.status}`);
    const out = await res.json();
    return out.map((r) => {
      if (r.error) throw new Error(`Redis: ${r.error}`);
      return r.result;
    });
  }
  const one = async (...command) => (await run(command))[0];
  const parse = (text) => (text == null ? null : JSON.parse(text));
  const values = (flat) => {
    const list = [];
    for (let i = 0; i < flat.length; i += 2) list.push([flat[i], flat[i + 1]]);
    return list;
  };

  return {
    async init() {},

    async getMenu(slug) {
      return parse(await one('HGET', 'menus', slug));
    },
    async putMenu(slug, menu) {
      await one('HSET', 'menus', slug, JSON.stringify(menu));
    },
    async deleteMenu(slug) {
      await one('HDEL', 'menus', slug);
    },
    async listMenus() {
      return values(await one('HGETALL', 'menus')).map(([slug, data]) => ({ slug, menu: JSON.parse(data) }));
    },

    async getUser(email) {
      return parse(await one('HGET', 'users', email));
    },
    async putUser(user) {
      await one('HSET', 'users', user.email, JSON.stringify(user));
    },
    async deleteUser(email) {
      await one('HDEL', 'users', email);
    },
    async listUsers() {
      return values(await one('HGETALL', 'users')).map(([, data]) => JSON.parse(data));
    },
    async countUsers() {
      return one('HLEN', 'users');
    },

    async getSetting(key) {
      return one('HGET', 'settings', key);
    },
    async addSetting(key, value) {
      await one('HSETNX', 'settings', key, value);
    },
  };
}

const redisUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const db = redisUrl && redisToken ? upstash(redisUrl, redisToken) : null;

async function handle(request) {
  // vercel.json reescribe /api/<ruta> a /api/handler?path=<ruta>.
  const url = new URL(request.url);
  const rest = url.searchParams.get('path') ?? url.pathname.replace(/^\/api(?:\/handler)?/, '');
  const path = '/' + rest.replace(/^\/+/, '');
  return handleApi(request, db, path, { legacyApi: LEGACY_API });
}

export { handle as GET, handle as POST, handle as PUT, handle as DELETE, handle as OPTIONS };
