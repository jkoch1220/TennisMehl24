import { useState } from 'react';
import { Check, EyeOff, Plus, X } from 'lucide-react';
import { ALL_TOOLS } from '../../constants/tools';
import { getSensitiveFields } from '../../constants/sensitiveFields';
import { PermissionAction, PermissionMap, PERMISSION_ACTIONS } from '../../types/permissions';

const ACTION_LABELS: Record<PermissionAction, string> = {
  view: 'Ansehen',
  create: 'Anlegen',
  edit: 'Bearbeiten',
  delete: 'Löschen',
  export: 'Exportieren',
};

interface PermissionMatrixProps {
  value: PermissionMap;
  onChange: (next: PermissionMap) => void;
  /**
   * grant: Rechte gewähren (Rollen, Zusatz-Rechte) — Häkchen = erlaubt.
   * deny:  Rechte entziehen — Häkchen = entzogen, plus "komplett sperren".
   */
  mode: 'grant' | 'deny';
  disabled?: boolean;
}

/**
 * Matrix Tool × Aktionen × sensible Felder. Die Tool-Liste kommt immer aus
 * ALL_TOOLS — neue Tools erscheinen hier automatisch. Einträge zu unbekannten
 * toolIds (z.B. künftiges Audit-Log-Tool) bleiben beim Speichern erhalten.
 */
