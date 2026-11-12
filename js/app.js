import { CONFIG } from './config.js';
import { createStore } from './store.js';
import { sampleMenu, blankMenu, newId, DEFAULT_THEME } from './seed.js';

const cleanSlug = (s) => String(s || '').toLowerCase().trim().replace(/[^a-z0-9-]/g, '');
const slug = cleanSlug(new URLSearchParams(location.search).get('m')) || CONFIG.defaultMenu;
const menuUrl = (s) => `${location.origin}${location.pathname}?m=${s}`;

const app = document.getElementById('app');
const state = { menu: undefined, user: null, editing: false, error: null };
let store;
let navObserver;

// ---------- Utilidades de DOM ----------

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  el.append(...kids.flat().filter((k) => k != null && k !== false));
  return el;
}

function toast(text, bad = false) {
  const el = h('div', { class: bad ? 'toast bad' : 'toast' }, text);
  document.getElementById('toasts').append(el);
  setTimeout(() => el.remove(), bad ? 5000 : 1800);
}

function formatPrice(price, currency) {
  if (price === '' || price == null || Number.isNaN(Number(price))) return '';
  const n = Number(price);
  const text = new Intl.NumberFormat('es', {
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(n);
  return `${currency || ''}${text}`;
}

const isHexColor = (c) => /^#[0-9a-f]{6}$/i.test(c || '');

function applyTheme(menu) {
  const theme = { ...DEFAULT_THEME, ...(menu?.theme || {}) };
  for (const key of ['bg', 'ink', 'accent']) {
    document.documentElement.style.setProperty(`--${key}`, isHexColor(theme[key]) ? theme[key] : DEFAULT_THEME[key]);
  }
  document.querySelector('meta[name="theme-color"]').content = isHexColor(theme.bg) ? theme.bg : DEFAULT_THEME.bg;
  document.title = menu?.name ? `${menu.name} · Menú` : 'Menú';
}

// Solo se aceptan logos servidos por https o rutas relativas del propio sitio.
function safeLogoUrl(url) {
  const u = String(url || '').trim();
  if (!u) return '';
  if (/^https:\/\//i.test(u)) return u;
  if (/^[a-z0-9_\-./]+$/i.test(u) && !u.startsWith('//')) return u;
  return '';
}

// ---------- Permisos ----------

function canEdit() {
  const { user, menu } = state;
  if (!user || !menu) return false;
  return user.isSuper || (menu.owners || []).includes(user.email);
}

// ---------- Guardado ----------

async function mutate(change) {
  const next = structuredClone(state.menu);
  change(next);
  const previous = state.menu;
  state.menu = next;
  render();
  try {
    await store.saveMenu(slug, next);
    toast('Guardado');
  } catch (err) {
    state.menu = previous;
    render();
    toast(`No se pudo guardar: ${friendlyError(err)}`, true);
  }
}

function friendlyError(err) {
  const code = err?.code || '';
  if (code.includes('permission-denied')) return 'tu cuenta no tiene permiso sobre este menú.';
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) {
    return 'correo o contraseña incorrectos.';
  }
  if (code.includes('too-many-requests')) return 'demasiados intentos, espera unos minutos.';
  if (code.includes('network') || code.includes('unavailable')) return 'sin conexión.';
  return err?.message || 'error desconocido.';
}

function move(list, index, delta) {
  const target = index + delta;
  if (target < 0 || target >= list.length) return;
  [list[index], list[target]] = [list[target], list[index]];
}

// ---------- Diálogos ----------

function openDialog(build) {
  const dialog = h('dialog');
  const close = () => dialog.close();
  dialog.append(build(close));
  dialog.addEventListener('close', () => dialog.remove());
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) close();
  });
  document.body.append(dialog);
  dialog.showModal();
  return dialog;
}

