/** @type {import('tailwindcss').Config} */
export default {
  content: ['./*.html', './src/**/*.js'],
  theme: {
    extend: {
      colors: {
        fmp: {
          bg: '#0f1f15',
          green: '#284637',
          kraft: '#c08a4e',
          'kraft-dark': '#a0703c',
          sage: '#a8c69a',
          cream: '#f3ead8',
          rust: '#e38b6d',
          tile: '#1a3022',
        },
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        serif: ['Cinzel', 'serif'],
      },
      backgroundImage: {
        'main-gradient':
          'radial-gradient(circle at top right, rgba(192, 138, 78, 0.18), transparent 45%), radial-gradient(circle at bottom left, rgba(40, 70, 55, 0.5), transparent 50%)',
        'glass-gradient': 'linear-gradient(180deg, rgba(22, 41, 29, 0.96), rgba(17, 33, 23, 0.98))',
      },
      animation: {
        'fade-in-up': 'fadeInUp 0.6s ease both',
      },
      keyframes: {
        fadeInUp: {
          from: { opacity: '0', transform: 'translateY(20px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
