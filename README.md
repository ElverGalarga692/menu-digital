# Menú digital

Plantilla de menú para cafeterías y restaurantes. Un solo sitio sirve
muchos menús: cada local tiene su dirección (`/identificador`), su logo,
sus colores y su moneda, y su dueño lo edita desde la misma página.

- Sin frameworks ni paso de compilación: HTML, CSS y JavaScript.
- Se publica en **Vercel** (datos en Upstash Redis) o en **Cloudflare**
  (datos en D1), con el mismo código. No depende de servicios de Google.
- Algunas operadoras móviles cortan las conexiones a `*.workers.dev`
  (`ERR_CONNECTION_RESET`); por eso el sitio principal pasa a Vercel.

Sitio anterior: <https://menu.digital-a.workers.dev>

## Cuentas y permisos

|                               | Superadministrador | Dueño de un local |
| ----------------------------- | ------------------ | ----------------- |
| Editar productos y ajustes    | Todos los menús    | Solo el suyo      |
| Crear y eliminar menús        | Sí                 | No                |
| Crear cuentas y contraseñas   | Sí                 | No                |
| Decidir quién edita cada menú | Sí                 | No                |

Los permisos se comprueban en el servidor (`api/_core.js`), no solo en la
página.

## Dar de alta un local

1. Entra como superadministrador ("Administrar", al pie de cualquier menú).
2. **Menús → Crear menú nuevo**: nombre, identificador, si parte en blanco
   o como copia de otro menú, correo del dueño y su contraseña inicial.
3. En el menú nuevo, **Ajustes**: logo, colores, tipografía, moneda, datos
   del local e idioma.
4. Carga categorías y productos.
5. **QR → Descargar PNG** y entrega al dueño la dirección, su correo y la
   contraseña inicial. El dueño la cambia en **Cuenta → Cambiar mi
   contraseña**.

## Uso

- **Editar**: añadir, editar, marcar como agotado y eliminar productos y
  categorías.
- **Reordenar**: arrastra el asa (⠿) de un producto o categoría; con
  teclado, enfoca el asa y usa las flechas arriba/abajo.
- **Deshacer**: al eliminar un producto o categoría aparece "Deshacer"
  durante unos segundos.
- **Tamaños u opciones**: al editar un producto, "Añadir opción" permite
  varios precios (Chico / Grande, Caliente / Frío…).
- **Etiquetas**: Recomendado, Nuevo, Vegano, Sin gluten, Picante.
- **Segundo idioma**: "Ajustes" → "Segundo idioma". Aparecen campos de
  traducción en productos, categorías y ajustes, y el cliente ve un
  selector (ES / EN…). Lo que no esté traducido se muestra en español.
- **Cuenta**: cambiar la propia contraseña. El superadministrador ve además
  la lista de usuarios y puede crear cuentas, ponerles contraseña nueva o
  eliminarlas.
- **Contraseña olvidada**: no hay recuperación por correo. El
  superadministrador pone una nueva desde **Cuenta → Usuarios**.
- **Quitar el acceso a un dueño**: borra su correo en los Ajustes del menú
  o elimina su cuenta.

## Direcciones

- Cada menú vive en `/identificador` (por ejemplo `/atono`). Las
  direcciones antiguas `?m=identificador` siguen funcionando.
- La portada (`/`) muestra el menú `defaultMenu` de `js/config.js`.

## Despliegue en Vercel

1. En <https://vercel.com>, **Add New → Project** e importa este
   repositorio. Framework: **Other**, sin comando de compilación. Deploy.
2. En el proyecto → **Storage → Create Database → Upstash for Redis**
   (plan gratuito) y conéctala al proyecto. Esto añade solas las variables
   `KV_REST_API_URL` y `KV_REST_API_TOKEN`.
3. **Deployments → Redeploy** para que el servidor vea la base de datos.
4. Abre `https://TU-PROYECTO.vercel.app/atono` → **Administrar** y entra
   con tu cuenta de superadministrador de siempre. La primera vez se copian
   solos todos los menús y cuentas del sitio de Cloudflare (con las mismas
   contraseñas). Hasta entonces, los menús se leen de allí.
5. Vuelve a generar los QR desde la dirección nueva.

La copia usa el sitio indicado en `LEGACY_API` (por defecto
`https://menu.digital-a.workers.dev`) y solo ocurre una vez, mientras el
sitio de Vercel no tenga cuentas. `vercel.json` envía `/api/...` a
`api/handler.js` y el resto de direcciones a `index.html`.

## Despliegue en Cloudflare

El repositorio está conectado a Cloudflare (Workers & Pages → proyecto
`menu`): cada `git push` a `main` se publica solo con `npx wrangler deploy`,
según `wrangler.jsonc`.

- La base de datos D1 se crea sola en el primer despliegue y las tablas
  las crea `worker.js` al primer uso.
- `GET /api/export` (solo superadministrador) entrega todos los menús y
  cuentas; es lo que usa Vercel para copiar los datos.
- Las contraseñas se guardan cifradas (PBKDF2). La clave que firma las
  sesiones se genera sola y se guarda en la base de datos.
- **Copia de seguridad**: en el panel de Cloudflare → Storage & Databases →
  D1 → la base de datos del proyecto, se pueden consultar y exportar las
  tablas `menus` y `users`.

### Dominio propio

1. En el proyecto → **Domains → Add Domain** y sigue los pasos (lo más
   simple es que el dominio esté registrado o gestionado en Cloudflare).
2. Con un dominio como `tumenu.com`, cada local queda en
   `tumenu.com/identificador`.
3. Opcional, un dominio por local: en `js/config.js` → `domains`, indica
   qué menú abre la portada de cada dominio, por ejemplo
   `{ 'menu.atono.com': 'atono' }`.
4. Actualiza `apiBase` en `js/config.js` si cambia la dirección principal,
   y vuelve a generar los QR entrando por el dominio nuevo (el QR lleva la
   dirección desde la que se genera).

### Copia en GitHub Pages

El sitio también puede servirse desde GitHub Pages (Settings → Pages →
rama `main`). Esa copia no tiene servidor: lee y guarda los datos en el
sitio de Cloudflare indicado en `apiBase`. `404.html` es una copia exacta
de `index.html` y es lo que permite las direcciones limpias allí.
**Si cambias uno, copia el otro.**

## Probar en local

```bash
npx wrangler dev
```

Levanta el sitio completo con una base de datos local vacía. Para ver solo
la interfaz sin servidor, pon `demo: true` en `js/config.js`: los cambios
se guardan en el navegador.

## Estructura

```
index.html            la página
404.html              copia de index.html (direcciones limpias en GitHub Pages)
api/_core.js          servidor: menús, cuentas y sesiones (/api/...), común a ambos
api/handler.js        servidor en Vercel (datos en Upstash Redis)
vercel.json           direcciones y cabeceras en Vercel
.vercelignore         archivos del repo que no se publican en Vercel
worker.js             servidor en Cloudflare (datos en D1)
wrangler.jsonc        configuración del despliegue en Cloudflare
.assetsignore         archivos del repo que no se publican en Cloudflare
css/styles.css        estilos
css/fonts.css         tipografías (archivos en assets/fonts)
js/config.js          configuración (menú por defecto, dominios)
js/app.js             interfaz: vista cliente y modo edición
js/store.js           acceso a datos: servidor o demo
js/seed.js            menú de ejemplo y plantilla en blanco
js/vendor-qrcode.js   qrcode-generator 1.4.4 (MIT, Kazuhiko Arase)
assets/               logo de ejemplo y tipografías (SIL Open Font License)
```
