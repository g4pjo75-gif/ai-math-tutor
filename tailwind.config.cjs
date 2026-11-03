// tailwind.config.cjs
module.exports = {
  darkMode: 'class',
  content: [
    './math/**/*.{html,js}',
    './english/**/*.{html,js}',
    './shared/**/*.js'
  ],
  theme: {
    extend: {
      colors: {
        chalk: {
          dark: '#142820',
          mid: '#1e3a2f'
        },
        english: {
          dark: '#0f172a',
          mid: '#1e3a5f',
          light: '#2563eb'
        }
      }
    }
  }
};
