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
        // Dark mode colors - Apple-inspired, eye-friendly palette
        // Primary backgrounds
        'dark-bg': '#0f172a',           // Deep slate - main background
        'dark-surface': '#1e293b',      // Elevated surface - cards
        'dark-surfaceHover': '#273548', // Hover state for surfaces
        'dark-elevated': '#334155',     // Even more elevated (modals, dropdowns)
        // Borders
        'dark-border': '#3f4f63',       // Subtle but visible borders
        'dark-borderLight': '#475569',  // Lighter border for emphasis
        // Text
        'dark-text': '#f1f5f9',         // Primary text - high contrast
        'dark-textMuted': '#94a3b8',    // Secondary text - good readability
        'dark-textSubtle': '#64748b',   // Tertiary text - subtle info
        // Accents - saturated for better visibility on dark
        'dark-accent': '#60a5fa',       // Blue accent (brighter)
        'dark-accentGreen': '#4ade80',  // Green accent
        'dark-accentRed': '#f87171',    // Red accent
        'dark-accentOrange': '#fb923c', // Orange accent
        'dark-accentPurple': '#a78bfa', // Purple accent
        // Input backgrounds
        'dark-input': '#1e293b',        // Input background
        'dark-inputFocus': '#273548',   // Input focus background
        // Status colors for dark mode (softer, less harsh)
        'dark-success': '#166534',      // Success background
        'dark-successText': '#86efac',  // Success text
        'dark-warning': '#854d0e',      // Warning background
        'dark-warningText': '#fde047',  // Warning text
        'dark-error': '#991b1b',        // Error background
        'dark-errorText': '#fca5a5',    // Error text
        'dark-info': '#1e40af',         // Info background
        'dark-infoText': '#93c5fd',     // Info text
        // Also keep nested structure for backward compatibility
        dark: {
          bg: '#0f172a',
          surface: '#1e293b',
          border: '#3f4f63',
          text: '#f1f5f9',
          textMuted: '#94a3b8',
          accent: '#60a5fa',
        },
      },
      // Enhanced box shadows for dark mode
      boxShadow: {
        'dark-sm': '0 1px 2px 0 rgba(0, 0, 0, 0.4)',
        'dark-md': '0 4px 6px -1px rgba(0, 0, 0, 0.4), 0 2px 4px -1px rgba(0, 0, 0, 0.3)',
        'dark-lg': '0 10px 15px -3px rgba(0, 0, 0, 0.4), 0 4px 6px -2px rgba(0, 0, 0, 0.3)',
        'dark-xl': '0 20px 25px -5px rgba(0, 0, 0, 0.4), 0 10px 10px -5px rgba(0, 0, 0, 0.3)',
        // Glow effects for dark mode
        'dark-glow-blue': '0 0 20px rgba(96, 165, 250, 0.3)',
        'dark-glow-green': '0 0 20px rgba(74, 222, 128, 0.3)',
        'dark-glow-red': '0 0 20px rgba(248, 113, 113, 0.3)',
        'dark-glow-purple': '0 0 20px rgba(167, 139, 250, 0.3)',
      },
    },
  },
  plugins: [],
}

