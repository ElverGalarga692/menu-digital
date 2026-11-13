import { CONFIG } from './config.js';
import { createStore } from './store.js';
import { sampleMenu, blankMenu, newId, DEFAULT_THEME } from './seed.js';

const cleanSlug = (s) => String(s || '').toLowerCase().trim().replace(/[^a-z0-9-]/g, '');

// Carpeta donde vive el sitio ('/' con dominio propio, '/repo/' en GitHub
// Pages). La fija la etiqueta <base> que index.html crea al cargar.
const BASE = new URL(document.baseURI).pathname;
const RESERVED = new Set(['index.html', '404.html']);

// El menú se elige por la dirección (/atono), por el formato antiguo
// (?m=atono), por el dominio (CONFIG.domains) o, si no, el menú por defecto.
function slugFromLocation() {
  const fromQuery = cleanSlug(new URLSearchParams(location.search).get('m'));
  if (fromQuery) return fromQuery;
  const rest = location.pathname.startsWith(BASE) ? location.pathname.slice(BASE.length) : '';
  const first = rest.split('/')[0];
  if (first && !RESERVED.has(first) && cleanSlug(first)) return cleanSlug(first);
  return (CONFIG.domains || {})[location.hostname] || CONFIG.defaultMenu;
}

const slug = slugFromLocation();
const menuUrl = (s) => `${location.origin}${BASE}${s}`;

// Idiomas: el principal es siempre español; cada menú puede activar un segundo.
const LANGS = {
  es: { label: 'Español', short: 'ES' },
  en: { label: 'English', short: 'EN' },
  pt: { label: 'Português', short: 'PT' },
  fr: { label: 'Français', short: 'FR' },
  de: { label: 'Deutsch', short: 'DE' },
  it: { label: 'Italiano', short: 'IT' },
};

const TAGS = ['recomendado', 'nuevo', 'vegano', 'sin-gluten', 'picante'];

// Textos fijos de la vista del cliente en cada idioma.
const UI = {
  es: {
    soldOut: 'Agotado', soon: 'Próximamente', empty: 'Este menú todavía no tiene productos.',
    directions: 'Cómo llegar', categories: 'Categorías', language: 'Idioma',
    tags: { recomendado: 'Recomendado', nuevo: 'Nuevo', vegano: 'Vegano', 'sin-gluten': 'Sin gluten', picante: 'Picante' },
  },
  en: {
    soldOut: 'Sold out', soon: 'Coming soon', empty: 'This menu has no items yet.',
    directions: 'Directions', categories: 'Categories', language: 'Language',
    tags: { recomendado: 'Recommended', nuevo: 'New', vegano: 'Vegan', 'sin-gluten': 'Gluten-free', picante: 'Spicy' },
  },
  pt: {
    soldOut: 'Esgotado', soon: 'Em breve', empty: 'Este cardápio ainda não tem produtos.',
    directions: 'Como chegar', categories: 'Categorias', language: 'Idioma',
    tags: { recomendado: 'Recomendado', nuevo: 'Novo', vegano: 'Vegano', 'sin-gluten': 'Sem glúten', picante: 'Picante' },
  },
  fr: {
    soldOut: 'Épuisé', soon: 'Bientôt', empty: 'Ce menu n’a pas encore de produits.',
    directions: 'Itinéraire', categories: 'Catégories', language: 'Langue',
    tags: { recomendado: 'Recommandé', nuevo: 'Nouveau', vegano: 'Végan', 'sin-gluten': 'Sans gluten', picante: 'Épicé' },
  },
  de: {
    soldOut: 'Ausverkauft', soon: 'Demnächst', empty: 'Diese Karte hat noch keine Produkte.',
    directions: 'Route', categories: 'Kategorien', language: 'Sprache',
    tags: { recomendado: 'Empfohlen', nuevo: 'Neu', vegano: 'Vegan', 'sin-gluten': 'Glutenfrei', picante: 'Scharf' },
  },
  it: {
    soldOut: 'Esaurito', soon: 'Prossimamente', empty: 'Questo menù non ha ancora prodotti.',
    directions: 'Indicazioni', categories: 'Categorie', language: 'Lingua',
    tags: { recomendado: 'Consigliato', nuevo: 'Novità', vegano: 'Vegano', 'sin-gluten': 'Senza glutine', picante: 'Piccante' },
  },
};

const langKey = `menu-digital:lang:${slug}`;
let viewLang = 'es';

function secondLang(menu) {
  const code = menu?.lang2;
  return code && code !== 'es' && LANGS[code] ? code : '';
}

// Idioma que ve el visitante: el que eligió; si no, el de su teléfono
// cuando coincide con el segundo idioma del menú; si no, español.
function currentLang(menu) {
  const l2 = secondLang(menu);
  if (!l2) return 'es';
  let saved;
  try {
    saved = localStorage.getItem(langKey);
  } catch {
    saved = null;
  }
  if (saved === 'es' || saved === l2) return saved;
  return (navigator.language || '').toLowerCase().startsWith(l2) ? l2 : 'es';
}

function chooseLang(code) {
  try {
    localStorage.setItem(langKey, code);
  } catch {
    // Sin almacenamiento: la elección dura hasta recargar.
  }
  render();
}

// Texto de un campo en el idioma visible; si falta la traducción, el original.
const tr = (obj, field) => (viewLang !== 'es' && obj?.t?.[field]) || obj?.[field] || '';