const PermissionMatrix = ({ value, onChange, mode, disabled = false }: PermissionMatrixProps) => {
  const [customFieldInputs, setCustomFieldInputs] = useState<Record<string, string>>({});

  const isDeny = mode === 'deny';

  const updateTool = (toolId: string, updater: (entry: PermissionMap[string] | undefined) => PermissionMap[string] | undefined) => {
    const next = { ...value };
    const updated = updater(next[toolId]);
    if (updated === undefined) {
      delete next[toolId];
    } else {
      next[toolId] = updated;
    }
    onChange(next);
  };

  const toggleTool = (toolId: string) => {
    updateTool(toolId, (entry) => {
      if (entry) return undefined; // Zeile deaktivieren = Eintrag entfernen
      return isDeny
        ? { enabled: true, actions: [] } // deny: erst Aktionen/Sperre wählen
        : { enabled: true, actions: ['view'] };
    });
  };

  const toggleAction = (toolId: string, action: PermissionAction) => {
    updateTool(toolId, (entry) => {
      if (!entry) return entry;
      const actions = entry.actions.includes(action)
        ? entry.actions.filter((a) => a !== action)
        : [...entry.actions, action];
      return { ...entry, actions };
    });
  };

  const toggleFullBlock = (toolId: string) => {
    updateTool(toolId, (entry) => {
      if (!entry) return entry;
      return { ...entry, enabled: entry.enabled === false ? true : false };
    });
  };

  const toggleHiddenField = (toolId: string, fieldKey: string) => {
    updateTool(toolId, (entry) => {
      if (!entry) return entry;
      const current = entry.hiddenFields ?? [];
      const hiddenFields = current.includes(fieldKey)
        ? current.filter((f) => f !== fieldKey)
        : [...current, fieldKey];
      return { ...entry, hiddenFields: hiddenFields.length > 0 ? hiddenFields : undefined };
    });
  };

  const addCustomField = (toolId: string) => {
    const key = (customFieldInputs[toolId] ?? '').trim();
    if (!key) return;
    toggleHiddenField(toolId, key);
    setCustomFieldInputs((prev) => ({ ...prev, [toolId]: '' }));
  };

  return (
    <div className="space-y-1.5 max-h-[45vh] overflow-y-auto pr-1">
      {ALL_TOOLS.map((tool) => {
        const entry = value[tool.id];
        const aktiv = !!entry;
        const komplettGesperrt = isDeny && entry?.enabled === false;
        const knownFields = getSensitiveFields(tool.id);
        const customFields = (entry?.hiddenFields ?? []).filter(
          (f) => !knownFields.some((k) => k.key === f)
        );

        return (
          <div
            key={tool.id}
            className={`rounded-lg border px-3 py-2 transition-colors ${
              aktiv
                ? isDeny
                  ? 'border-red-300 bg-red-50/60 dark:bg-red-950/20'
                  : 'border-green-300 bg-green-50/60 dark:bg-green-950/20'
                : 'border-gray-200 dark:border-dark-border'
            }`}
          >
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
              <label className="flex items-center gap-2 cursor-pointer min-w-[220px] flex-1">
                <input
                  type="checkbox"
                  checked={aktiv}
                  onChange={() => toggleTool(tool.id)}
                  disabled={disabled}
                  className="w-4 h-4 text-red-600 border-gray-300 dark:border-dark-border rounded focus:ring-red-500"
                />
                <span className="font-medium text-sm text-gray-900 dark:text-dark-text">{tool.name}</span>
              </label>

              {aktiv && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  {isDeny && (
                    <label className="flex items-center gap-1.5 cursor-pointer text-xs font-semibold text-red-700 dark:text-red-400">
                      <input
                        type="checkbox"
                        checked={komplettGesperrt}
                        onChange={() => toggleFullBlock(tool.id)}
                        disabled={disabled}
                        className="w-3.5 h-3.5 text-red-600 border-gray-300 rounded"
                      />
                      Komplett sperren
                    </label>
                  )}
                  {!komplettGesperrt &&
                    PERMISSION_ACTIONS.map((action) => (
                      <label
                        key={action}
                        className="flex items-center gap-1 cursor-pointer text-xs text-gray-700 dark:text-dark-textMuted"
                      >
                        <input
                          type="checkbox"
                          checked={entry.actions.includes(action)}
                          onChange={() => toggleAction(tool.id, action)}
                          disabled={disabled}
                          className="w-3.5 h-3.5 text-red-600 border-gray-300 rounded"
                        />
                        {ACTION_LABELS[action]}
                      </label>
                    ))}
                </div>
              )}
            </div>

            {/* Sensible Felder */}
            {aktiv && !komplettGesperrt && (knownFields.length > 0 || customFields.length > 0) && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-6">
                <EyeOff className="w-3.5 h-3.5 text-gray-400" />
                <span className="text-xs text-gray-500 dark:text-dark-textMuted mr-1">
                  {isDeny ? 'Zusätzlich verstecken:' : 'Verstecken:'}
                </span>
                {knownFields.map((field) => {
                  const versteckt = entry.hiddenFields?.includes(field.key) ?? false;
                  return (
                    <button
                      key={field.key}
                      type="button"
                      onClick={() => toggleHiddenField(tool.id, field.key)}
                      disabled={disabled}
                      className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                        versteckt
                          ? 'bg-amber-100 border-amber-400 text-amber-800'
                          : 'bg-white dark:bg-dark-bg border-gray-300 dark:border-dark-border text-gray-600 dark:text-dark-textMuted'
                      }`}
                      title={versteckt ? 'Feld ist versteckt — klicken zum Einblenden' : 'Klicken zum Verstecken'}
                    >
                      {versteckt ? '🔒 ' : ''}
                      {field.label}
                    </button>
                  );
                })}
                {customFields.map((fieldKey) => (
                  <button
                    key={fieldKey}
                    type="button"
                    onClick={() => toggleHiddenField(tool.id, fieldKey)}
                    disabled={disabled}
                    className="text-xs px-2 py-0.5 rounded-full border bg-amber-100 border-amber-400 text-amber-800 flex items-center gap-1"
                    title="Eigenes Feld — klicken zum Entfernen"
                  >
                    🔒 {fieldKey}
                    <X className="w-3 h-3" />
                  </button>
                ))}
                <span className="inline-flex items-center gap-1">
                  <input
                    type="text"
                    value={customFieldInputs[tool.id] ?? ''}
                    onChange={(e) =>
                      setCustomFieldInputs((prev) => ({ ...prev, [tool.id]: e.target.value }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addCustomField(tool.id);
                      }
                    }}
                    placeholder="Feld-Schlüssel…"
                    disabled={disabled}
                    className="text-xs px-2 py-0.5 border border-gray-300 dark:border-dark-border rounded-full w-28 bg-white dark:bg-dark-bg"
                  />
                  <button
                    type="button"
                    onClick={() => addCustomField(tool.id)}
                    disabled={disabled}
                    className="p-0.5 text-gray-500 hover:text-gray-700"
                    title="Eigenes sensibles Feld hinzufügen"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </span>
              </div>
            )}
          </div>
        );
      })}

      <p className="text-[11px] text-gray-400 dark:text-dark-textMuted flex items-center gap-1 pt-1">
        <Check className="w-3 h-3" />
        {isDeny
          ? 'Häkchen = wird entzogen. Entzogene Rechte gewinnen immer gegen Rollen und Zusatz-Rechte.'
          : 'Häkchen = erlaubt. Rechte mehrerer Rollen addieren sich.'}
      </p>
    </div>
  );
};

export default PermissionMatrix;
