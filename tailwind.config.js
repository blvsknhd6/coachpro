/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          900: '#1e1b4b',
        }
      }
    }
  },
  plugins: [],
  safelist: [
    { pattern: /bg-(pink|brand)-(50|100|500|600|700)/ },
    { pattern: /text-(pink|brand)-(600|700)/ },
    { pattern: /border-(pink|brand)-(200|300)/ },
    { pattern: /hover:bg-(pink|brand)-(50|700)/ },
    { pattern: /focus:ring-(pink|brand)-400/ },
  ]
}