// Tipografías disponibles por negocio (Google Fonts). `head` se usa en
// títulos y nombres de producto; `body` en el resto.
const FONTS = {
  jost: { label: 'Jost · geométrica', head: 'Jost', body: 'Jost', query: 'Jost:wght@400;500;600' },
  poppins: { label: 'Poppins · moderna', head: 'Poppins', body: 'Poppins', query: 'Poppins:wght@400;500;600' },
  nunito: { label: 'Nunito · redondeada', head: 'Nunito', body: 'Nunito', query: 'Nunito:wght@400;600;700' },
  playfair: {
    label: 'Playfair Display · clásica',
    head: 'Playfair Display',
    body: 'Lora',
    query: 'Playfair+Display:wght@500;600&family=Lora:wght@400;500;600',
    fallback: 'Georgia, serif',
  },
  lora: { label: 'Lora · serif cálida', head: 'Lora', body: 'Lora', query: 'Lora:wght@400;500;600', fallback: 'Georgia, serif' },
  oswald: {
    label: 'Oswald · condensada',
    head: 'Oswald',
    body: 'Source Sans 3',
    query: 'Oswald:wght@400;500;600&family=Source+Sans+3:wght@400;500;600',
  },
};
const SANS_FALLBACK = "'Century Gothic', 'Avenir Next', 'Segoe UI', system-ui, sans-serif";

// Copia profunda; structuredClone no existe en navegadores algo antiguos.
const clone = (value) => (typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)));

const app = document.getElementById('app');
const state = { menu: undefined, user: null, editing: false, error: null };
let store;
let stopWatching = null;
let pinnedCategory = null;
let adminPromise;
let live = false;

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

function toast(text, bad = false, action) {
  const el = h('div', { class: bad ? 'toast bad' : 'toast' }, text);
  if (action) {
    el.classList.add('has-action');
    el.append(
      h(
        'button',
        {
          type: 'button',
          onclick: () => {
            el.remove();
            action.run();
          },
        },
        action.label,
      ),
    );
  }
  // Los avisos simples no se apilan: el nuevo sustituye al anterior.
  const box = document.getElementById('toasts');
  if (!action) box.querySelectorAll('.toast:not(.has-action):not(.bad)').forEach((old) => old.remove());
  box.append(el);
  setTimeout(() => el.remove(), action ? 8000 : bad ? 5000 : 1800);
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
  const root = document.documentElement.style;
  for (const key of ['bg', 'ink', 'accent']) {
    root.setProperty(`--${key}`, isHexColor(theme[key]) ? theme[key] : DEFAULT_THEME[key]);
  }
  const font = FONTS[theme.font] || FONTS.jost;
  const fallback = font.fallback || SANS_FALLBACK;
  root.setProperty('--font-head', `'${font.head}', ${fallback}`);
  root.setProperty('--font-body', `'${font.body}', ${fallback}`);
  const href = `https://fonts.googleapis.com/css2?family=${font.query}&display=swap`;
  let link = document.getElementById('menu-font');
  if (!link) {
    link = h('link', { id: 'menu-font', rel: 'stylesheet' });
    document.head.append(link);
  }
  if (link.getAttribute('href') !== href) link.setAttribute('href', href);

  document.querySelector('meta[name="theme-color"]').content = isHexColor(theme.bg) ? theme.bg : DEFAULT_THEME.bg;
  document.title = menu?.name ? `${menu.name} · Menú` : 'Menú';
}