function openForm({ title, hint, fields, submitLabel = 'Guardar', onSubmit, onDelete, deleteLabel = 'Eliminar' }) {
  openDialog((close) => {
    const errorBox = h('p', { class: 'error', role: 'alert' });
    const inputs = {};
    const rows = fields.map((f) => {
      const common = { name: f.name, required: f.required, placeholder: f.placeholder };
      let input;
      if (f.type === 'textarea') {
        input = h('textarea', { ...common, maxlength: f.maxlength || 400 });
        input.value = f.value ?? '';
      } else if (f.type === 'checkbox') {
        input = h('input', { type: 'checkbox', name: f.name });
        input.checked = Boolean(f.value);
      } else {
        input = h('input', {
          ...common,
          type: f.type || 'text',
          step: f.step,
          min: f.min,
          maxlength: f.maxlength || 200,
          inputmode: f.type === 'number' ? 'decimal' : null,
          autocomplete: f.autocomplete || 'off',
        });
        input.value = f.value ?? '';
      }
      inputs[f.name] = input;
      if (f.type === 'checkbox') return h('label', { class: 'field check' }, input, f.label);
      if (f.type === 'color') return h('label', { class: 'field color' }, f.label, input);
      return h('label', { class: 'field' }, f.label, input);
    });

    const submit = h('button', { class: 'btn primary', type: 'submit' }, submitLabel);
    const form = h(
      'form',
      {
        onsubmit: async (e) => {
          e.preventDefault();
          const values = {};
          for (const f of fields) {
            const input = inputs[f.name];
            values[f.name] = f.type === 'checkbox' ? input.checked : input.value.trim();
          }
          submit.disabled = true;
          errorBox.textContent = '';
          try {
            await onSubmit(values);
            close();
          } catch (err) {
            errorBox.textContent = friendlyError(err);
            submit.disabled = false;
          }
        },
      },
      h('h3', {}, title),
      hint && h('p', { class: 'hint' }, hint),
      rows,
      errorBox,
      h(
        'div',
        { class: 'actions' },
        onDelete &&
          h(
            'button',
            {
              class: 'btn danger',
              type: 'button',
              onclick: () => {
                if (onDelete()) close();
              },
            },
            deleteLabel,
          ),
        h('button', { class: 'btn', type: 'button', onclick: close }, 'Cancelar'),
        submit,
      ),
    );
    return form;
  });
}

function parsePrice(text) {
  if (text === '') return '';
  const n = Number(String(text).replace(',', '.'));
  if (Number.isNaN(n) || n < 0) throw new Error('El precio no es válido.');
  return n;
}

function itemForm(catId, item) {
  openForm({
    title: item ? 'Editar producto' : 'Nuevo producto',
    fields: [
      { name: 'name', label: 'Nombre', value: item?.name, required: true, maxlength: 80 },
      { name: 'price', label: `Precio (${state.menu.currency || 'sin símbolo'})`, type: 'number', step: 'any', min: 0, value: item?.price },
      { name: 'desc', label: 'Descripción (opcional)', type: 'textarea', value: item?.desc, maxlength: 300 },
      { name: 'available', label: 'Disponible', type: 'checkbox', value: item ? item.available !== false : true },
    ],
    onSubmit: (v) => {
      const price = parsePrice(v.price);
      return mutate((m) => {
        const cat = m.categories.find((c) => c.id === catId);
        if (!cat) return;
        const data = { name: v.name, price, desc: v.desc, available: v.available };
        const existing = item && cat.items.find((i) => i.id === item.id);
        if (existing) Object.assign(existing, data);
        else cat.items.push({ id: newId(), ...data });
      });
    },
  });
}

function categoryForm(cat) {
  openForm({
    title: cat ? 'Editar categoría' : 'Nueva categoría',
    fields: [{ name: 'name', label: 'Nombre', value: cat?.name, required: true, maxlength: 60, placeholder: 'Ej. Cafés' }],
    onSubmit: (v) =>
      mutate((m) => {
        const existing = cat && m.categories.find((c) => c.id === cat.id);
        if (existing) existing.name = v.name;
        else m.categories.push({ id: newId(), name: v.name, items: [] });
      }),
  });
}

function settingsForm() {
  const m = state.menu;
  const theme = { ...DEFAULT_THEME, ...(m.theme || {}) };
  const fields = [
    { name: 'name', label: 'Nombre del local', value: m.name, required: true, maxlength: 60 },
    { name: 'tagline', label: 'Subtítulo (opcional)', value: m.tagline, maxlength: 80, placeholder: 'Ej. Café de especialidad' },
    { name: 'currency', label: 'Símbolo de moneda', value: m.currency, maxlength: 6, placeholder: '$' },
    { name: 'note', label: 'Nota al pie (horario, wifi, dirección…)', type: 'textarea', value: m.note, maxlength: 400 },
    { name: 'logoUrl', label: 'Logo: dirección https o ruta del sitio (vacío = mostrar el nombre)', value: m.logoUrl, maxlength: 500 },
    { name: 'bg', label: 'Color de fondo', type: 'color', value: theme.bg },
    { name: 'ink', label: 'Color del texto', type: 'color', value: theme.ink },
    { name: 'accent', label: 'Color de acento', type: 'color', value: theme.accent },
  ];
  if (state.user?.isSuper && store.mode === 'firebase') {
    fields.push({
      name: 'owners',
      label: 'Correos que pueden editar este menú (separados por comas)',
      type: 'textarea',
      value: (m.owners || []).join(', '),
    });
  }
  openForm({
    title: 'Ajustes del menú',
    fields,
    onSubmit: (v) => {
      if (v.logoUrl && !safeLogoUrl(v.logoUrl)) {
        throw new Error('El logo debe ser una dirección https:// o una ruta del sitio (por ejemplo assets/logo.svg).');
      }
      return mutate((next) => {
        Object.assign(next, { name: v.name, tagline: v.tagline, currency: v.currency, note: v.note, logoUrl: v.logoUrl });
        next.theme = { bg: v.bg, ink: v.ink, accent: v.accent };
        if (v.owners !== undefined) {
          next.owners = v.owners.split(/[\s,;]+/).map((e) => e.toLowerCase()).filter(Boolean);
        }
      });
    },
  });
}

