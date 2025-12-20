/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class', // Enable class-based dark mode
  theme: {
    extend: {
      // Custom colors for professional dark mode
      colors: {
        // Light mode colors (already defined by default)
        light: {
          bg: '#ffffff',
          surface: '#f8fafc',
          border: '#e2e8f0',
          text: '#1e293b',
          textMuted: '#64748b',
        },
        // Dark mode colors - defined as flat colors so Tailwind can generate utilities
        // These are accessed as dark:bg-dark-bg, dark:text-dark-text, etc.
        'dark-bg': '#0f172a',      // Deep slate background
        'dark-surface': '#1e293b',  // Elevated surface
        'dark-border': '#334155',   // Subtle borders
        'dark-text': '#f1f5f9',     // High contrast text
        'dark-textMuted': '#94a3b8', // Muted text with good readability
        'dark-accent': '#3b82f6',   // Blue accent
        // Also keep nested structure for backward compatibility
        dark: {
          bg: '#0f172a',
          surface: '#1e293b',
          border: '#334155',
          text: '#f1f5f9',
          textMuted: '#94a3b8',
          accent: '#3b82f6',
        },
      },
      // Enhanced box shadows for dark mode
      // These are accessed as shadow-dark-sm, shadow-dark-md, etc.
      // And with dark mode: dark:shadow-dark-lg
      boxShadow: {
        'dark-sm': '0 1px 2px 0 rgba(0, 0, 0, 0.3)',
        'dark-md': '0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -1px rgba(0, 0, 0, 0.2)',
        'dark-lg': '0 10px 15px -3px rgba(0, 0, 0, 0.3), 0 4px 6px -2px rgba(0, 0, 0, 0.2)',
        'dark-xl': '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2)',
      },
    },
  },
  plugins: [],
}

