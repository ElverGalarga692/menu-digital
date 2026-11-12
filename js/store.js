// Capa de datos. Dos implementaciones con la misma interfaz:
//  - Firebase (Firestore + Auth) cuando hay configuración.
//  - Demo (localStorage) cuando no la hay.
//
// Interfaz:
//   mode                      'firebase' | 'demo'
//   subscribeMenu(slug, cb)   cb(menu | null); devuelve función para cancelar
//   saveMenu(slug, menu)      sobrescribe el menú
//   deleteMenu(slug)
//   listMenus()               [{ slug, name }]
//   onAuth(cb)                cb(user | null), user = { email, isSuper }
//   login(email, password) / logout()

import { sampleMenu } from './seed.js';

const FIREBASE_VERSION = '10.14.1';

export async function createStore(config) {
  return config.firebase ? firebaseStore(config.firebase) : demoStore(config);
}

async function firebaseStore(firebaseConfig) {
  const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;
  const [appMod, fs, authMod] = await Promise.all([
    import(`${base}/firebase-app.js`),
    import(`${base}/firebase-firestore.js`),
    import(`${base}/firebase-auth.js`),
  ]);
  const app = appMod.initializeApp(firebaseConfig);
  const db = fs.getFirestore(app);
  const auth = authMod.getAuth(app);
  const menuRef = (slug) => fs.doc(db, 'menus', slug);

  return {
    mode: 'firebase',

    subscribeMenu(slug, cb, onError) {
      return fs.onSnapshot(
        menuRef(slug),
        (snap) => cb(snap.exists() ? snap.data() : null),
        (err) => onError && onError(err),
      );
    },

    saveMenu(slug, menu) {
      return fs.setDoc(menuRef(slug), { ...menu, updatedAt: Date.now() });
    },

    deleteMenu(slug) {
      return fs.deleteDoc(menuRef(slug));
    },

    async listMenus() {
      const snap = await fs.getDocs(fs.collection(db, 'menus'));
      return snap.docs.map((d) => ({ slug: d.id, name: d.data().name || d.id }));
    },

    onAuth(cb) {
      return authMod.onAuthStateChanged(auth, async (fbUser) => {
        if (!fbUser) return cb(null);
        const email = (fbUser.email || '').toLowerCase();
        let isSuper = false;
        try {
          isSuper = (await fs.getDoc(fs.doc(db, 'admins', email))).exists();
        } catch {
          // Sin permiso de lectura = no es superadministrador.
        }
        cb({ email, isSuper });
      });
    },

    login(email, password) {
      return authMod.signInWithEmailAndPassword(auth, email.trim(), password);
    },

    logout() {
      return authMod.signOut(auth);
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
    (menuSubs.get(slug) || []).forEach((cb) => cb(menu && structuredClone(menu)));
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

  return {
    mode: 'demo',

    subscribeMenu(slug, cb) {
      if (!menuSubs.has(slug)) menuSubs.set(slug, new Set());
      menuSubs.get(slug).add(cb);
      queueMicrotask(() => emit(slug));
      return () => menuSubs.get(slug).delete(cb);
    },

    async saveMenu(slug, menu) {
      read()[slug] = { ...structuredClone(menu), updatedAt: Date.now() };
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

    onAuth(cb) {
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
  };
}
