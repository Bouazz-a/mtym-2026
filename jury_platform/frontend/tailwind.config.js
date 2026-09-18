/** @type {import('tailwindcss').Config} */
// Colors and fonts come from the CSS variables and helpers in
// src/index.css — Tailwind only provides layout/spacing utilities here.
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
