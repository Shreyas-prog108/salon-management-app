/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
    './context/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        plum: {
          DEFAULT: '#7C3D6B',
          light: '#A85C8A',
          dark: '#5C2D52',
          bg: '#2D1428'
        },
        blush: '#F5EAF2',
        textDark: '#2D1428',
        primary: {
          DEFAULT: '#7C3D6B',
          dark: '#5C2D52',
          soft: '#F5EAF2',
        },
        secondary: '#A85C8A',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'Segoe UI', 'Tahoma', 'Geneva', 'Verdana', 'sans-serif'],
        serif: ['var(--font-playfair)', 'serif'],
      },
      backgroundImage: {
        'plum-gradient': 'linear-gradient(135deg, #7C3D6B, #A85C8A)',
      },
      boxShadow: {
        'glass': '0 8px 32px 0 rgba(124, 61, 107, 0.2)',
        'card-lift': '0 10px 25px -5px rgba(124, 61, 107, 0.15)',
      }
    },
  },
  plugins: [],
}