function loginForm() {
  if (store.mode === 'demo') {
    store.login();
    return;
  }
  openForm({
    title: 'Acceso de administrador',
    submitLabel: 'Entrar',
    fields: [
      { name: 'email', label: 'Correo', type: 'email', required: true, autocomplete: 'username' },
      { name: 'password', label: 'Contraseña', type: 'password', required: true, autocomplete: 'current-password' },
    ],
    onSubmit: (v) => store.login(v.email, v.password),
  });
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = h('script', { src });
    s.onload = resolve;
    s.onerror = () => reject(new Error('No se pudo cargar el generador de QR.'));
    document.head.append(s);
  });
}

async function qrDialog() {
  try {
    if (!window.qrcode) await loadScript('js/vendor-qrcode.js');
  } catch (err) {
    toast(err.message, true);
    return;
  }
  const url = menuUrl(slug);
  const qr = window.qrcode(0, 'M');
  qr.addData(url);
  qr.make();
  const count = qr.getModuleCount();
  const cell = 16;
  const margin = 4;
  const size = (count + margin * 2) * cell;
  const canvas = h('canvas', { class: 'qr', width: size, height: size });
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#000';
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (qr.isDark(r, c)) ctx.fillRect((c + margin) * cell, (r + margin) * cell, cell, cell);
    }
  }
  openDialog((close) =>
    h(
      'div',
      { class: 'dialog-body' },
      h('h3', {}, 'Código QR del menú'),
      canvas,
      h('p', { class: 'url' }, url),
      h(
        'div',
        { class: 'actions' },
        h('button', { class: 'btn', type: 'button', onclick: close }, 'Cerrar'),
        h('a', { class: 'btn primary', href: canvas.toDataURL('image/png'), download: `qr-${slug}.png` }, 'Descargar PNG'),
      ),
    ),
  );
}

async function menusDialog() {
  let menus;
  try {
    menus = await store.listMenus();
  } catch (err) {
    toast(`No se pudo cargar la lista: ${friendlyError(err)}`, true);
    return;
  }
  menus.sort((a, b) => a.slug.localeCompare(b.slug));
  openDialog((close) =>
    h(
      'div',
      { class: 'dialog-body' },
      h('h3', {}, 'Menús'),
      h(
        'ul',
        { class: 'menu-list' },
        menus.map((m) => h('li', {}, h('a', { href: menuUrl(m.slug) }, m.name), h('small', {}, `?m=${m.slug}`))),
      ),
      h(
        'div',
        { class: 'actions' },
        h('button', { class: 'btn', type: 'button', onclick: close }, 'Cerrar'),
        h(
          'button',
          {
            class: 'btn primary',
            type: 'button',
            onclick: () => {
              close();
              newMenuForm(menus.map((m) => m.slug));
            },
          },
          'Crear menú nuevo',
        ),
      ),
    ),
  );
}

function newMenuForm(existing) {
  openForm({
    title: 'Crear menú nuevo',
    hint: 'El identificador es lo que va en la dirección: ?m=identificador',
    submitLabel: 'Crear',
    fields: [
      { name: 'name', label: 'Nombre del local', required: true, maxlength: 60 },
      { name: 'slug', label: 'Identificador (minúsculas, números y guiones)', required: true, maxlength: 40, placeholder: 'mi-cafeteria' },
    ],
    onSubmit: async (v) => {
      const s = cleanSlug(v.slug);
      if (!s) throw new Error('El identificador no es válido.');
      if (existing.includes(s)) throw new Error('Ya existe un menú con ese identificador.');
      await store.saveMenu(s, blankMenu(v.name));
      location.href = menuUrl(s);
    },
  });
}

function deleteMenu() {
  if (!confirm(`¿Eliminar por completo el menú "${state.menu.name}"? No se puede deshacer.`)) return;
  store.deleteMenu(slug).then(
    () => toast('Menú eliminado'),
    (err) => toast(`No se pudo eliminar: ${friendlyError(err)}`, true),
  );
}

