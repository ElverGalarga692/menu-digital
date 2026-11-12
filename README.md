# Menú digital

Plantilla de menú para cafeterías y restaurantes. Un solo sitio sirve
muchos menús: cada local tiene su dirección (`/identificador`), su logo,
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
  editar, marcar como agotado y eliminar productos y categorías.
- **Reordenar**: arrastra el asa (⠿) de un producto o categoría; con
  teclado, enfoca el asa y usa las flechas arriba/abajo.
- **Deshacer**: al eliminar un producto o categoría aparece "Deshacer"
  durante unos segundos.
- **Etiquetas**: al editar un producto se marcan Recomendado, Nuevo,
  Vegano, Sin gluten o Picante.
- **Segundo idioma**: "Ajustes" → "Segundo idioma". Aparecen campos de
  traducción en productos, categorías y ajustes, y el cliente ve un
  selector (ES / EN…). Lo que no esté traducido se muestra en español.
- **Tamaños u opciones**: al editar un producto, "Añadir opción" permite
  varios precios (Chico / Grande, Caliente / Frío…).
- **Identidad del negocio**: "Ajustes" → nombre, logo (se sube desde la
  página), moneda, tipografía y los tres colores (fondo, texto, acento).
- **Datos del local**: "Ajustes" → WhatsApp, Instagram, dirección y
  horario; aparecen como botones bajo el logo.
- **Contraseña olvidada**: en el acceso, "Olvidé mi contraseña" envía un
  correo para cambiarla.
- **QR**: botón "QR" → descarga el PNG para imprimir.
- **Otro menú** (solo superadministrador): "Menús" → "Crear menú nuevo".
- **Dar acceso al dueño de un local**: crea su usuario en Firebase
  (paso 3) y añade su correo en "Ajustes" → "Correos que pueden editar
  este menú". Ese usuario solo podrá editar su menú.

## Direcciones

- Cada menú vive en `/identificador` (por ejemplo `/atono`). Las
  direcciones antiguas `?m=identificador` siguen funcionando.
- La portada (`/`) muestra el menú `defaultMenu` de `js/config.js`.
- `404.html` es una copia exacta de `index.html`: es lo que permite las
  direcciones limpias en GitHub Pages. **Si cambias uno, copia el otro.**
  En Cloudflare Pages esa función la cumple el archivo `_redirects`.

## Pasar a Cloudflare Pages y usar dominio propio

1. En <https://dash.cloudflare.com> → **Workers & Pages → Create → Pages →
   Connect to Git** y elige este repositorio.
2. Configuración de compilación: **Framework preset: None**, comando de
   compilación vacío, directorio de salida `/`. Desplegar.
3. El sitio queda en `https://NOMBRE.pages.dev`. Cada `git push` a `main`
   se publica solo.
4. Dominio propio: en el proyecto → **Custom domains → Set up a domain**
   y sigue los pasos (lo más simple es que el dominio esté en Cloudflare).
5. En Firebase → **Authentication → Settings → Authorized domains** añade
   `NOMBRE.pages.dev` y tu dominio; sin esto el login falla ahí.
6. Opcional, un dominio por local: en `js/config.js` → `domains`, indica
   qué menú abre la portada de cada dominio, por ejemplo
   `{ 'menu.atono.com': 'atono' }`.
7. Vuelve a generar los QR desde el botón "QR" entrando por el dominio
   nuevo, porque el QR lleva la dirección desde la que se genera.

## Estructura

```
index.html            la página
404.html              copia de index.html (direcciones limpias en GitHub Pages)
_redirects            direcciones limpias en Cloudflare Pages
css/styles.css
js/config.js          configuración (menú por defecto, Firebase)
js/app.js             interfaz: vista cliente y modo edición
js/store.js           datos: Firebase o demo (localStorage)
js/seed.js            menú de ejemplo y plantilla en blanco
js/vendor-qrcode.js   qrcode-generator 1.4.4 (MIT, Kazuhiko Arase)
assets/atono-logo.svg
firestore.rules       reglas de seguridad de Firestore
```

## Cómo carga

El visitante lee el menú con una sola petición ligera y guarda una copia
en su dispositivo, así que las siguientes visitas abren al instante. El
SDK de Firebase solo se descarga al entrar como administrador; con sesión
iniciada los cambios se ven en vivo, y el visitante los ve al recargar o
volver a la pestaña.
