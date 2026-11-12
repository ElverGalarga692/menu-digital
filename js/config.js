// Configuración del sitio.
//
// Mientras `firebase` esté en null la página funciona en MODO DEMO:
// los cambios se guardan solo en el navegador de quien edita.
// Para activar el guardado real, pega aquí la configuración de tu
// proyecto de Firebase (ver README.md, sección "Activar Firebase").
export const CONFIG = {
  // Menú que se muestra cuando la URL no trae ?m=...
  defaultMenu: 'atono',

  firebase: null,
  // Ejemplo:
  // firebase: {
  //   apiKey: '...',
  //   authDomain: 'tu-proyecto.firebaseapp.com',
  //   projectId: 'tu-proyecto',
  //   appId: '...',
  // },
};
