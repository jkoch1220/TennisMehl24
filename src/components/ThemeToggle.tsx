import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

const ThemeToggle: React.FC = () => {
  const { isDark, toggleTheme } = useTheme();
  
  // Debug: Log theme state
  React.useEffect(() => {
    console.log('Theme changed:', isDark ? 'dark' : 'light');
    console.log('HTML classes:', document.documentElement.className);
  }, [isDark]);

  return (
    <button
      onClick={toggleTheme}
      className="
        relative p-2 rounded-lg transition-all duration-300 ease-in-out
        bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700
        border border-gray-300 dark:border-gray-600
        focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
        dark:focus:ring-offset-gray-900
        group
      "
      aria-label={isDark ? 'Zu hellem Design wechseln' : 'Zu dunklem Design wechseln'}
    >
      <div className="relative w-5 h-5">
        {/* Sun Icon */}
        <Sun
          className={`
            absolute inset-0 w-5 h-5 text-amber-500 transition-all duration-300 ease-in-out
            ${isDark 
              ? 'opacity-0 scale-0 rotate-180' 
              : 'opacity-100 scale-100 rotate-0'
            }
          `}
        />
        
        {/* Moon Icon */}
        <Moon
          className={`
            absolute inset-0 w-5 h-5 text-indigo-500 transition-all duration-300 ease-in-out
            ${isDark 
              ? 'opacity-100 scale-100 rotate-0' 
              : 'opacity-0 scale-0 -rotate-180'
            }
          `}
        />
      </div>

      {/* Subtle glow effect on hover */}
      <div className={`
        absolute inset-0 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300
        ${isDark 
          ? 'bg-gradient-to-r from-indigo-500/10 to-purple-500/10' 
          : 'bg-gradient-to-r from-amber-400/10 to-orange-400/10'
        }
      `} />
    </button>
  );
};

export default ThemeToggle;