// Logos admitidos: imagen subida desde la página (data:), dirección https
// o ruta relativa del propio sitio.
function safeLogoUrl(url) {
  const u = String(url || '').trim();
  if (!u) return '';
  if (/^data:image\/(png|jpeg|webp|svg\+xml);base64,[a-z0-9+/=]+$/i.test(u)) return u;
  if (/^https:\/\//i.test(u)) return u;
  if (/^[a-z0-9_\-./]+$/i.test(u) && !u.startsWith('//')) return u;
  return '';
}

// ---------- Caché local (para abrir al instante) ----------

const cacheKey = `menu-digital:cache:${slug}`;

function readCache() {
  try {
    return JSON.parse(localStorage.getItem(cacheKey)) || undefined;
  } catch {
    return undefined;
  }
}

function writeCache(menu) {
  if (store?.mode === 'demo') return;
  try {
    if (menu) localStorage.setItem(cacheKey, JSON.stringify(menu));
    else localStorage.removeItem(cacheKey);
  } catch {
    // Sin almacenamiento: simplemente no hay caché.
  }
}

function setMenu(menu) {
  state.menu = menu;
  state.error = null;
  writeCache(menu);
  render();
}

// ---------- Permisos ----------

function canEdit() {
  const { user, menu } = state;
  if (!user || !menu) return false;
  return user.isSuper || (menu.owners || []).includes(user.email);
}

// ---------- Guardado ----------

// Aplica un cambio al menú y lo guarda. `undo` añade "Deshacer" al aviso.
async function mutate(change, { message = 'Guardado', undo } = {}) {
  const next = clone(state.menu);
  change(next);
  const previous = state.menu;
  state.menu = next;
  render();
  try {
    await store.saveMenu(slug, next);
    writeCache(next);
    toast(message, false, undo && { label: 'Deshacer', run: undo });
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
  if (code.includes('invalid-email')) return 'el correo no es válido.';
  if (code.includes('too-many-requests')) return 'demasiados intentos, espera unos minutos.';
  if (code.includes('network') || code.includes('unavailable')) return 'sin conexión.';
  if (code.includes('invalid-argument') || /exceeds the maximum/i.test(err?.message || '')) {
    return 'el menú ocupa demasiado; prueba con un logo más ligero.';
  }
  return err?.message || 'error desconocido.';
}

function moveTo(list, from, to) {
  if (!list || from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return;
  const [moved] = list.splice(from, 1);
  list.splice(to, 0, moved);
}

// Asa para reordenar: se arrastra con el dedo o el ratón, o se usa con las
// flechas del teclado. `selector` identifica los elementos hermanos que se
// ordenan y `onMove(desde, hasta)` guarda la nueva posición.
function dragHandle(label, selector, onMove) {
  const btn = h('button', { class: 'handle', type: 'button', 'aria-label': label, title: 'Arrastra para reordenar (o usa las flechas del teclado)' }, '⠿');
  const siblingsOf = (el) => [...el.parentNode.querySelectorAll(`:scope > ${selector}`)];

  btn.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const el = btn.closest(selector);
    const all = siblingsOf(el);
    const from = all.indexOf(el);
    const to = from + (e.key === 'ArrowUp' ? -1 : 1);
    if (to < 0 || to >= all.length) return;
    onMove(from, to);
  });

  btn.addEventListener('pointerdown', (e) => {
    if (e.button) return;
    e.preventDefault();
    const el = btn.closest(selector);
    const parent = el.parentNode;
    const from = siblingsOf(el).indexOf(el);
    let y = e.clientY;
    let frame;
    btn.setPointerCapture(e.pointerId);
    el.classList.add('dragging');

    // El elemento salta de sitio cuando el puntero cruza la mitad del vecino.
    const place = () => {
      for (;;) {
        const prev = el.previousElementSibling;
        const next = el.nextElementSibling;
        if (prev?.matches(selector)) {
          const r = prev.getBoundingClientRect();
          if (y < r.top + r.height / 2) {
            parent.insertBefore(el, prev);
            continue;
          }
        }
        if (next?.matches(selector)) {
          const r = next.getBoundingClientRect();
          if (y > r.top + r.height / 2) {
            parent.insertBefore(next, el);
            continue;
          }
        }
        break;
      }
    };
    const tick = () => {
      const edge = 70;
      if (y < edge) window.scrollBy({ top: -10, behavior: 'instant' });
      else if (y > window.innerHeight - edge) window.scrollBy({ top: 10, behavior: 'instant' });
      place();
      frame = requestAnimationFrame(tick);
    };
    const onPointerMove = (ev) => {
      y = ev.clientY;
    };
    const end = () => {
      cancelAnimationFrame(frame);
      btn.removeEventListener('pointermove', onPointerMove);
      btn.removeEventListener('pointerup', end);
      btn.removeEventListener('pointercancel', end);
      el.classList.remove('dragging');
      const to = siblingsOf(el).indexOf(el);
      if (to !== from) onMove(from, to);
    };
    btn.addEventListener('pointermove', onPointerMove);
    btn.addEventListener('pointerup', end);
    btn.addEventListener('pointercancel', end);
    frame = requestAnimationFrame(tick);
  });
  return btn;
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

// Tipos de campo: text (por defecto), email, password, number, color,
// textarea, checkbox, select ({ options: [[valor, etiqueta]] }) y
// custom ({ widget: { node, value() } }).
function openForm({ title, hint, fields, submitLabel = 'Guardar', onSubmit, footer }) {
  openDialog((close) => {
    const errorBox = h('p', { class: 'error', role: 'alert' });
    const inputs = {};
    const rows = fields.map((f) => {
      if (f.type === 'custom') return f.widget.node;
      const common = { name: f.name, required: f.required, placeholder: f.placeholder };
      let input;
      if (f.type === 'textarea') {
        input = h('textarea', { ...common, maxlength: f.maxlength || 400 });
        input.value = f.value ?? '';
      } else if (f.type === 'checkbox') {
        input = h('input', { type: 'checkbox', name: f.name });
        input.checked = Boolean(f.value);
      } else if (f.type === 'select') {
        input = h('select', { name: f.name }, f.options.map(([value, label]) => h('option', { value }, label)));
        input.value = f.value ?? f.options[0][0];
      } else {
        input = h('input', {
          ...common,
          type: f.type || 'text',
          step: f.step,
          min: f.min,
          maxlength: f.maxlength || 200,
          inputmode: f.type === 'number' ? 'decimal' : f.inputmode,
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
    return h(
      'form',
      {
        onsubmit: async (e) => {
          e.preventDefault();
          submit.disabled = true;
          errorBox.textContent = '';
          try {
            const values = {};
            for (const f of fields) {
              if (f.type === 'custom') values[f.name] = f.widget.value();
              else if (f.type === 'checkbox') values[f.name] = inputs[f.name].checked;
              else values[f.name] = inputs[f.name].value.trim();
            }
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
      footer && footer(inputs, errorBox),
      h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', onclick: close }, 'Cancelar'), submit),
    );
  });
}

function parsePrice(text) {
  if (text === '' || text == null) return '';
  const n = Number(String(text).replace(',', '.'));
  if (Number.isNaN(n) || n < 0) throw new Error('El precio no es válido.');
  return n;
}

// Editor de tamaños u opciones de un producto (Chico / Grande…).
// Con segundo idioma activo, cada opción lleva también su traducción.
function variantsWidget(initial, l2) {
  const list = h('div', { class: 'variants-edit' });
  const addRow = (v = {}) => {
    const label = h('input', { type: 'text', placeholder: 'Ej. Grande', maxlength: 30, 'aria-label': 'Nombre de la opción', 'data-role': 'label' });
    label.value = v.label ?? '';
    const price = h('input', { type: 'number', step: 'any', min: 0, inputmode: 'decimal', placeholder: 'Precio', 'aria-label': 'Precio de la opción', 'data-role': 'price' });
    price.value = v.price ?? '';
    const translated =
      l2 && h('input', { type: 'text', class: 'variant-t', placeholder: `En ${LANGS[l2].label}`, maxlength: 30, 'aria-label': `Nombre de la opción en ${LANGS[l2].label}`, 'data-role': 't' });
    if (translated) translated.value = v.t?.label ?? '';
    const row = h(
      'div',
      { class: 'variant-row' },
      label,
      price,
      h('button', { type: 'button', class: 'btn', 'aria-label': 'Quitar opción', onclick: () => row.remove() }, '×'),
      translated,
    );
    row.original = v;
    list.append(row);
    return label;
  };
  initial.forEach(addRow);
  const node = h(
    'div',
    { class: 'field' },
    'Tamaños u opciones (opcional)',
    list,
    h('button', { type: 'button', class: 'add', onclick: () => addRow().focus() }, '+ Añadir opción'),
    h('span', { class: 'hint' }, 'Si añades opciones, se muestran en lugar del precio único.'),
  );
  return {
    node,
    value: () =>
      [...list.children]
        .map((row) => {
          const get = (role) => row.querySelector(`[data-role="${role}"]`)?.value.trim();
          const out = { label: get('label'), price: get('price') };
          if (l2) out.t = { label: get('t') };
          else if (row.original.t) out.t = row.original.t;
          return out;
        })
        .filter((v) => v.label || v.price !== ''),
  };
}

function tagsWidget(selected) {
  const node = h(
    'div',
    { class: 'field' },
    'Etiquetas',
    h(
      'div',
      { class: 'tag-options' },
      TAGS.map((tag) => {
        const input = h('input', { type: 'checkbox', value: tag });
        input.checked = selected.includes(tag);
        return h('label', { class: 'tag-option' }, input, UI.es.tags[tag]);
      }),
    ),
  );
  return { node, value: () => [...node.querySelectorAll('input:checked')].map((i) => i.value) };
}

function itemForm(catId, item) {
  const l2 = secondLang(state.menu);
  const other = l2 && LANGS[l2].label;
  openForm({
    title: item ? 'Editar producto' : 'Nuevo producto',
    fields: [
      { name: 'name', label: 'Nombre', value: item?.name, required: true, maxlength: 80 },
      l2 && { name: 't_name', label: `Nombre en ${other} (opcional)`, value: item?.t?.name, maxlength: 80 },
      { name: 'price', label: `Precio (${state.menu.currency || 'sin símbolo'})`, type: 'number', step: 'any', min: 0, value: item?.price },
      { name: 'variants', type: 'custom', widget: variantsWidget(item?.variants || [], l2) },
      { name: 'desc', label: 'Descripción (opcional)', type: 'textarea', value: item?.desc, maxlength: 300 },
      l2 && { name: 't_desc', label: `Descripción en ${other} (opcional)`, type: 'textarea', value: item?.t?.desc, maxlength: 300 },
      { name: 'tags', type: 'custom', widget: tagsWidget(item?.tags || []) },
      { name: 'available', label: 'Disponible', type: 'checkbox', value: item ? item.available !== false : true },
    ].filter(Boolean),
    onSubmit: (v) => {
      const price = parsePrice(v.price);
      const variants = v.variants.map((x) => {
        if (!x.label) throw new Error('Cada opción necesita un nombre.');
        return { ...x, price: parsePrice(x.price) };
      });
      return mutate((m) => {
        const cat = m.categories.find((c) => c.id === catId);
        if (!cat) return;
        const data = { name: v.name, price, variants, desc: v.desc, tags: v.tags, available: v.available };
        if (l2) data.t = { name: v.t_name, desc: v.t_desc };
        const existing = item && cat.items.find((i) => i.id === item.id);
        if (existing) Object.assign(existing, data);
        else cat.items.push({ id: newId(), ...data });
      });
    },
  });
}

function categoryForm(cat) {
  const l2 = secondLang(state.menu);
  openForm({
    title: cat ? 'Editar categoría' : 'Nueva categoría',
    fields: [
      { name: 'name', label: 'Nombre', value: cat?.name, required: true, maxlength: 60, placeholder: 'Ej. Cafés' },
      l2 && { name: 't_name', label: `Nombre en ${LANGS[l2].label} (opcional)`, value: cat?.t?.name, maxlength: 60 },
    ].filter(Boolean),
    onSubmit: (v) =>
      mutate((m) => {
        const data = { name: v.name };
        if (l2) data.t = { name: v.t_name };
        const existing = cat && m.categories.find((c) => c.id === cat.id);
        if (existing) Object.assign(existing, data);
        else m.categories.push({ id: newId(), ...data, items: [] });
      }),
  });
}

// ---------- Logo ----------

const MAX_LOGO_CHARS = 350_000;

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('El archivo no es una imagen válida.'));
    img.src = src;
  });
}

// Reduce la imagen para que quepa holgadamente dentro del menú guardado.
async function fileToLogo(file) {
  const original = await readAsDataUrl(file);
  if (file.type === 'image/svg+xml') {
    if (original.length > MAX_LOGO_CHARS) throw new Error('El SVG pesa demasiado (máximo ~250 KB).');
    return original;
  }
  const img = await loadImage(original);
  for (const maxSide of [640, 420, 280]) {
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = h('canvas', {
      width: Math.max(1, Math.round(img.naturalWidth * scale)),
      height: Math.max(1, Math.round(img.naturalHeight * scale)),
    });
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    let out = canvas.toDataURL('image/webp', 0.9);
    if (!out.startsWith('data:image/webp')) out = canvas.toDataURL('image/png');
    if (out.length <= MAX_LOGO_CHARS) return out;
  }
  throw new Error('La imagen pesa demasiado incluso reducida; prueba con otra más simple.');
}

function logoWidget(current) {
  let value = current || '';
  const preview = h('div', { class: 'logo-preview' });
  const error = h('span', { class: 'error', role: 'alert' });
  const show = () => {
    const url = safeLogoUrl(value);
    preview.replaceChildren(url ? h('img', { src: url, alt: 'Logo actual' }) : h('span', { class: 'hint' }, 'Sin logo: se muestra el nombre del local.'));
  };
  const file = h('input', {
    type: 'file',
    accept: 'image/png,image/jpeg,image/webp,image/svg+xml',
    hidden: true,
    'aria-label': 'Archivo del logo',
    onchange: async () => {
      const chosen = file.files[0];
      if (!chosen) return;
      error.textContent = '';
      try {
        value = await fileToLogo(chosen);
        show();
      } catch (err) {
        error.textContent = err.message;
      }
      file.value = '';
    },
  });
  show();
  return {
    node: h(
      'div',
      { class: 'field' },
      'Logo',
      preview,
      file,
      h(
        'div',
        { class: 'tools' },
        h('button', { type: 'button', onclick: () => file.click() }, 'Subir imagen'),
        h(
          'button',
          {
            type: 'button',
            onclick: () => {
              value = '';
              show();
            },
          },
          'Quitar logo',
        ),
      ),
      error,
    ),
    value: () => value,
  };
}

// ---------- Ajustes ----------

function settingsForm() {
  const m = state.menu;
  const theme = { ...DEFAULT_THEME, ...(m.theme || {}) };
  const contact = m.contact || {};
  const l2 = secondLang(m);
  const other = l2 && LANGS[l2].label;
  const fields = [
    { name: 'name', label: 'Nombre del local', value: m.name, required: true, maxlength: 60 },
    { name: 'tagline', label: 'Subtítulo (se muestra si no hay logo)', value: m.tagline, maxlength: 80, placeholder: 'Ej. Café de especialidad' },
    l2 && { name: 't_tagline', label: `Subtítulo en ${other}`, value: m.t?.tagline, maxlength: 80 },
    { name: 'logoUrl', type: 'custom', widget: logoWidget(m.logoUrl) },
    { name: 'currency', label: 'Símbolo de moneda', value: m.currency, maxlength: 6, placeholder: '$' },
    { name: 'font', label: 'Tipografía', type: 'select', value: FONTS[theme.font] ? theme.font : 'jost', options: Object.entries(FONTS).map(([key, f]) => [key, f.label]) },
    { name: 'bg', label: 'Color de fondo', type: 'color', value: theme.bg },
    { name: 'ink', label: 'Color del texto', type: 'color', value: theme.ink },
    { name: 'accent', label: 'Color de acento', type: 'color', value: theme.accent },
    {
      name: 'lang2',
      label: 'Segundo idioma (al activarlo aparecen campos de traducción en cada formulario)',
      type: 'select',
      value: l2,
      options: [['', 'Ninguno'], ...Object.entries(LANGS).filter(([code]) => code !== 'es').map(([code, l]) => [code, l.label])],
    },
    { name: 'whatsapp', label: 'WhatsApp (número con código de país)', value: contact.whatsapp, maxlength: 20, placeholder: 'Ej. 52 55 1234 5678', inputmode: 'tel' },
    { name: 'instagram', label: 'Instagram (usuario)', value: contact.instagram, maxlength: 60, placeholder: 'Ej. atono.cafe' },
    { name: 'address', label: 'Dirección o enlace de Google Maps', value: contact.address, maxlength: 300 },
    { name: 'hours', label: 'Horario', type: 'textarea', value: contact.hours, maxlength: 200, placeholder: 'Ej. Lun a sáb · 8:00 a 20:00' },
    l2 && { name: 't_hours', label: `Horario en ${other}`, type: 'textarea', value: m.t?.hours, maxlength: 200 },
    { name: 'note', label: 'Nota al pie (wifi, avisos…)', type: 'textarea', value: m.note, maxlength: 400 },
    l2 && { name: 't_note', label: `Nota al pie en ${other}`, type: 'textarea', value: m.t?.note, maxlength: 400 },
  ].filter(Boolean);
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
    onSubmit: (v) =>
      mutate((next) => {
        Object.assign(next, { name: v.name, tagline: v.tagline, currency: v.currency, note: v.note, logoUrl: v.logoUrl, lang2: v.lang2 });
        next.theme = { bg: v.bg, ink: v.ink, accent: v.accent, font: v.font };
        next.contact = { whatsapp: v.whatsapp, instagram: v.instagram, address: v.address, hours: v.hours };
        if (l2) next.t = { tagline: v.t_tagline, hours: v.t_hours, note: v.t_note };
        if (v.owners !== undefined) {
          next.owners = v.owners.split(/[\s,;]+/).map((e) => e.toLowerCase()).filter(Boolean);
        }
      }),
  });
}

// Botones de contacto del local a partir de lo escrito en Ajustes.
function contactLinks(contact) {
  const links = [];
  const whatsapp = String(contact.whatsapp || '').replace(/\D/g, '');
  if (whatsapp) links.push(['WhatsApp', `https://wa.me/${whatsapp}`]);
  const instagram = String(contact.instagram || '')
    .trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, '')
    .replace(/[^a-z0-9._]/gi, '');
  if (instagram) links.push(['Instagram', `https://instagram.com/${instagram}`]);
  const address = String(contact.address || '').trim();
  if (address) {
    const isLink = /^https:\/\//i.test(address);
    links.push([UI[viewLang].directions, isLink ? address : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`]);
  }
  return links;
}

// ---------- Sesión ----------

// Carga la parte de administración (SDK de Firebase) una sola vez.
function startAdmin() {
  if (adminPromise) return adminPromise;
  adminPromise = store
    .onAuth((user) => {
      const wasLoggedIn = Boolean(state.user);
      state.user = user;
      if (user && !wasLoggedIn) state.editing = true;
      if (!user) state.editing = false;
      if (user) watchLive();
      render();
    })
    .catch((err) => {
      adminPromise = null;
      throw err;
    });
  return adminPromise;
}

// Con sesión iniciada, el menú se actualiza en vivo.
function watchLive() {
  if (live) return;
  live = true;
  store.subscribeMenu(slug, setMenu, () => {}).catch(() => {
    live = false;
  });
}

async function refresh() {
  try {
    setMenu(await store.fetchMenu(slug));
  } catch (err) {
    if (state.menu === undefined) {
      state.error = `Revisa tu conexión e inténtalo de nuevo. (Detalle: ${err?.message || err})`;
      render();
    }
  }
}

async function loginForm() {
  try {
    await startAdmin();
  } catch {
    toast('No se pudo conectar. Revisa tu conexión e inténtalo de nuevo.', true);
    return;
  }
  if (store.mode === 'demo') {
    store.login();
    return;
  }
  if (state.user) return;
  openForm({
    title: 'Acceso de administrador',
    submitLabel: 'Entrar',
    fields: [
      { name: 'email', label: 'Correo', type: 'email', required: true, autocomplete: 'username' },
      { name: 'password', label: 'Contraseña', type: 'password', required: true, autocomplete: 'current-password' },
    ],
    onSubmit: (v) => store.login(v.email, v.password),
    footer: (inputs, messageBox) =>
      h(
        'button',
        {
          class: 'link',
          type: 'button',
          onclick: async (e) => {
            const email = inputs.email.value.trim();
            if (!email) {
              messageBox.textContent = 'Escribe tu correo arriba y vuelve a pulsar.';
              inputs.email.focus();
              return;
            }
            e.target.disabled = true;
            try {
              await store.resetPassword(email);
              messageBox.textContent = '';
              toast('Si el correo está registrado, recibirás un enlace para cambiar la contraseña.');
            } catch (err) {
              messageBox.textContent = friendlyError(err);
            }
            e.target.disabled = false;
          },
        },
        'Olvidé mi contraseña',
      ),
  });
}

// ---------- QR y lista de menús ----------

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
        menus.map((m) => h('li', {}, h('a', { href: menuUrl(m.slug) }, m.name), h('small', {}, `/${m.slug}`))),
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
              newMenuForm(menus);
            },
          },
          'Crear menú nuevo',
        ),
      ),
    ),
  );
}

// Alta de un local: nombre, dirección, quién lo edita y, si se quiere,
// partir de una copia de otro menú (diseño y productos).
function newMenuForm(menus) {
  const fields = [
    { name: 'name', label: 'Nombre del local', required: true, maxlength: 60 },
    { name: 'slug', label: 'Identificador (minúsculas, números y guiones)', required: true, maxlength: 40, placeholder: 'mi-cafeteria' },
    {
      name: 'copyFrom',
      label: 'Empezar a partir de',
      type: 'select',
      value: '',
      options: [['', 'Menú en blanco'], ...menus.map((m) => [m.slug, `Copia de ${m.name}`])],
    },
  ];
  if (store.mode === 'firebase') {
    fields.push({
      name: 'owners',
      label: 'Correo del dueño que podrá editarlo (opcional; varios separados por comas)',
      type: 'textarea',
      maxlength: 300,
    });
  }
  openForm({
    title: 'Crear menú nuevo',
    hint: `El identificador es el final de la dirección: ${location.host}${BASE}identificador`,
    submitLabel: 'Crear',
    fields,
    onSubmit: async (v) => {
      const s = cleanSlug(v.slug);
      if (!s || RESERVED.has(s)) throw new Error('El identificador no es válido.');
      if (menus.some((m) => m.slug === s)) throw new Error('Ya existe un menú con ese identificador.');
      let data = blankMenu(v.name);
      if (v.copyFrom) {
        const source = await store.fetchMenu(v.copyFrom);
        if (!source) throw new Error('No se pudo leer el menú a copiar.');
        data = { ...blankMenu(v.name), ...clone(source), name: v.name, owners: [] };
      }
      if (v.owners) data.owners = v.owners.split(/[\s,;]+/).map((e) => e.toLowerCase()).filter(Boolean);
      await store.saveMenu(s, data);
      location.href = menuUrl(s);
    },
  });
}

function deleteMenu() {
  if (!confirm(`¿Eliminar por completo el menú "${state.menu.name}"? No se puede deshacer.`)) return;
  store.deleteMenu(slug).then(
    () => {
      toast('Menú eliminado');
      setMenu(null);
    },
    (err) => toast(`No se pudo eliminar: ${friendlyError(err)}`, true),
  );
}

// ---------- Vistas ----------

function render() {
  stopWatching?.();
  stopWatching = null;
  const { menu, user } = state;
  // Si el foco está en un asa de reordenar, se devuelve tras repintar.
  const active = document.activeElement;
  const focusedHandle = active?.classList.contains('handle') ? active.closest('[id]')?.id : null;

  if (state.error) {
    app.replaceChildren(
      h(
        'div',
        { class: 'status' },
        h('h1', {}, 'No se pudo cargar el menú'),
        h('p', {}, state.error),
        h(
          'p',
          {},
          h(
            'button',
            {
              class: 'btn primary',
              onclick: () => {
                state.error = null;
                app.replaceChildren(h('p', { class: 'status' }, 'Cargando menú…'));
                refresh();
              },
            },
            'Reintentar',
          ),
        ),
      ),
    );
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
                  store.saveMenu(slug, data).then(
                    () => setMenu(data),
                    (err) => toast(friendlyError(err), true),
                  );
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
  viewLang = currentLang(menu);
  document.documentElement.lang = viewLang;
  const text = UI[viewLang];
  const l2 = secondLang(menu);
  const editing = state.editing && canEdit();
  const categories = menu.categories || [];
  const logo = safeLogoUrl(menu.logoUrl);
  const contact = menu.contact || {};
  const links = contactLinks(contact);
  const addressText = contact.address && !/^https:\/\//i.test(contact.address.trim()) ? contact.address : '';
  const hours = (viewLang !== 'es' && menu.t?.hours) || contact.hours;
  const tagline = tr(menu, 'tagline');
  const note = tr(menu, 'note');

  // Con <base> en la página, un enlace "#seccion" recargaría: se desplaza a mano.
  const jump = (id) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    pinnedCategory = id;
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.dispatchEvent(new Event('scroll'));
  };

  const view = h(
    'div',
    { class: editing ? 'editing' : '' },
    editing && adminBar(),
    editing && store.mode === 'demo' && h('p', { class: 'demo-note' }, 'Modo demo: los cambios se guardan solo en este navegador.'),
    h(
      'header',
      { class: 'hero' },
      l2 &&
        h(
          'div',
          { class: 'langs', role: 'group', 'aria-label': text.language },
          ['es', l2].map((code) =>
            h('button', { type: 'button', 'aria-pressed': String(code === viewLang), title: LANGS[code].label, onclick: () => chooseLang(code) }, LANGS[code].short),
          ),
        ),
      logo ? h('img', { src: logo, alt: menu.name }) : h('h1', {}, menu.name),
      tagline && !logo && h('p', { class: 'tagline' }, tagline),
      (addressText || hours) && h('div', { class: 'info' }, addressText && h('p', {}, addressText), hours && h('p', { class: 'hours' }, hours)),
      links.length > 0 &&
        h('div', { class: 'contact' }, links.map(([label, href]) => h('a', { href, target: '_blank', rel: 'noopener noreferrer' }, label))),
    ),
    categories.length > 1 &&
      h(
        'nav',
        { class: 'cats', 'aria-label': text.categories },
        h(
          'div',
          { class: 'cats-inner' },
          categories.map((c) => h('a', { href: `${location.pathname}#c-${c.id}`, 'data-target': `c-${c.id}`, onclick: jump(`c-${c.id}`) }, tr(c, 'name'))),
        ),
      ),
    h(
      'main',
      { class: 'wrap' },
      categories.length === 0 && h('p', { class: 'empty', style: 'text-align:center;padding-top:40px' }, editing ? 'Empieza añadiendo una categoría.' : text.empty),
      categories.map((cat, ci) => categoryView(cat, ci, editing, menu.currency)),
      editing && h('button', { class: 'add big', onclick: () => categoryForm() }, '+ Añadir categoría'),
    ),
    h('footer', { class: 'foot' }, note && h('p', { class: 'note' }, note), footerLink(editing)),
  );
  app.replaceChildren(view);
  watchActiveCategory();
  if (focusedHandle) document.getElementById(focusedHandle)?.querySelector('.handle')?.focus();
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

function categoryView(cat, index, editing, currency) {
  const items = cat.items || [];
  const text = UI[viewLang];
  const inCat = (m) => m.categories.find((c) => c.id === cat.id);
  return h(
    'section',
    { class: 'category', id: `c-${cat.id}` },
    h(
      'div',
      { class: 'category-head' },
      editing && dragHandle(`Mover la categoría ${cat.name}`, '.category', (from, to) => mutate((m) => moveTo(m.categories, from, to))),
      h('h2', {}, tr(cat, 'name')),
      editing &&
        h(
          'div',
          { class: 'tools' },
          h('button', { onclick: () => categoryForm(cat) }, 'Editar'),
          h(
            'button',
            {
              class: 'danger',
              onclick: () =>
                mutate(
                  (m) => {
                    m.categories = m.categories.filter((c) => c.id !== cat.id);
                  },
                  {
                    message: `Categoría "${cat.name}" eliminada`,
                    undo: () =>
                      mutate((m) => {
                        if (!m.categories.some((c) => c.id === cat.id)) m.categories.splice(index, 0, clone(cat));
                      }),
                  },
                ),
            },
            'Eliminar',
          ),
        ),
    ),
    items.length === 0 && h('p', { class: 'empty' }, editing ? 'Sin productos todavía.' : text.soon),
    items.map((item, ii) => itemView(inCat, item, ii, editing, currency)),
    editing && h('button', { class: 'add', onclick: () => itemForm(cat.id) }, '+ Añadir producto'),
  );
}

function itemView(inCat, item, index, editing, currency) {
  const out = item.available === false;
  const variants = item.variants || [];
  const tags = (item.tags || []).filter((tag) => TAGS.includes(tag));
  const text = UI[viewLang];
  const desc = tr(item, 'desc');
  return h(
    'article',
    { class: out ? 'item out' : 'item', id: `i-${item.id}` },
    h(
      'div',
      { class: 'item-row' },
      editing && dragHandle(`Mover ${item.name}`, '.item', (from, to) => mutate((m) => moveTo(inCat(m)?.items, from, to))),
      h('span', { class: 'item-name' }, tr(item, 'name')),
      out && h('span', { class: 'badge' }, text.soldOut),
      variants.length === 0 && h('span', { class: 'item-price' }, formatPrice(item.price, currency)),
    ),
    tags.length > 0 && h('ul', { class: 'tags' }, tags.map((tag) => h('li', { class: `tag tag-${tag}` }, text.tags[tag]))),
    desc && h('p', { class: 'item-desc' }, desc),
    variants.length > 0 &&
      h(
        'ul',
        { class: 'variants' },
        variants.map((v) => h('li', {}, h('span', {}, tr(v, 'label')), h('span', { class: 'item-price' }, formatPrice(v.price, currency)))),
      ),
    editing &&
      h(
        'div',
        { class: 'tools' },
        h('button', { onclick: () => itemForm(inCat(state.menu).id, item) }, 'Editar'),
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
            onclick: () =>
              mutate(
                (m) => {
                  const c = inCat(m);
                  c.items = c.items.filter((i) => i.id !== item.id);
                },
                {
                  message: `"${item.name}" eliminado`,
                  undo: () =>
                    mutate((m) => {
                      const c = inCat(m);
                      if (c && !c.items.some((i) => i.id === item.id)) c.items.splice(index, 0, clone(item));
                    }),
                },
              ),
          },
          'Eliminar',
        ),
      ),
  );
}

// Resalta en la barra la categoría que se está viendo. `pinnedCategory` es
// la que el visitante acaba de tocar: manda hasta que vuelva a desplazarse
// él mismo (así la última categoría se resalta aunque la página no dé más).
function watchActiveCategory() {
  const links = [...app.querySelectorAll('.cats a')];
  const sections = [...app.querySelectorAll('.category')];
  if (!links.length) return;
  const nav = app.querySelector('.cats');
  const bar = nav.querySelector('.cats-inner');
  let current = null;
  let queued = false;

  const update = () => {
    queued = false;
    const line = nav.getBoundingClientRect().bottom + 24;
    let id = sections[0]?.id;
    for (const section of sections) {
      if (section.getBoundingClientRect().top <= line) id = section.id;
    }
    if (pinnedCategory && sections.some((x) => x.id === pinnedCategory)) id = pinnedCategory;
    if (id === current) return;
    current = id;
    for (const link of links) {
      const on = link.dataset.target === id;
      link.classList.toggle('active', on);
      // Centra la pastilla moviendo solo la barra en horizontal. No usar
      // scrollIntoView aquí: interrumpe el desplazamiento de la página.
      if (on) bar.scrollTo({ left: link.offsetLeft - bar.offsetLeft - (bar.clientWidth - link.offsetWidth) / 2, behavior: 'smooth' });
    }
  };
  const onScroll = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(update);
  };
  const unpin = () => {
    pinnedCategory = null;
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('touchstart', unpin, { passive: true });
  window.addEventListener('wheel', unpin, { passive: true });
  window.addEventListener('keydown', unpin);
  stopWatching = () => {
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('touchstart', unpin);
    window.removeEventListener('wheel', unpin);
    window.removeEventListener('keydown', unpin);
  };
  update();
}

// ---------- Arranque ----------

async function start() {
  // Las direcciones antiguas (?m=atono) pasan al formato limpio (/atono).
  if (new URLSearchParams(location.search).has('m')) history.replaceState(null, '', menuUrl(slug));

  store = await createStore(CONFIG);

  // 1) Pinta al instante la última copia guardada en este dispositivo.
  if (store.mode !== 'demo') {
    const cached = readCache();
    if (cached) {
      state.menu = cached;
      render();
    }
  }

  // 2) Trae la versión actual con una petición ligera.
  const loaded = refresh();

  // 3) Solo si este navegador ya administró antes, recupera la sesión.
  if (store.adminHint()) {
    await loaded;
    startAdmin().catch(() => {});
  }

  // Al volver a la pestaña, el cliente ve los cambios recientes.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !live) refresh();
  });
}

start();
