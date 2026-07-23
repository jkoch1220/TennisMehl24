import { useEffect, useState } from 'react';
import { Loader2, Plus, Shield, ShieldCheck, Trash2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { Role, PermissionMap } from '../../types/permissions';
import {
  loadAllRoles,
  createRole,
  updateRole,
  deleteRole,
} from '../../services/rolesService';
import PermissionMatrix from './PermissionMatrix';

/**
 * Admin-only Rollen-Editor (D7): Rollen anlegen/bearbeiten/löschen,
 * Matrix Tool × Aktionen × sensible Felder. System-Rollen (Admin) sind
 * nicht löschbar, ihr Name ist geschützt.
 */
const RolesEditor = () => {
  const { user, isAdmin, refreshPermissions } = useAuth();
  const [roles, setRoles] = useState<Role[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [neueRolle, setNeueRolle] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [permissions, setPermissions] = useState<PermissionMap>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [meldung, setMeldung] = useState('');

  const selectedRole = roles.find((r) => r.$id === selectedId) ?? null;

  const ladeRollen = async () => {
    setLoading(true);
    setRoles(await loadAllRoles());
    setLoading(false);
  };

  useEffect(() => {
    ladeRollen();
  }, []);

  const waehleRolle = (role: Role) => {
    setSelectedId(role.$id);
    setNeueRolle(false);
    setName(role.name);
    setDescription(role.description ?? '');
    setPermissions(structuredClone(role.permissions));
    setMeldung('');
  };

  const starteNeueRolle = () => {
    setSelectedId(null);
    setNeueRolle(true);
    setName('');
    setDescription('');
    setPermissions({});
    setMeldung('');
  };

  const speichern = async () => {
    if (!name.trim()) {
      setMeldung('❌ Bitte einen Rollennamen angeben');
      return;
    }
    setSaving(true);
    setMeldung('');

    const input = { name: name.trim(), description: description.trim(), permissions };
    const result = neueRolle
      ? await createRole(user, input)
      : selectedId
        ? await updateRole(user, selectedId, input)
        : null;

    if (result) {
      await ladeRollen();
      await refreshPermissions();
      setNeueRolle(false);
      setSelectedId(result.$id);
      setMeldung('✅ Rolle gespeichert');
      setTimeout(() => setMeldung(''), 3000);
    } else {
      setMeldung('❌ Speichern fehlgeschlagen');
    }
    setSaving(false);
  };

  const loeschen = async () => {
    if (!selectedRole || selectedRole.isSystem) return;
    if (!confirm(`Rolle "${selectedRole.name}" wirklich löschen? User mit dieser Rolle verlieren die zugehörigen Rechte.`)) {
      return;
    }
    setSaving(true);
    const ok = await deleteRole(user, selectedRole.$id);
    if (ok) {
      await ladeRollen();
      await refreshPermissions();
      setSelectedId(null);
      setMeldung('✅ Rolle gelöscht');
      setTimeout(() => setMeldung(''), 3000);
    } else {
      setMeldung('❌ Löschen fehlgeschlagen');
    }
    setSaving(false);
  };

  if (!isAdmin) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-700">Nur Administratoren haben Zugriff auf den Rollen-Editor.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text flex items-center gap-2 mb-1">
          <Shield className="w-5 h-5" />
          Rollen-Editor
        </h3>
        <p className="text-sm text-gray-600 dark:text-dark-textMuted">
          Rollen definieren, welche Tools und Aktionen erlaubt sind und welche sensiblen Felder
          versteckt werden. User können mehrere Rollen haben — die Rechte addieren sich.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : (
        <>
          {/* Rollen-Liste */}
          <div className="flex flex-wrap gap-2">
            {roles.map((role) => (
              <button
                key={role.$id}
                onClick={() => waehleRolle(role)}
                className={`px-3 py-1.5 rounded-lg border text-sm font-medium flex items-center gap-1.5 transition-colors ${
                  selectedId === role.$id
                    ? 'border-red-500 bg-red-50 text-red-700'
                    : 'border-gray-300 dark:border-dark-border text-gray-700 dark:text-dark-textMuted hover:border-gray-400'
                }`}
              >
                {role.isSystem && <ShieldCheck className="w-4 h-4 text-amber-600" />}
                {role.name}
                <span className="text-xs text-gray-400">({Object.keys(role.permissions).length})</span>
              </button>
            ))}
            <button
              onClick={starteNeueRolle}
              className={`px-3 py-1.5 rounded-lg border text-sm font-medium flex items-center gap-1 transition-colors ${
                neueRolle
                  ? 'border-red-500 bg-red-50 text-red-700'
                  : 'border-dashed border-gray-400 text-gray-600 dark:text-dark-textMuted hover:border-gray-500'
              }`}
            >
              <Plus className="w-4 h-4" />
              Neue Rolle
            </button>
          </div>

          {/* Editor */}
          {(selectedRole || neueRolle) && (
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-4">
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-dark-textMuted mb-1">
                    Name {selectedRole?.isSystem && '(System-Rolle, geschützt)'}
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={saving || selectedRole?.isSystem}
                    className="w-full p-2 border-2 border-gray-300 dark:border-dark-border rounded-lg text-sm focus:border-red-500 focus:outline-none disabled:opacity-60"
                    placeholder="z.B. Produktionsleitung"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-dark-textMuted mb-1">
                    Beschreibung
                  </label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    disabled={saving}
                    className="w-full p-2 border-2 border-gray-300 dark:border-dark-border rounded-lg text-sm focus:border-red-500 focus:outline-none"
                    placeholder="Wofür ist diese Rolle?"
                  />
                </div>
              </div>

              <PermissionMatrix value={permissions} onChange={setPermissions} mode="grant" disabled={saving} />

              <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-dark-border">
                <div className="flex items-center gap-3">
                  {selectedRole && !selectedRole.isSystem && (
                    <button
                      onClick={loeschen}
                      disabled={saving}
                      className="px-3 py-2 text-sm bg-red-50 text-red-600 hover:bg-red-100 rounded-lg flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <Trash2 className="w-4 h-4" />
                      Löschen
                    </button>
                  )}
                  {meldung && <span className="text-sm font-medium">{meldung}</span>}
                </div>
                <button
                  onClick={speichern}
                  disabled={saving}
                  className="px-5 py-2 bg-gradient-to-r from-red-600 to-orange-600 text-white rounded-lg text-sm font-semibold hover:from-red-700 hover:to-orange-700 transition-all disabled:opacity-50 flex items-center gap-2"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {saving ? 'Speichere…' : neueRolle ? 'Rolle anlegen' : 'Änderungen speichern'}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default RolesEditor;
