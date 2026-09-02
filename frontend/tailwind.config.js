/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      screens: {
        xs: "375px",
      },
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
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeDown: {
          '0%': { opacity: '0', transform: 'translateY(-8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInLeft: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        countUp: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
      animation: {
        'fade-in':        'fadeIn 200ms ease-out both',
        'fade-up':        'fadeUp 240ms ease-out both',
        'fade-down':      'fadeDown 200ms ease-out both',
        'slide-in-left':  'slideInLeft 260ms ease-out both',
        'scale-in':       'scaleIn 180ms ease-out both',
        'shimmer':        'shimmer 1.6s infinite linear',
      },
    },
  },
  plugins: [],
}
