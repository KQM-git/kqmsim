const base = require('../tailwind.config.cjs');

// KQM neutrals apply to shared result components only in this app's build.
module.exports = {
  ...base,
  theme: {
    ...base.theme,
    extend: {
      ...base.theme.extend,
      colors: {
        ...base.theme.extend.colors,
        'bp-header-color': '#2d282f',
        'bp-card-color': '#2d282f',
        'bp-bg': '#232024',
        'bp4-black': '#1c191e',
        'bp4-dark-gray': {100: '#232024', 200: '#2d282f', 300: '#362e3a', 400: '#423745', 500: '#514358'},
        gray: {50: '#faf8fc', 100: '#f0eaf4', 200: '#e1d7e8', 300: '#d1c6d8', 400: '#baabc4', 500: '#8e7d99', 600: '#66576e', 700: '#423745', 800: '#2d282f', 900: '#232024'},
      },
    },
  },
};
