// Datos iniciales: el menú de ejemplo de Atono y la plantilla en blanco
// que se usa al crear un menú nuevo.

export const newId = () =>
  (crypto.randomUUID ? crypto.randomUUID() : String(Math.random())).replace(/[^a-z0-9]/gi, '').slice(0, 10);

export const DEFAULT_THEME = { bg: '#E8E3D0', ink: '#333333', accent: '#8C8462' };

export function blankMenu(name) {
  return {
    name,
    tagline: '',
    note: '',
    logoUrl: '',
    currency: '$',
    lang2: '',
    theme: { ...DEFAULT_THEME },
    owners: [],
    categories: [],
    updatedAt: Date.now(),
  };
}

const item = (name, price, desc = '') => ({ id: newId(), name, desc, price, available: true });

export function sampleMenu() {
  return {
    ...blankMenu('Atono'),
    tagline: 'Café',
    logoUrl: 'assets/atono-logo.svg',
    categories: [
      {
        id: newId(),
        name: 'Cafés',
        items: [
          item('Espresso', 2, 'Corto e intenso.'),
          item('Americano', 2.5, 'Espresso con agua caliente.'),
          item('Cortado', 2.75, 'Espresso con un toque de leche.'),
          item('Capuchino', 3.25, 'Espresso, leche vaporizada y espuma.'),
          item('Latte', 3.5, 'Suave, con mucha leche cremosa.'),
          item('Mocaccino', 3.75, 'Latte con chocolate.'),
        ],
      },
      {
        id: newId(),
        name: 'Bebidas frías',
        items: [
          item('Café helado', 3.5, 'Espresso doble sobre hielo.'),
          item('Frappé', 4, 'Café batido con hielo y crema.'),
          item('Limonada', 2.5, 'Natural, con hierbabuena.'),
          item('Batido de frutas', 3.75, 'Fruta de temporada.'),
        ],
      },
      {
        id: newId(),
        name: 'Repostería',
        items: [
          item('Croissant', 2.25, 'De mantequilla, horneado cada mañana.'),
          item('Tarta de queso', 3.5),
          item('Brownie', 2.75, 'Chocolate y nueces.'),
          item('Galleta de avena', 1.5),
        ],
      },
      {
        id: newId(),
        name: 'Para comer',
        items: [
          item('Tostada con aguacate', 4.5, 'Pan de masa madre, aguacate y huevo.'),
          item('Sándwich de jamón y queso', 4, 'A la plancha.'),
          item('Ensalada de la casa', 5),
        ],
      },
    ],
  };
}
