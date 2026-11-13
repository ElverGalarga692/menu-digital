// Configuración del sitio.
export const CONFIG = {
  // Menú que se muestra en la portada (cuando la dirección no indica otro).
  defaultMenu: 'atono',

  // Dominios propios: qué menú se muestra en la portada de cada dominio.
  // Ejemplo: { 'menu.atono.com': 'atono', 'carta.otrolocal.com': 'otro-local' }
  domains: {},

  // Dirección del sitio en Cloudflare, donde están los datos (/api/...).
  // Solo la usan las copias alojadas fuera de Cloudflare, como GitHub Pages.
  apiBase: 'https://menu.digital-a.workers.dev',

  // true = modo demo: sin servidor, los cambios se guardan solo en el navegador.
  demo: false,
};
