import { useEffect, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  KeyRound,
  Loader2,
  MinusCircle,
  PlusCircle,
  UserPlus,
  Users,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { Role, PermissionMap } from '../../types/permissions';
import { loadAllRoles } from '../../services/rolesService';
import {
  loadUserPermissions,
  setUserAccess,
  loadAllPermissions,
} from '../../services/permissionsService';
import {
  listUsersMitEmail,
  createUser,
  resetUserPassword,
  DirectoryUser,
} from '../../services/userDirectoryService';
import { auditService } from '../../services/auditService';
import { ONBOARDING_PASSWORD_INPUT } from '../../constants/onboarding';
import PermissionMatrix from './PermissionMatrix';

/**
 * Admin-only Benutzerverwaltung (D2/D5): User anlegen (Einmalpasswort),
 * mehrere Rollen zuweisen, individuelle Zusatz-/Entzugs-Rechte, Passwort-Reset.
 */
const UserManagement = () => {
  const { user, isAdmin, refreshPermissions } = useAuth();
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [selectedUser, setSelectedUser] = useState<DirectoryUser | null>(null);
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [allowOverride, setAllowOverride] = useState<PermissionMap>({});
  const [denyOverride, setDenyOverride] = useState<PermissionMap>({});
  const [legacyAllowedTools, setLegacyAllowedTools] = useState<string[] | null>(null);
  const [showAllow, setShowAllow] = useState(false);
  const [showDeny, setShowDeny] = useState(false);
  const [neuName, setNeuName] = useState('');
  const [neuEmail, setNeuEmail] = useState('');
  const [zeigeNeuForm, setZeigeNeuForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [meldung, setMeldung] = useState('');

  const ladeDaten = async () => {
    setLoading(true);
    try {
      const [userListe, rollenListe] = await Promise.all([listUsersMitEmail(), loadAllRoles()]);
      setUsers(userListe);
      setRoles(rollenListe);
    } catch (error) {
      console.error('❌ Fehler beim Laden der Benutzerverwaltung:', error);
      setMeldung('❌ User-Liste nicht verfügbar (Netlify Function erreichbar?)');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    ladeDaten();
  }, []);

  const waehleUser = async (u: DirectoryUser) => {
    setSelectedUser(u);
    setDetailLoading(true);
    setMeldung('');
    setShowAllow(false);
    setShowDeny(false);
    try {
      const perms = await loadUserPermissions(u.id);
      setRoleIds(perms.roleIds);
      setAllowOverride(perms.allowOverride ?? {});
      setDenyOverride(perms.denyOverride ?? {});
      setLegacyAllowedTools(perms.allowedTools);
      setShowAllow(Object.keys(perms.allowOverride ?? {}).length > 0);
      setShowDeny(Object.keys(perms.denyOverride ?? {}).length > 0);
    } finally {
      setDetailLoading(false);
    }
  };

  const toggleRolle = (roleId: string) => {
    setRoleIds((prev) =>
      prev.includes(roleId) ? prev.filter((id) => id !== roleId) : [...prev, roleId]
    );
  };

  const speichern = async () => {
    if (!selectedUser || !user) return;
    setSaving(true);
    setMeldung('');
    const ok = await setUserAccess(user, selectedUser.id, selectedUser.name, {
      roleIds,
      allowOverride: Object.keys(allowOverride).length > 0 ? allowOverride : null,
      denyOverride: Object.keys(denyOverride).length > 0 ? denyOverride : null,
    });
    if (ok) {
      await loadAllPermissions();
      await refreshPermissions();
      setMeldung('✅ Gespeichert — gilt ab dem nächsten Laden beim User');
      setTimeout(() => setMeldung(''), 4000);
    } else {
      setMeldung('❌ Speichern fehlgeschlagen');
    }
    setSaving(false);
  };

  const emailGueltig = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(neuEmail.trim());

  const userAnlegen = async () => {
    if (!neuName.trim() || !emailGueltig || !user) return;
    setSaving(true);
    setMeldung('');
    try {
      const created = await createUser(neuEmail.trim().toLowerCase(), neuName.trim());
      auditService.log(user, {
        action: 'user_create',
        entityType: 'user',
        entityId: created.id,
        summary: `User "${created.name}" angelegt (startet mit Einmalpasswort)`,
      });
      setNeuName('');
      setNeuEmail('');
      setZeigeNeuForm(false);
      await ladeDaten();
      const neu = { id: created.id, name: created.name, email: created.email };
      await waehleUser(neu);
      setMeldung(`✅ "${created.name}" angelegt — Login mit Einmalpasswort ${ONBOARDING_PASSWORD_INPUT}. Jetzt Rollen zuweisen!`);
    } catch (error) {
      setMeldung(`❌ ${(error as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const passwortZuruecksetzen = async () => {
    if (!selectedUser || !user) return;
    if (
      !confirm(
        `Passwort von "${selectedUser.name}" auf das Einmalpasswort ${ONBOARDING_PASSWORD_INPUT} zurücksetzen? Beim nächsten Login muss ein neues Passwort gesetzt werden.`
      )
    ) {
      return;
    }
    setSaving(true);
    try {
      await resetUserPassword(selectedUser.id);
      auditService.log(user, {
        action: 'password_change',
        entityType: 'user',
        entityId: selectedUser.id,
        summary: `Passwort von ${selectedUser.name} auf Einmalpasswort zurückgesetzt`,
      });
      setMeldung(`✅ Passwort zurückgesetzt — ${selectedUser.name} meldet sich mit ${ONBOARDING_PASSWORD_INPUT} an`);
      setTimeout(() => setMeldung(''), 5000);
    } catch (error) {
      setMeldung(`❌ ${(error as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-700">Nur Administratoren haben Zugriff auf die Benutzerverwaltung.</p>
      </div>
    );
  }

  const hatLegacy = roleIds.length === 0 && Array.isArray(legacyAllowedTools);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text flex items-center gap-2 mb-1">
          <Users className="w-5 h-5" />
          Benutzerverwaltung
        </h3>
        <p className="text-sm text-gray-600 dark:text-dark-textMuted">
          User anlegen, Rollen zuweisen und individuelle Ausnahmen festlegen.
          Admins (Label) haben immer alle Rechte.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : (
        <>
          {/* User-Liste + Neu-Button */}
          <div className="flex flex-wrap gap-2">
            {users.map((u) => (
              <button
                key={u.id}
                onClick={() => waehleUser(u)}
                className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
                  selectedUser?.id === u.id
                    ? 'border-red-500 bg-red-50 text-red-700'
                    : 'border-gray-300 dark:border-dark-border text-gray-700 dark:text-dark-textMuted hover:border-gray-400'
                }`}
              >
                {u.name}
                {u.id === user?.$id && <span className="text-xs text-gray-400"> (du)</span>}
              </button>
            ))}
            <button
              onClick={() => setZeigeNeuForm(!zeigeNeuForm)}
              className={`px-3 py-1.5 rounded-lg border text-sm font-medium flex items-center gap-1 transition-colors ${
                zeigeNeuForm
                  ? 'border-red-500 bg-red-50 text-red-700'
                  : 'border-dashed border-gray-400 text-gray-600 dark:text-dark-textMuted hover:border-gray-500'
              }`}
            >
              <UserPlus className="w-4 h-4" />
              Neuer User
            </button>
          </div>

          {/* Neuer User */}
          {zeigeNeuForm && (
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-3">
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-dark-textMuted mb-1">
                    Anzeigename
                  </label>
                  <input
                    type="text"
                    value={neuName}
                    onChange={(e) => setNeuName(e.target.value)}
                    disabled={saving}
                    className="w-full p-2 border-2 border-gray-300 dark:border-dark-border rounded-lg text-sm focus:border-red-500 focus:outline-none"
                    placeholder="z.B. Max Mustermann"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-dark-textMuted mb-1">
                    E-Mail-Adresse (Pflicht, für Login & Passwort-Zurücksetzen)
                  </label>
                  <input
                    type="email"
                    value={neuEmail}
                    onChange={(e) => setNeuEmail(e.target.value)}
                    disabled={saving}
                    className="w-full p-2 border-2 border-gray-300 dark:border-dark-border rounded-lg text-sm focus:border-red-500 focus:outline-none"
                    placeholder="z.B. max@gmail.com"
                  />
                  {neuEmail.trim() !== '' && !emailGueltig && (
                    <p className="text-xs text-red-600 mt-1">Bitte eine gültige E-Mail-Adresse eingeben.</p>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-500 dark:text-dark-textMuted">
                  Der neue User startet mit dem Einmalpasswort {ONBOARDING_PASSWORD_INPUT} und muss es
                  beim ersten Login ändern.
                </p>
                <button
                  onClick={userAnlegen}
                  disabled={saving || !neuName.trim() || !emailGueltig}
                  className="px-4 py-2 bg-gradient-to-r from-red-600 to-orange-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50 flex items-center gap-2"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  Anlegen
                </button>
              </div>
            </div>
          )}

          {/* User-Detail */}
          {selectedUser && (
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-4">
              {detailLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-semibold text-gray-900 dark:text-dark-text">{selectedUser.name}</h4>
                      <p className="text-xs text-gray-500 dark:text-dark-textMuted">{selectedUser.email}</p>
                    </div>
                    <button
                      onClick={passwortZuruecksetzen}
                      disabled={saving}
                      className="px-3 py-2 text-xs bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-lg flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <KeyRound className="w-4 h-4" />
                      Passwort auf {ONBOARDING_PASSWORD_INPUT} zurücksetzen
                    </button>
                  </div>

                  {hatLegacy && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800">
                      Dieser User nutzt noch die alte Tool-Freigabe ({legacyAllowedTools?.length ?? 0} Tools).
                      Sobald du Rollen zuweist und speicherst, gilt nur noch das Rollen-System.
                    </div>
                  )}
                  {roleIds.length === 0 && !hatLegacy && legacyAllowedTools === null && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
                      ⚠️ Noch keine Rollen zugewiesen — der User sieht übergangsweise alle Tools
                      (Altverhalten). Bitte Rollen zuweisen.
                    </div>
                  )}

                  {/* Rollen */}
                  <div>
                    <p className="text-xs font-semibold text-gray-700 dark:text-dark-textMuted mb-2">
                      Rollen (mehrere möglich, Rechte addieren sich)
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {roles.map((role) => (
                        <label
                          key={role.$id}
                          className={`px-3 py-1.5 rounded-lg border text-sm cursor-pointer flex items-center gap-2 transition-colors ${
                            roleIds.includes(role.$id)
                              ? 'border-green-500 bg-green-50 text-green-800'
                              : 'border-gray-300 dark:border-dark-border text-gray-600 dark:text-dark-textMuted'
                          }`}
                          title={role.description}
                        >
                          <input
                            type="checkbox"
                            checked={roleIds.includes(role.$id)}
                            onChange={() => toggleRolle(role.$id)}
                            disabled={saving}
                            className="w-4 h-4 text-green-600 border-gray-300 rounded"
                          />
                          {role.name}
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Overrides */}
                  <div className="space-y-2">
                    <button
                      onClick={() => setShowAllow(!showAllow)}
                      className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 dark:text-dark-textMuted"
                    >
                      {showAllow ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      <PlusCircle className="w-4 h-4 text-green-600" />
                      Zusätzlich erlauben ({Object.keys(allowOverride).length})
                    </button>
                    {showAllow && (
                      <PermissionMatrix value={allowOverride} onChange={setAllowOverride} mode="grant" disabled={saving} />
                    )}

                    <button
                      onClick={() => setShowDeny(!showDeny)}
                      className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 dark:text-dark-textMuted"
                    >
                      {showDeny ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      <MinusCircle className="w-4 h-4 text-red-600" />
                      Explizit entziehen ({Object.keys(denyOverride).length})
                    </button>
                    {showDeny && (
                      <PermissionMatrix value={denyOverride} onChange={setDenyOverride} mode="deny" disabled={saving} />
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-dark-border">
                    <span className="text-sm font-medium">{meldung}</span>
                    <button
                      onClick={speichern}
                      disabled={saving}
                      className="px-5 py-2 bg-gradient-to-r from-red-600 to-orange-600 text-white rounded-lg text-sm font-semibold hover:from-red-700 hover:to-orange-700 transition-all disabled:opacity-50 flex items-center gap-2"
                    >
                      {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                      {saving ? 'Speichere…' : 'Änderungen speichern'}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {!selectedUser && meldung && <p className="text-sm font-medium">{meldung}</p>}
        </>
      )}
    </div>
  );
};

export default UserManagement;
