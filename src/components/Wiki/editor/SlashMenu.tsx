import { useEffect, useRef } from 'react';
import type { SlashCommandItem } from './slashCommands';

interface SlashMenuProps {
  items: SlashCommandItem[];
  activeIndex: number;
  position: { x: number; y: number };
  onSelect: (item: SlashCommandItem) => void;
  onHover: (index: number) => void;
}

const SlashMenu = ({ items, activeIndex, position, onSelect, onHover }: SlashMenuProps) => {
  const listRef = useRef<HTMLDivElement>(null);

  // Aktiven Eintrag in den sichtbaren Bereich scrollen
  useEffect(() => {
    const el = listRef.current?.querySelector('[data-active="true"]');
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  if (items.length === 0) return null;

  return (
    <div
      ref={listRef}
      className="fixed z-[120] w-72 max-h-80 overflow-y-auto bg-white dark:bg-slate-800 rounded-xl
                 shadow-2xl border border-gray-200 dark:border-slate-700 py-1.5"
      style={{ left: position.x, top: position.y }}
      // Mousedown nicht zum Editor durchreichen (sonst verliert die Selektion den Fokus)
      onMouseDown={(e) => e.preventDefault()}
    >
      {items.map((item, i) => {
        const Icon = item.icon;
        const isActive = i === activeIndex;
        return (
          <button
            key={item.id}
            data-active={isActive}
            onClick={() => onSelect(item)}
            onMouseEnter={() => onHover(i)}
            className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${
              isActive ? 'bg-red-50 dark:bg-red-900/20' : 'hover:bg-gray-50 dark:hover:bg-slate-700/50'
            }`}
          >
            <span
              className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center border ${
                isActive
                  ? 'border-red-200 dark:border-red-800 bg-white dark:bg-slate-800 text-red-600 dark:text-red-400'
                  : 'border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-500 dark:text-dark-textMuted'
              }`}
            >
              <Icon className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-medium text-gray-900 dark:text-dark-text">{item.title}</div>
              <div className="text-xs text-gray-500 dark:text-dark-textMuted truncate">
                {item.description}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
};

export default SlashMenu;
