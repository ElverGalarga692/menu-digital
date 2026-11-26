# Menú digital

Plantilla de menú para cafeterías y restaurantes. Un solo sitio sirve
muchos menús: cada local tiene su dirección (`/identificador`), su logo,
sus colores y su moneda, y su dueño lo edita desde la misma página.

- Sin frameworks ni paso de compilación: HTML, CSS y JavaScript.
- Funciona en cualquier hosting con **PHP y MySQL** (servidor en
  `api/index.php`) o en **Cloudflare** (servidor en `worker.js`, datos en
  D1), con la misma página. No depende de servicios de Google.
- Algunas operadoras móviles cortan las conexiones a `*.workers.dev`
  (`ERR_CONNECTION_RESET`); por eso el sitio principal pasa a un hosting
  propio con dominio propio.

Sitio: <https://menudigital.nat.do> · anterior: <https://menu.digital-a.workers.dev>

## Cuentas y permisos

|                               | Superadministrador | Dueño de un local |
| ----------------------------- | ------------------ | ----------------- |
| Editar productos y ajustes    | Todos los menús    | Solo el suyo      |
| Crear y eliminar menús        | Sí                 | No                |
| Crear cuentas y contraseñas   | Sí                 | No                |
| Decidir quién edita cada menú | Sí                 | No                |

Los permisos se comprueban en el servidor (`api/index.php` o `worker.js`),
no solo en la página.

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

## Despliegue en un hosting con PHP y MySQL (cPanel)

Requisitos: PHP 7.2 o superior con PDO MySQL, y Apache o LiteSpeed (lo
habitual en cPanel), que leen el archivo `.htaccess`.

1. **Base de datos**: en cPanel → **Bases de datos MySQL**, crea una base
   de datos y un usuario, y añade el usuario a la base con **todos los
   privilegios**. Anota los nombres completos (cPanel les antepone tu
   usuario, p. ej. `cuenta_menu`) y la contraseña.
2. **Archivos**: en cPanel → **Administrador de archivos**, abre la carpeta
   del dominio (`public_html` o la que indique **Dominios**) y sube el
   contenido del sitio: `index.html`, `404.html`, `migrar.html`,
   `.htaccess`, y las carpetas `api`, `css`, `js` y `assets`. Activa
   "Mostrar archivos ocultos" para ver `.htaccess`.
3. **Configuración**: en `api/`, copia `config.example.php` como
   `config.php` y escribe los datos de MySQL y tu correo de
   superadministrador (`admin_email`).
4. **Comprobación**: abre `https://TU-DOMINIO/api/health`. Debe decir
   `"ok":true`. Las tablas se crean solas en ese momento.
5. **Puesta en marcha**: abre `https://TU-DOMINIO/migrar.html`. Elige
   **Empezar de cero** (crea tu cuenta y el menú de ejemplo de Atono) o
   **Copiar del sitio anterior** (con VPN si
   el sitio anterior no abre en tu conexión), escribe tu correo y
   contraseña de superadministrador y pulsa **Copiar datos**. Copia todos
   los menús y cuentas con sus contraseñas. Solo funciona una vez, en un
   sitio sin cuentas. Después puedes borrar `migrar.html`.
6. Activa **SSL** (cPanel → SSL/TLS Status o Let's Encrypt) para que el
   sitio abra con `https://`, y vuelve a generar los QR desde el dominio
   nuevo.

- Algunos hostings bloquean las peticiones PUT y DELETE: la página las
  envía como POST con la cabecera `X-HTTP-Method-Override`.
- `api/config.php` no está en el repositorio (guarda las claves) y
  `api/.htaccess` impide abrirlo desde el navegador.
- **Copia de seguridad**: cPanel → phpMyAdmin → la base de datos →
  Exportar.

### Publicación automática por FTP

`.github/workflows/deploy.yml` sube los cambios al hosting cada vez que
cambia `main` (y se puede lanzar a mano en GitHub → Actions → Publicar en
el hosting → Run workflow).

1. En el panel del hosting (HestiaCP): pestaña **WEB** → editar el dominio
   → marca **Cuentas FTP adicionales** → usuario, contraseña y ruta
   `public_html` → Guardar.
2. En GitHub: **Settings → Secrets and variables → Actions → New
   repository secret**, crea `FTP_SERVER` (servidor FTP, p. ej. el nombre
   del servidor del panel), `FTP_USERNAME` (el usuario completo que muestra
   el panel) y `FTP_PASSWORD`.
3. Opcional: `FTP_PROTOCOL` = `ftp` si el hosting no acepta conexiones
   cifradas (por defecto `ftps`).

Solo sube lo que cambió. No toca `api/config.php` ni sube `migrar.html`.

## Despliegue en Cloudflare

El repositorio está conectado a Cloudflare (Workers & Pages → proyecto
`menu`): cada `git push` a `main` se publica solo con `npx wrangler deploy`,
según `wrangler.jsonc`.

- La base de datos D1 se crea sola en el primer despliegue y las tablas
  las crea `worker.js` al primer uso.
- `GET /api/export` (solo superadministrador) entrega todos los menús y
  cuentas; lo usa `migrar.html` para copiarlos a otro servidor.
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
migrar.html           copia única de datos desde el sitio anterior
.htaccess             direcciones y cabeceras en hosting Apache/LiteSpeed
api/index.php         servidor en PHP + MySQL: menús, cuentas y sesiones (/api/...)
api/config.example.php  plantilla de api/config.php (datos de MySQL)
api/.htaccess         impide abrir config.php desde el navegador
worker.js             servidor en Cloudflare (mismas rutas, datos en D1)
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