// ---------- Vistas ----------

function render() {
  navObserver?.disconnect();
  const { menu, user } = state;

  if (state.error) {
    app.replaceChildren(h('div', { class: 'status' }, h('h1', {}, 'No se pudo cargar el menú'), h('p', {}, state.error)));
    return;
  }
  if (menu === undefined) return;

  if (menu === null) {
    applyTheme(null);
    app.replaceChildren(
      h(
        'div',
        { class: 'status' },
        h('h1', {}, 'Menú no encontrado'),
        h('p', {}, `No existe ningún menú con el identificador "${slug}".`),
        user?.isSuper &&
          h(
            'p',
            {},
            h(
              'button',
              {
                class: 'btn primary',
                onclick: () => {
                  const data = slug === CONFIG.defaultMenu ? sampleMenu() : blankMenu(slug);
                  store.saveMenu(slug, data).catch((err) => toast(friendlyError(err), true));
                },
              },
              `Crear el menú "${slug}"`,
            ),
          ),
        user && !user.isSuper && h('p', { class: 'hint' }, setupHint(user)),
        h('p', {}, user ? h('button', { class: 'link', onclick: () => store.logout() }, `Cerrar sesión (${user.email})`) : h('button', { class: 'link', onclick: loginForm }, 'Administrar')),
      ),
    );
    return;
  }

  applyTheme(menu);
  const editing = state.editing && canEdit();
  const categories = menu.categories || [];
  const logo = safeLogoUrl(menu.logoUrl);

  const view = h(
    'div',
    { class: editing ? 'editing' : '' },
    editing && adminBar(),
    editing && store.mode === 'demo' && h('p', { class: 'demo-note' }, 'Modo demo: los cambios se guardan solo en este navegador.'),
    h(
      'header',
      { class: 'hero' },
      logo ? h('img', { src: logo, alt: menu.name }) : h('h1', {}, menu.name),
      menu.tagline && !logo && h('p', { class: 'tagline' }, menu.tagline),
    ),
    categories.length > 1 &&
      h('nav', { class: 'cats', 'aria-label': 'Categorías' }, h('div', { class: 'cats-inner' }, categories.map((c) => h('a', { href: `#c-${c.id}` }, c.name)))),
    h(
      'main',
      { class: 'wrap' },
      categories.length === 0 && h('p', { class: 'empty', style: 'text-align:center;padding-top:40px' }, editing ? 'Empieza añadiendo una categoría.' : 'Este menú todavía no tiene productos.'),
      categories.map((cat, ci) => categoryView(cat, ci, categories.length, editing, menu.currency)),
      editing && h('button', { class: 'add big', onclick: () => categoryForm() }, '+ Añadir categoría'),
    ),
    h(
      'footer',
      { class: 'foot' },
      menu.note && h('p', { class: 'note' }, menu.note),
      footerLink(editing),
    ),
  );
  app.replaceChildren(view);
  watchActiveCategory();
}

function setupHint(user) {
  if (user.superCheck === 'denied') {
    return 'Sesión iniciada, pero las reglas de Firestore aún no están publicadas: pega el contenido de firestore.rules en Firestore → Rules y pulsa Publicar.';
  }
  return `Sesión iniciada, pero esta cuenta no es superadministrador: en Firestore crea la colección "admins" con un documento cuyo ID sea exactamente ${user.email}`;
}

function footerLink(editing) {
  const { user } = state;
  if (!user) return h('button', { class: 'link', onclick: loginForm }, 'Administrar');
  if (editing) return null;
  if (!canEdit()) {
    return h('button', { class: 'link', onclick: () => store.logout() }, `Tu cuenta (${user.email}) no puede editar este menú · Cerrar sesión`);
  }
  return h(
    'button',
    {
      class: 'link',
      onclick: () => {
        state.editing = true;
        render();
      },
    },
    'Volver al modo edición',
  );
}

function adminBar() {
  const isSuper = state.user?.isSuper;
  return h(
    'div',
    { class: 'adminbar' },
    h(
      'div',
      { class: 'adminbar-inner' },
      h('strong', {}, 'Modo edición'),
      h('button', { onclick: settingsForm }, 'Ajustes'),
      h('button', { onclick: qrDialog }, 'QR'),
      isSuper && h('button', { onclick: menusDialog }, 'Menús'),
      isSuper && h('button', { onclick: deleteMenu }, 'Eliminar menú'),
      h(
        'button',
        {
          onclick: () => {
            state.editing = false;
            render();
          },
        },
        'Vista cliente',
      ),
      h('button', { onclick: () => store.logout() }, 'Salir'),
    ),
  );
}

