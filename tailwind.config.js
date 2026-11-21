/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        // B612 was drawn for aircraft cockpit displays: built to be read at a glance.
        hud: ['B612', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        asphalt: '#1F2A30',
        paper: '#F4F6F5',
        milestone: '#F5C518',
        signal: '#D7263D',
        highway: '#0E6B4F',
      },
    },
  },
  plugins: [],
};
