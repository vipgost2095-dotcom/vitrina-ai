/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        tg: {
          bg: 'var(--tg-theme-bg-color, #ffffff)',
          text: 'var(--tg-theme-text-color, #111111)',
          hint: 'var(--tg-theme-hint-color, #999999)',
          button: 'var(--tg-theme-button-color, #2563eb)',
          buttonText: 'var(--tg-theme-button-text-color, #ffffff)',
        },
      },
    },
  },
  plugins: [],
};