function categoryView(cat, index, total, editing, currency) {
  const items = cat.items || [];
  return h(
    'section',
    { class: 'category', id: `c-${cat.id}` },
    h(
      'div',
      { class: 'category-head' },
      h('h2', {}, cat.name),
      editing &&
        h(
          'div',
          { class: 'tools' },
          h('button', { 'aria-label': 'Subir categoría', disabled: index === 0, onclick: () => mutate((m) => move(m.categories, index, -1)) }, '↑'),
          h('button', { 'aria-label': 'Bajar categoría', disabled: index === total - 1, onclick: () => mutate((m) => move(m.categories, index, 1)) }, '↓'),
          h('button', { onclick: () => categoryForm(cat) }, 'Renombrar'),
          h(
            'button',
            {
              class: 'danger',
              onclick: () => {
                const warning = items.length ? ` y sus ${items.length} productos` : '';
                if (confirm(`¿Eliminar la categoría "${cat.name}"${warning}?`)) {
                  mutate((m) => {
                    m.categories = m.categories.filter((c) => c.id !== cat.id);
                  });
                }
              },
            },
            'Eliminar',
          ),
        ),
    ),
    items.length === 0 && h('p', { class: 'empty' }, editing ? 'Sin productos todavía.' : 'Próximamente.'),
    items.map((item, ii) => itemView(cat, item, ii, items.length, editing, currency)),
    editing && h('button', { class: 'add', onclick: () => itemForm(cat.id) }, '+ Añadir producto'),
  );
}

function itemView(cat, item, index, total, editing, currency) {
  const out = item.available === false;
  const inCat = (m) => m.categories.find((c) => c.id === cat.id);
  return h(
    'article',
    { class: out ? 'item out' : 'item' },
    h(
      'div',
      { class: 'item-row' },
      h('span', { class: 'item-name' }, item.name),
      out && h('span', { class: 'badge' }, 'Agotado'),
      h('span', { class: 'item-price' }, formatPrice(item.price, currency)),
    ),
    item.desc && h('p', { class: 'item-desc' }, item.desc),
    editing &&
      h(
        'div',
        { class: 'tools' },
        h('button', { 'aria-label': 'Subir producto', disabled: index === 0, onclick: () => mutate((m) => move(inCat(m).items, index, -1)) }, '↑'),
        h('button', { 'aria-label': 'Bajar producto', disabled: index === total - 1, onclick: () => mutate((m) => move(inCat(m).items, index, 1)) }, '↓'),
        h('button', { onclick: () => itemForm(cat.id, item) }, 'Editar'),
        h(
          'button',
          {
            onclick: () =>
              mutate((m) => {
                const target = inCat(m).items.find((i) => i.id === item.id);
                target.available = out;
              }),
          },
          out ? 'Marcar disponible' : 'Marcar agotado',
        ),
        h(
          'button',
          {
            class: 'danger',
            onclick: () => {
              if (confirm(`¿Eliminar "${item.name}"?`)) {
                mutate((m) => {
                  const c = inCat(m);
                  c.items = c.items.filter((i) => i.id !== item.id);
                });
              }
            },
          },
          'Eliminar',
        ),
      ),
  );
}

function watchActiveCategory() {
  const links = [...app.querySelectorAll('.cats a')];
  if (!links.length || !('IntersectionObserver' in window)) return;
  const byId = new Map(links.map((a) => [a.getAttribute('href').slice(1), a]));
  navObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        links.forEach((a) => a.classList.remove('active'));
        const link = byId.get(entry.target.id);
        link?.classList.add('active');
        link?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'auto' });
      }
    },
    { rootMargin: '-70px 0px -70% 0px' },
  );
  app.querySelectorAll('.category').forEach((s) => navObserver.observe(s));
}

// ---------- Arranque ----------

async function start() {
  try {
    store = await createStore(CONFIG);
  } catch (err) {
    state.error = 'No se pudo conectar con el servicio de datos. Revisa tu conexión e inténtalo de nuevo.';
    render();
    return;
  }
  store.onAuth((user) => {
    const wasLoggedIn = Boolean(state.user);
    state.user = user;
    if (user && !wasLoggedIn) state.editing = true;
    if (!user) state.editing = false;
    render();
  });
  store.subscribeMenu(
    slug,
    (menu) => {
      state.menu = menu;
      state.error = null;
      render();
    },
    (err) => {
      if (state.menu === undefined) {
        state.error = friendlyError(err);
        render();
      }
    },
  );
}

start();
