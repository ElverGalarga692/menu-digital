# Menú digital

Plantilla de menú para cafeterías y restaurantes. Un solo sitio sirve
muchos menús: cada local tiene su dirección (`?m=identificador`), su logo,
sus colores y su moneda, y su administrador lo edita desde la misma página.

- Sin frameworks ni paso de compilación: HTML, CSS y JavaScript.
- Hosting estático (GitHub Pages, Cloudflare Pages…).
- Datos y login en Firebase (plan gratuito).

## Estado actual: modo demo

Mientras `js/config.js` tenga `firebase: null`, la página funciona en
**modo demo**: el botón "Administrar" entra sin contraseña y los cambios se
guardan solo en el navegador de quien edita. Sirve para probar, no para
producción.

## Publicar en GitHub Pages

1. En el repo: **Settings → Pages**.
2. En "Build and deployment": Source = **Deploy from a branch**,
   Branch = **main**, carpeta **/ (root)**. Guardar.
3. En un par de minutos estará en `https://USUARIO.github.io/menu-digital/`.

## Activar Firebase (guardado real y login)

1. Crea un proyecto en <https://console.firebase.google.com> (no hace falta
   Google Analytics).
2. **Authentication → Sign-in method**: activa **Correo electrónico/contraseña**.
3. **Authentication → Users → Add user**: crea tu usuario (correo y contraseña).
4. **Authentication → Settings → User actions**: desmarca
   **Enable create (sign-up)**. Importante: así nadie más puede registrarse.
5. **Firestore Database → Create database** (modo producción).
6. **Firestore → Rules**: pega el contenido de `firestore.rules` y publica.
7. **Firestore → Data**: crea la colección `admins` con un documento cuyo
   **ID sea tu correo en minúsculas** (el contenido da igual, por ejemplo
   un campo `rol: "super"`). Eso te convierte en superadministrador.
8. **Project settings → Your apps → Web (`</>`)**: registra una app y copia
   el objeto `firebaseConfig` en `js/config.js`, en lugar de `null`.
   Estas claves son públicas por diseño; la seguridad la dan las reglas.
9. **Authentication → Settings → Authorized domains**: añade
   `USUARIO.github.io`.
10. Abre el sitio, pulsa **Administrar**, entra y pulsa
    **Crear el menú "atono"**: se crea con productos de ejemplo.

## Uso

- **Editar**: "Administrar" (al pie) → iniciar sesión. Se pueden añadir,
  editar, reordenar, marcar como agotado y eliminar productos y categorías.
- **Identidad del negocio**: "Ajustes" → nombre, logo, moneda, nota al pie
  y los tres colores (fondo, texto, acento).
- **QR**: botón "QR" → descarga el PNG para imprimir.
- **Otro menú** (solo superadministrador): "Menús" → "Crear menú nuevo".
- **Dar acceso al dueño de un local**: crea su usuario en Firebase
  (paso 3) y añade su correo en "Ajustes" → "Correos que pueden editar
  este menú". Ese usuario solo podrá editar su menú.

## Estructura

```
index.html
css/styles.css
js/config.js          configuración (menú por defecto, Firebase)
js/app.js             interfaz: vista cliente y modo edición
js/store.js           datos: Firebase o demo (localStorage)
js/seed.js            menú de ejemplo y plantilla en blanco
js/vendor-qrcode.js   qrcode-generator 1.4.4 (MIT, Kazuhiko Arase)
assets/atono-logo.svg
firestore.rules       reglas de seguridad de Firestore
```

Los logos se pueden subir a `assets/` y referenciar como
`assets/mi-logo.svg`, o usar una dirección `https://`.
