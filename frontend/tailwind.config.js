/** @type {import('tailwindcss').Config} */
module.exports = {
  // Scan all TSX source files for class usage
  content: [
    './src/**/*.{ts,tsx}',
  ],
  // WeChat Mini-Program doesn't support the DOM, so disable core
  // plugins that rely on `*` or `html` selectors.
  corePlugins: {
    preflight: false, // Disable Tailwind reset — conflicts with mini-program base styles
  },
  // Ensure we don't generate CSS that references unavailable properties
  theme: {
    extend: {
      colors: {
        // Radar brand palette
        primary: '#6366f1',   // Indigo
        secondary: '#ec4899', // Pink
        dark: '#1e1b4b',      // Deep indigo
        muted: '#6b7280',     // Gray
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'PingFang SC',
          'Hiragino Sans GB',
          'Microsoft YaHei',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
};
