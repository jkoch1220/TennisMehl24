import { useEffect, useMemo, useState } from 'react';
import { ALL_TOOLS, DEFAULT_TOOL_VISIBILITY } from '../constants/tools';

const STORAGE_KEY = 'tm_tool_visibility_v1';

type VisibilityMap = Record<string, boolean>;

function loadFromStorage(): VisibilityMap {
  if (typeof window === 'undefined') return DEFAULT_TOOL_VISIBILITY;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as VisibilityMap;
      return { ...DEFAULT_TOOL_VISIBILITY, ...parsed };
    }
  } catch (error) {
    console.warn('⚠️ Konnte Tool-Settings nicht laden:', error);
  }
  return DEFAULT_TOOL_VISIBILITY;
}

export function useToolSettings() {
  const [visibility, setVisibility] = useState<VisibilityMap>(loadFromStorage);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(visibility));
  }, [visibility]);

  const setToolVisibility = (id: string, value: boolean) => {
    setVisibility((prev) => ({ ...prev, [id]: value }));
  };

  const toggleTool = (id: string) => {
    setVisibility((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const resetVisibility = () => setVisibility(DEFAULT_TOOL_VISIBILITY);

  const enabledTools = useMemo(
    () => ALL_TOOLS.filter((tool) => visibility[tool.id]),
    [visibility]
  );

  return {
    visibility,
    enabledTools,
    setToolVisibility,
    toggleTool,
    resetVisibility,
  };
}

