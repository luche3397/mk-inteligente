/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        slatebase: '#0f172a',
      },
      boxShadow: {
        glass: '0 20px 45px rgba(15, 23, 42, 0.35)',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      backgroundImage: {
        haze:
          'radial-gradient(circle at top left, rgba(56, 189, 248, 0.16), transparent 28%), radial-gradient(circle at top right, rgba(59, 130, 246, 0.18), transparent 24%), linear-gradient(160deg, #0f172a 0%, #111827 48%, #020617 100%)',
      },
    },
  },
  plugins: [],
};
