/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          900: '#0e0f12',
          800: '#15171c',
          700: '#1d2026',
          600: '#2a2e36',
          500: '#3a3f49',
          400: '#5a606b',
          300: '#8a909a',
          200: '#b8bdc7',
          100: '#e6e8ec',
        },
        accent: '#d4a85f',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'Courier', 'monospace'],
        serif: ['"EB Garamond"', 'Georgia', 'serif'],
        hand: ['"Caveat"', '"Reenie Beanie"', 'cursive'],
      },
    },
  },
  plugins: [],
}
