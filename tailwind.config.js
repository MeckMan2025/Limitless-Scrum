/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./helper/index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      animation: {
        'spin-slow': 'spin 2s linear infinite',
      },
      colors: {
        // Limitless Scrum palette: blue, black, yellow and silver.
        //
        // The fills (blue, yellow, silver, gold) are all light, so text on
        // them is always brand-black, never white. They are too light to be
        // text on white themselves: blue and yellow text on a light surface
        // uses the -ink shades, which read at 4.5:1 or better on white.
        brand: {
          blue: '#8FB8FF',
          'blue-dark': '#2F6FE4',
          'blue-ink': '#1D4ED8',
          yellow: '#FFE27A',
          'yellow-dark': '#F5C400',
          silver: '#D9DEE6',
          'silver-dark': '#A9B2BF',
          // Warm gold, for the notebook-style Home page.
          gold: '#FFF0B3',
          'gold-dark': '#E6B800',
          'gold-ink': '#8A6100',
          black: '#0B0F1A',
          'black-soft': '#141A2B',
          // A panel's edge on the navy page.
          'black-line': '#2A3452',
        }
      }
    },
  },
  plugins: [],
}
