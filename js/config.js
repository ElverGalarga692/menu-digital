// Configuración del sitio.
//
// Con `firebase: null` la página funciona en MODO DEMO (los cambios se
// guardan solo en el navegador). Con la configuración de un proyecto de
// Firebase, los datos y el login son reales (ver README.md).
export const CONFIG = {
  // Menú que se muestra cuando la URL no trae ?m=...
  defaultMenu: 'atono',

  // Dominios propios: qué menú se muestra en la portada de cada dominio.
  // Ejemplo: { 'menu.atono.com': 'atono', 'carta.otrolocal.com': 'otro-local' }
  domains: {},

  // Sitio de Cloudflare que entrega los menús (/api/menu/...). Solo lo usan
  // las copias del sitio alojadas fuera de Cloudflare, como GitHub Pages.
  apiBase: 'https://menu.digital-a.workers.dev',

  // Claves públicas por diseño: la seguridad la dan las reglas de Firestore.
  firebase: {
    apiKey: 'AIzaSyDS6zoYy2MI8Pl42wNgXuOzZSD9osbuyRw',
    authDomain: 'menu-digital-81c7b.firebaseapp.com',
    projectId: 'menu-digital-81c7b',
    storageBucket: 'menu-digital-81c7b.firebasestorage.app',
    messagingSenderId: '845572060983',
    appId: '1:845572060983:web:96d00eb0c981dec0868cb2',
  },
};
