/** @type {import('tailwindcss').Config} */
export default {
  // Dark mode follows a class on <html> (set from System / Light / Dark, see src/theme.ts).
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        // B612 was drawn for aircraft cockpit displays: built to be read at a glance.
        hud: ['B612', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Ink and paper swap in dark mode (CSS variables in index.css).
        asphalt: 'rgb(var(--c-asphalt) / <alpha-value>)',
        paper: 'rgb(var(--c-paper) / <alpha-value>)',
        milestone: '#F5C518',
        signal: '#D7263D',
        highway: '#0E6B4F',
      },
    },
  },
  plugins: [],
};
