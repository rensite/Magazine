/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Pro-tool palette: cool greys with slight blue undertone, wider
        // contrast between layers so panels/inputs are clearly distinct.
        ink: {
          900: '#0f1115', // app background
          800: '#191c22', // sidebar / page settings
          700: '#23272f', // toolbar
          600: '#2c313a', // inputs
          500: '#3a4150', // input hover
          400: '#5b6473', // muted text
          300: '#8c95a3', // secondary text
          200: '#c8ced8', // primary text
          100: '#eef0f4', // pure light text
        },
        // Subtle divider colour; use with explicit opacity for borders.
        divider: 'rgba(255,255,255,0.06)',
        // Brand gold reserved for Stan logo + paper texture cues only.
        gold: '#d4a85f',
        // Functional interaction accent (selection, hover, focus rings).
        accent: '#0d99ff',
        'accent-soft': 'rgba(13,153,255,0.18)',
        'guide': '#f43f5e', // smart-guide rose
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
