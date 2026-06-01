/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bean: {
          50: '#faf8f3',
          100: '#f5f0e6',
          200: '#e8dcc4',
          300: '#d6c29a',
          400: '#c4a870',
          500: '#b08d4f',
          600: '#8f7240',
          700: '#6f5833',
          800: '#4d3d24',
          900: '#2d2416',
        },
        cafe: {
          cream: '#f5f0e6',
          brown: '#6f5833',
          gold: '#c4a870',
          dark: '#2d2416',
        }
      }
    },
  },
  plugins: [],
}
