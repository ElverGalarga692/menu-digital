// Capa de datos. Dos implementaciones con la misma interfaz:
//  - Firebase (Firestore + Auth) cuando hay configuración.
//  - Demo (localStorage) cuando no la hay.
//
// La lectura pública (fetchMenu) es una petición ligera; el SDK de Firebase
// (pesado) solo se descarga cuando alguien entra como administrador.
//
// Interfaz:
//   mode                      'firebase' | 'demo'
//   adminHint()               true si este navegador ya inició sesión antes
//   fetchMenu(slug)           menú | null (lectura pública, sin SDK)
//   subscribeMenu(slug, cb)   cambios en vivo; devuelve función para cancelar
//   saveMenu(slug, menu)      sobrescribe el menú
//   deleteMenu(slug)
//   listMenus()               [{ slug, name }]
//   onAuth(cb)                cb(user | null), user = { email, isSuper, superCheck }
//   login(email, password) / logout() / resetPassword(email)

import { sampleMenu } from './seed.js';

const FIREBASE_VERSION = '10.14.1';

// Copia profunda; structuredClone no existe en navegadores algo antiguos.
const clone = (value) => (typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)));

export async function createStore(config) {
  return config.firebase ? firebaseStore(config.firebase) : demoStore(config);
}

// Convierte el formato tipado de la API REST de Firestore a valores normales.
function decodeValue(v) {
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(decodeValue);
  if ('mapValue' in v) return decodeFields(v.mapValue.fields || {});
  if ('timestampValue' in v) return v.timestampValue;
  return null;
}

function decodeFields(fields) {
  const out = {};
  for (const [key, value] of Object.entries(fields)) out[key] = decodeValue(value);
  return out;
}

function firebaseStore(firebaseConfig) {
  const HINT = 'menu-digital:admin';
  const setHint = (on) => {
    try {
      if (on) localStorage.setItem(HINT, '1');
      else localStorage.removeItem(HINT);
    } catch {
      // Sin almacenamiento: solo se pierde el atajo de sesión.
    }
  };

  let sdkPromise;
  const sdk = () => {
    if (sdkPromise) return sdkPromise;
    sdkPromise = (async () => {
      const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;
      const [appMod, fs, authMod] = await Promise.all([
        import(`${base}/firebase-app.js`),
        import(`${base}/firebase-firestore.js`),
        import(`${base}/firebase-auth.js`),
      ]);
      const app = appMod.initializeApp(firebaseConfig);
      return { fs, authMod, db: fs.getFirestore(app), auth: authMod.getAuth(app) };
    })().catch((err) => {
      sdkPromise = null; // Permite reintentar si falló la descarga.
      throw err;
    });
    return sdkPromise;
  };

  return {
    mode: 'firebase',

    adminHint() {
      try {
        return localStorage.getItem(HINT) === '1';
      } catch {
        return false;
      }
    },

    async fetchMenu(slug) {
      const url =
        `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}` +
        `/databases/(default)/documents/menus/${encodeURIComponent(slug)}?key=${firebaseConfig.apiKey}`;
      // Con mala conexión, mejor un error visible que esperar sin fin.
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), 15000);
      let res;
      try {
        res = await fetch(url, { cache: 'no-store', signal: abort.signal });
      } catch (err) {
        throw new Error(err?.name === 'AbortError' ? 'el servicio de datos no respondió a tiempo' : `no se pudo conectar con el servicio de datos (${err?.message || err})`);
      } finally {
        clearTimeout(timer);
      }
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`El servicio de datos respondió ${res.status}.`);
      return decodeFields((await res.json()).fields || {});
    },

    async subscribeMenu(slug, cb, onError) {
      const { fs, db } = await sdk();
      return fs.onSnapshot(
        fs.doc(db, 'menus', slug),
        (snap) => cb(snap.exists() ? snap.data() : null),
        (err) => onError && onError(err),
      );
    },

    async saveMenu(slug, menu) {
      const { fs, db } = await sdk();
      return fs.setDoc(fs.doc(db, 'menus', slug), { ...menu, updatedAt: Date.now() });
    },

    async deleteMenu(slug) {
      const { fs, db } = await sdk();
      return fs.deleteDoc(fs.doc(db, 'menus', slug));
    },

    async listMenus() {
      const { fs, db } = await sdk();
      const snap = await fs.getDocs(fs.collection(db, 'menus'));
      return snap.docs.map((d) => ({ slug: d.id, name: d.data().name || d.id }));
    },

    async onAuth(cb) {
      const { fs, authMod, db, auth } = await sdk();
      return authMod.onAuthStateChanged(auth, async (fbUser) => {
        setHint(Boolean(fbUser));
        if (!fbUser) return cb(null);
        const email = (fbUser.email || '').toLowerCase();
        // superCheck explica por qué no se es superadministrador:
        // 'missing' = falta el documento admins/{correo};
        // 'denied'  = las reglas de Firestore no permiten leerlo (sin publicar).
        let superCheck = 'missing';
        try {
          if ((await fs.getDoc(fs.doc(db, 'admins', email))).exists()) superCheck = 'ok';
        } catch {
          superCheck = 'denied';
        }
        cb({ email, isSuper: superCheck === 'ok', superCheck });
      });
    },

    async login(email, password) {
      const { authMod, auth } = await sdk();
      return authMod.signInWithEmailAndPassword(auth, email.trim(), password);
    },

    async logout() {
      const { authMod, auth } = await sdk();
      return authMod.signOut(auth);
    },

    async resetPassword(email) {
      const { authMod, auth } = await sdk();
      auth.languageCode = 'es';
      return authMod.sendPasswordResetEmail(auth, email.trim());
    },
  };
}

function demoStore(config) {
  const KEY = 'menu-digital:menus';
  const SESSION = 'menu-digital:demo-admin';
  const menuSubs = new Map(); // slug -> Set(cb)
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
  const emit = (slug) => {
    const menu = read()[slug] || null;
    (menuSubs.get(slug) || []).forEach((cb) => cb(menu && clone(menu)));
  };
  const currentUser = () => (memory.admin ? { email: 'demo', isSuper: true, superCheck: 'ok' } : null);

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

  return {
    mode: 'demo',

    adminHint() {
      return memory.admin;
    },

    async fetchMenu(slug) {
      const menu = read()[slug];
      return menu ? clone(menu) : null;
    },

    async subscribeMenu(slug, cb) {
      if (!menuSubs.has(slug)) menuSubs.set(slug, new Set());
      menuSubs.get(slug).add(cb);
      return () => menuSubs.get(slug).delete(cb);
    },

    async saveMenu(slug, menu) {
      read()[slug] = { ...clone(menu), updatedAt: Date.now() };
      write();
      emit(slug);
    },

    async deleteMenu(slug) {
      delete read()[slug];
      write();
      emit(slug);
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

    async resetPassword() {},
  };
}
