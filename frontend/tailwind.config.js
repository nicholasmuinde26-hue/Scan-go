/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#F3FAEC', 100: '#E3F5CC', 200: '#CBEBA6', 300: '#AEDD85', 400: '#7CC24F',
          500: '#4BA82E', 600: '#3A8F27', 700: '#1F7A3A', 800: '#17612F', 900: '#124D27', 950: '#0A2F18',
        },
        navy: {
          50: '#EEF3FA', 100: '#DCE6F4', 200: '#C9D8EF', 300: '#A8C0E4', 400: '#7FA0D6',
          500: '#3B69B0', 600: '#123A7A', 700: '#0E2A5C', 800: '#0B2249', 900: '#081A38', 950: '#050F22',
        },
        azure: {
          50: '#E6F0FF', 100: '#D3E5FF', 200: '#AACBFF', 300: '#7CAEF7', 400: '#5B9BF0',
          500: '#2F7DE1', 600: '#1E6FD9', 700: '#1859B0', 800: '#144A91', 900: '#0F366B', 950: '#08234A',
        },
        safari: {
          green: '#00833e',
          red: '#e30613',
          dark: '#1e293b',
        },
      },
    },
  },
  plugins: [],
};
