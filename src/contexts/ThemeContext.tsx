import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface ThemeContextType {
  isDark: boolean;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const [isDark, setIsDark] = useState(() => {
    // Initialize from sessionStorage or default to false
    const savedTheme = sessionStorage.getItem('tennismehl_theme');
    return savedTheme === 'dark';
  });

  // Apply theme to document on mount and theme change
  useEffect(() => {
    const root = document.documentElement;

    if (isDark) {
      root.classList.add('dark');
      // Don't override body styles - let Tailwind handle it
      sessionStorage.setItem('tennismehl_theme', 'dark');
    } else {
      root.classList.remove('dark');
      // Don't override body styles - let Tailwind handle it
      sessionStorage.setItem('tennismehl_theme', 'light');
    }
  }, [isDark]);

  const toggleTheme = () => {
    setIsDark(prev => !prev);
  };

  const value: ThemeContextType = {
    isDark,
    toggleTheme,
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};

// Hook for using theme context
export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};