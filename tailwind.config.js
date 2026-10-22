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
        brand: {
          blue: '#8FB8FF',
          'blue-dark': '#2F6FE4',
          yellow: '#FFE27A',
          'yellow-dark': '#F5C400',
          silver: '#D9DEE6',
          'silver-dark': '#A9B2BF',
          // Warm gold, for the notebook-style Home page.
          gold: '#FFF0B3',
          'gold-dark': '#E6B800',
          black: '#0B0F1A',
          'black-soft': '#141A2B',
        }
      }
    },
  },
  plugins: [],
}
