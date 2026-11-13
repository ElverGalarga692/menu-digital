// Capa de datos. Dos implementaciones con la misma interfaz:
//  - API: el servidor del sitio en Cloudflare (worker.js).
//  - Demo: localStorage, cuando CONFIG.demo es true.
//
// Interfaz:
//   mode                      'api' | 'demo'
//   adminHint()               true si este navegador tiene una sesión guardada
//   fetchMenu(slug)           menú | null (lectura pública)
//   saveMenu(slug, menu) / deleteMenu(slug)
//   listMenus()               [{ slug, name }]
//   onAuth(cb)                cb(user | null), user = { email, isSuper }
//   login(email, password) / logout()
//   changePassword(current, next)
//   listUsers() / saveUser(email, password) / deleteUser(email)

import { sampleMenu } from './seed.js';

// Copia profunda; structuredClone no existe en navegadores algo antiguos.
const clone = (value) => (typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)));

export async function createStore(config) {
  return config.demo ? demoStore(config) : apiStore(config);
}

function apiStore(config) {
  const TOKEN = 'menu-digital:token';
  // GitHub Pages no tiene servidor: allí se usa el de Cloudflare.
  const base = location.hostname.endsWith('.github.io') ? config.apiBase || '' : '';
  const listeners = new Set();
  let user = null;
  let checked = null; // promesa de la comprobación inicial de la sesión

  const storedToken = () => {
    try {
      return localStorage.getItem(TOKEN);
    } catch {
      return null;
    }
  };
  let token = storedToken();
  const setToken = (next) => {
    token = next;
    try {
      if (next) localStorage.setItem(TOKEN, next);
      else localStorage.removeItem(TOKEN);
    } catch {
      // Sin almacenamiento: la sesión dura hasta recargar.
    }
  };

  const setUser = (next) => {
    user = next;
    listeners.forEach((cb) => cb(user));
  };

  async function call(method, path, body, { auth = true, wait = 15000 } = {}) {
    const headers = {};
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (auth && token) headers.authorization = `Bearer ${token}`;
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), wait);
    let res;
    try {
      res = await fetch(`${base}/api${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: 'no-store',
        signal: abort.signal,
      });
    } catch (err) {
      throw new Error(err?.name === 'AbortError' ? 'El servidor no respondió a tiempo.' : 'No se pudo conectar con el servidor.');
    } finally {
      clearTimeout(timer);
    }
    if (!(res.headers.get('content-type') || '').includes('json')) {
      throw new Error(`El servidor dio una respuesta inesperada (${res.status}).`);
    }
    const data = await res.json();
    if (!res.ok) {
      // Sesión caducada o invalidada: se cierra en este navegador.
      if (res.status === 401 && auth && token) {
        setToken(null);
        setUser(null);
      }
      const error = new Error(data.error || `El servidor respondió ${res.status}.`);
      error.status = res.status;
      throw error;
    }
    return data;
  }

  return {
    mode: 'api',

    adminHint() {
      return Boolean(token);
    },

    async fetchMenu(slug) {
      try {
        // Con sesión, el servidor incluye además quién puede editar el menú.
        return (await call('GET', `/menu/${encodeURIComponent(slug)}`)).menu;
      } catch (err) {
        if (err.status === 404) return null;
        throw err;
      }
    },

    async saveMenu(slug, menu) {
      await call('PUT', `/menu/${encodeURIComponent(slug)}`, menu);
    },

    async deleteMenu(slug) {
      await call('DELETE', `/menu/${encodeURIComponent(slug)}`);
    },

    async listMenus() {
      return (await call('GET', '/menus')).menus;
    },

    // Avisa del usuario actual y de cada cambio de sesión.
    async onAuth(cb) {
      listeners.add(cb);
      if (!checked) {
        checked = token
          ? call('GET', '/me').then(
              (data) => setUser(data.user),
              () => setUser(null),
            )
          : Promise.resolve().then(() => setUser(null));
        await checked;
      } else {
        await checked;
        cb(user);
      }
      return () => listeners.delete(cb);
    },

    async login(email, password) {
      const data = await call('POST', '/login', { email, password }, { auth: false });
      setToken(data.token);
      setUser(data.user);
    },

    async logout() {
      setToken(null);
      setUser(null);
    },

    async changePassword(current, next) {
      const data = await call('POST', '/password', { current, next });
      setToken(data.token); // las sesiones anteriores dejan de valer
    },

    async listUsers() {
      return (await call('GET', '/users')).users;
    },

    async saveUser(email, password) {
      return call('PUT', `/users/${encodeURIComponent(email.trim().toLowerCase())}`, { password });
    },

    async deleteUser(email) {
      await call('DELETE', `/users/${encodeURIComponent(email)}`);
    },
  };
}

function demoStore(config) {
  const KEY = 'menu-digital:menus';
  const SESSION = 'menu-digital:demo-admin';
  const authSubs = new Set();
  const memory = { menus: null, admin: false };

  const read = () => {
    if (memory.menus) return memory.menus;
    try {
      memory.menus = JSON.parse(localStorage.getItem(KEY)) || {};
    } catch {
      memory.menus = {};
    }
    if (!memory.menus[config.defaultMenu]) {
      memory.menus[config.defaultMenu] = sampleMenu();
      write();
    }
    return memory.menus;
  };
  const write = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(memory.menus));
    } catch {
      // Sin almacenamiento (modo privado): los cambios viven solo en memoria.
    }
  };
  const currentUser = () => (memory.admin ? { email: 'demo', isSuper: true } : null);

  try {
    memory.admin = sessionStorage.getItem(SESSION) === '1';
  } catch {
    memory.admin = false;
  }
  const setAdmin = (on) => {
    memory.admin = on;
    try {
      sessionStorage.setItem(SESSION, on ? '1' : '0');
    } catch {
      // Ignorar: la sesión demo dura hasta recargar.
    }
    authSubs.forEach((cb) => cb(currentUser()));
  };
  const unavailable = async () => {
    throw new Error('No disponible en modo demo.');
  };

  return {
    mode: 'demo',

    adminHint() {
      return memory.admin;
    },

    async fetchMenu(slug) {
      const menu = read()[slug];
      return menu ? clone(menu) : null;
    },

    async saveMenu(slug, menu) {
      read()[slug] = { ...clone(menu), updatedAt: Date.now() };
      write();
    },

    async deleteMenu(slug) {
      delete read()[slug];
      write();
    },

    async listMenus() {
      return Object.entries(read()).map(([slug, m]) => ({ slug, name: m.name || slug }));
    },

    async onAuth(cb) {
      authSubs.add(cb);
      queueMicrotask(() => cb(currentUser()));
      return () => authSubs.delete(cb);
    },

    async login() {
      setAdmin(true);
    },

    async logout() {
      setAdmin(false);
    },

    changePassword: unavailable,
    listUsers: unavailable,
    saveUser: unavailable,
    deleteUser: unavailable,
  };
}
