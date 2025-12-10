import React, { useState, useEffect } from 'react';
import { Users, Check, X, Trash2, RefreshCw, User as UserIcon, Loader2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { ALL_TOOLS } from '../../constants/tools';
import { 
  getUserPermissions, 
  setUserPermissions,
  loadAllPermissions,
} from '../../services/permissionsService';
import { 
  getCachedUsersList,
  type CachedUser
} from '../../services/userCacheService';

const UserManagement: React.FC = () => {
  const { user, isAdmin: currentUserIsAdmin, refreshPermissions } = useAuth();
  const [allUsers, setAllUsers] = useState<CachedUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [selectedTools, setSelectedTools] = useState<Set<string>>(new Set());
  const [allToolsEnabled, setAllToolsEnabled] = useState(true);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Lade User aus Cache
  useEffect(() => {
    loadUsers();
  }, [user]);

  const loadUsers = () => {
    const users = getCachedUsersList();
    // Filtere den aktuellen User aus (man kann sich selbst nicht bearbeiten)
    const filtered = users.filter(u => u.$id !== user?.$id);
    setAllUsers(filtered);
  };

  // Berechtigungen für ausgewählten User laden (async)
  useEffect(() => {
    if (selectedUser) {
      loadPermissionsForUser(selectedUser);
    }
  }, [selectedUser]);

  const loadPermissionsForUser = async (userId: string) => {
    setLoading(true);
    try {
      const permissions = await getUserPermissions(userId);
      console.log('📋 Lade Permissions für User:', userId, permissions);
      
      if (permissions.allowedTools === null) {
        // null = alle Tools erlaubt (noch keine Einschränkungen)
        setAllToolsEnabled(true);
        setSelectedTools(new Set(ALL_TOOLS.map(t => t.id)));
      } else if (permissions.allowedTools.length === 0) {
        // Leeres Array = keine Tools erlaubt
        setAllToolsEnabled(false);
        setSelectedTools(new Set());
      } else {
        // Spezifische Tools erlaubt
        setAllToolsEnabled(false);
        setSelectedTools(new Set(permissions.allowedTools));
      }
      setSaved(false);
    } catch (error) {
      console.error('❌ Fehler beim Laden der Permissions:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!currentUserIsAdmin) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-700">
          Nur Administratoren haben Zugriff auf die Benutzerverwaltung.
        </p>
      </div>
    );
  }

  const handleToggleTool = (toolId: string) => {
    const newSelected = new Set(selectedTools);
    if (newSelected.has(toolId)) {
      newSelected.delete(toolId);
    } else {
      newSelected.add(toolId);
    }
    setSelectedTools(newSelected);
    setAllToolsEnabled(false);
    setSaved(false);
  };

  const handleToggleAllTools = () => {
    if (allToolsEnabled) {
      setSelectedTools(new Set());
      setAllToolsEnabled(false);
    } else {
      setSelectedTools(new Set(ALL_TOOLS.map(t => t.id)));
      setAllToolsEnabled(true);
    }
    setSaved(false);
  };

  const handleSave = async () => {
    if (!selectedUser || !user) return;

    setSaving(true);
    try {
      // null = alle erlaubt, sonst spezifische Tools
      const allowedTools = allToolsEnabled ? null : Array.from(selectedTools);
      console.log('💾 Speichere Permissions:', { user: selectedUser, allowedTools });
      
      const success = await setUserPermissions(user, selectedUser, allowedTools);
      
      if (success) {
        setSaved(true);
        // Permissions Cache neu laden damit alle Änderungen reflektiert werden
        await loadAllPermissions();
        if (refreshPermissions) {
          await refreshPermissions();
        }
        setTimeout(() => setSaved(false), 3000);
      }
    } catch (error) {
      console.error('❌ Fehler beim Speichern:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveUser = async (userId: string) => {
    const userToRemove = allUsers.find(u => u.$id === userId);
    if (confirm(`Berechtigungen für "${userToRemove?.name || userId}" wirklich zurücksetzen? (Alle Tools werden erlaubt)`)) {
      setSaving(true);
      try {
        if (user) {
          await setUserPermissions(user, userId, null);
          await loadAllPermissions();
          if (refreshPermissions) {
            await refreshPermissions();
          }
        }
        if (selectedUser === userId) {
          setSelectedUser(null);
        }
      } catch (error) {
        console.error('❌ Fehler beim Zurücksetzen:', error);
      } finally {
        setSaving(false);
      }
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-4">
          <Users className="w-5 h-5" />
          Benutzerverwaltung
        </h3>
        <p className="text-sm text-gray-600 mb-4">
          Legen Sie fest, welche Tools andere Benutzer sehen dürfen. 
          Admins haben immer Zugriff auf alle Tools.
        </p>
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4">
          <p className="text-sm text-green-800 font-medium">
            ✅ Berechtigungen werden zentral in Appwrite gespeichert und gelten für alle Geräte.
          </p>
        </div>
      </div>

      {/* User Auswahl */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-semibold text-gray-700">
            Benutzer auswählen
          </label>
          <button
            onClick={loadUsers}
            className="text-sm text-gray-600 hover:text-gray-700 font-medium flex items-center gap-1"
            title="Liste aktualisieren"
          >
            <RefreshCw className="w-4 h-4" />
            Aktualisieren
          </button>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
          <div className="flex items-start gap-2">
            <UserIcon className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm text-blue-800 font-medium mb-1">
                Automatisch erkannt
              </p>
              <p className="text-xs text-blue-700">
                User werden automatisch beim Login erfasst und hier angezeigt.
                Wenn ein User fehlt, muss er sich einmal einloggen.
              </p>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <select
            value={selectedUser || ''}
            onChange={(e) => setSelectedUser(e.target.value || null)}
            className="flex-1 p-3 border-2 border-gray-300 rounded-lg focus:border-red-500 focus:outline-none transition-colors"
            disabled={saving}
          >
            <option value="">-- Benutzer wählen --</option>
            {allUsers.map((u) => (
              <option key={u.$id} value={u.$id}>
                {u.name} ({u.email}) {u.labels.includes('admin') ? '👑 Admin' : ''}
              </option>
            ))}
          </select>
          {selectedUser && (
            <button
              onClick={() => handleRemoveUser(selectedUser)}
              disabled={saving}
              className="p-3 bg-orange-50 text-orange-600 hover:bg-orange-100 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
              title="Berechtigungen zurücksetzen"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          )}
        </div>

        {allUsers.length === 0 && (
          <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-sm text-yellow-800 mb-2 font-medium">
              Noch keine anderen User erfasst
            </p>
            <p className="text-xs text-yellow-700">
              User werden automatisch beim ersten Login erfasst. 
              Bitten Sie andere User, sich einmal einzuloggen, dann erscheinen sie hier.
            </p>
          </div>
        )}
      </div>

      {/* Tool-Berechtigungen */}
      {selectedUser && (
        <div className="bg-gray-50 rounded-lg p-4 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              <span className="ml-2 text-gray-600">Lade Berechtigungen...</span>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-gray-900">Tool-Berechtigungen</h4>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allToolsEnabled}
                    onChange={handleToggleAllTools}
                    disabled={saving}
                    className="w-4 h-4 text-red-600 border-gray-300 rounded focus:ring-red-500"
                  />
                  <span className="text-sm font-medium text-gray-700">
                    Alle Tools erlauben
                  </span>
                </label>
              </div>

              <div className="space-y-2 max-h-96 overflow-y-auto">
                {ALL_TOOLS.map((tool) => {
                  const Icon = tool.icon;
                  const isSelected = selectedTools.has(tool.id);
                  const isDisabled = allToolsEnabled || saving;
                  
                  return (
                    <label
                      key={tool.id}
                      className={`flex items-center justify-between gap-4 bg-white hover:bg-gray-50 transition-colors rounded-lg px-4 py-3 cursor-pointer ${
                        isDisabled ? 'opacity-50' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3 flex-1">
                        <div className={`p-2 rounded-lg bg-gradient-to-br ${tool.color} text-white`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">{tool.name}</div>
                          <div className="text-xs text-gray-600">{tool.description}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {isSelected ? (
                          <Check className="w-5 h-5 text-green-600" />
                        ) : (
                          <X className="w-5 h-5 text-gray-400" />
                        )}
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleTool(tool.id)}
                          disabled={isDisabled}
                          className="w-4 h-4 text-red-600 border-gray-300 rounded focus:ring-red-500"
                        />
                      </div>
                    </label>
                  );
                })}
              </div>

              <div className="flex justify-between items-center pt-4 border-t border-gray-200">
                <div>
                  {saved && (
                    <span className="text-sm text-green-600 font-medium">
                      ✓ In Appwrite gespeichert
                    </span>
                  )}
                </div>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-6 py-2 bg-gradient-to-r from-red-600 to-orange-600 text-white rounded-lg font-semibold hover:from-red-700 hover:to-orange-700 transition-all shadow-md disabled:opacity-50 flex items-center gap-2"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {saving ? 'Speichere...' : 'Änderungen speichern'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default UserManagement;
