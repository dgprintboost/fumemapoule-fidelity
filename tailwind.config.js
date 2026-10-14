/** @type {import('tailwindcss').Config} */
export default {
  content: ['./*.html', './src/**/*.js'],
  theme: {
    extend: {
      colors: {
        // Couleurs lues dans des variables CSS (src/style.css) : la carte bleue redéfinit les variables
        // (classe theme-blue sur <html>) et toute la page change de couleur avec le même design.
        fmp: {
          bg: 'rgb(var(--fmp-bg) / <alpha-value>)',
          green: 'rgb(var(--fmp-green) / <alpha-value>)',
          kraft: 'rgb(var(--fmp-kraft) / <alpha-value>)',
          'kraft-dark': 'rgb(var(--fmp-kraft-dark) / <alpha-value>)',
          sage: 'rgb(var(--fmp-sage) / <alpha-value>)',
          cream: 'rgb(var(--fmp-cream) / <alpha-value>)',
          rust: 'rgb(var(--fmp-rust) / <alpha-value>)',
          tile: 'rgb(var(--fmp-tile) / <alpha-value>)',
          // Couleurs fixes de la carte bleue, pour la signaler dans l'espace équipe (resté vert).
          sky: '#8ecae6',
          'sky-deep': '#1f4a63',
        },
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        serif: ['Cinzel', 'serif'],
      },
      backgroundImage: {
        'main-gradient':
          'radial-gradient(circle at top right, rgb(var(--fmp-kraft) / 0.18), transparent 45%), radial-gradient(circle at bottom left, rgb(var(--fmp-green) / 0.5), transparent 50%)',
        'glass-gradient': 'linear-gradient(180deg, rgb(var(--fmp-glass-top) / 0.96), rgb(var(--fmp-glass-bottom) / 0.98))',
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
