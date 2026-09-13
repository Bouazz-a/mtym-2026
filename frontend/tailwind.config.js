/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Open Sans', 'sans-serif'],
        heading: ['Montserrat', 'sans-serif'],
      },
      colors: {
        base: '#122019',
        primary: {
          DEFAULT: '#F6A806',
          foreground: '#122019',
        },
        secondary: {
          DEFAULT: '#629F73',
          foreground: '#ffffff',
        },
        contrast: '#244B3A',
        border: 'var(--border)',
        background: 'var(--background)',
        foreground: 'var(--foreground)',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [],
}