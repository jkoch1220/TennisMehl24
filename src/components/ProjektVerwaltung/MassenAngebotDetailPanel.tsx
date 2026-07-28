// Detail-Panel des Massen-Angebots-Tools (rechte Seite der Master-Detail-Ansicht):
// Referenzdaten, editierbare Angebots-Positionen (Menge/Preis/Entfernen),
// Empfänger-E-Mail und Notiz eines Kandidaten. Alle Änderungen fließen über die
// Callbacks in den Kandidaten-State und damit in die spätere Erzeugung ein.

import { AlertTriangle, Mail, StickyNote, Trash2, X } from 'lucide-react';
import { MassenAngebotKandidat } from '../../types/massenAngebot';
import {
  eur,
  PROFIL_BADGE,
  quelleLabel,
  REFERENZ_TYP_LABEL,
  STATUS_BADGE,
} from './massenAngebotUi';

interface Props {
  kandidat: MassenAngebotKandidat;
  onPositionAendern: (kundeId: string, positionId: string, menge: number, preis: number) => void;
  onPositionEntfernen: (kundeId: string, positionId: string) => void;
  onEmailAendern: (kundeId: string, email: string) => void;
  onNotizAendern: (kundeId: string, notiz: string) => void;
  onSchliessen: () => void;
}

const inputClass =
  'px-2 py-1 text-right border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 text-sm';

const MassenAngebotDetailPanel = ({
  kandidat,
  onPositionAendern,
  onPositionEntfernen,
  onEmailAendern,
  onNotizAendern,
  onSchliessen,
}: Props) => {
  const badge = STATUS_BADGE[kandidat.status];
  const profil = PROFIL_BADGE[kandidat.produktprofil];
  const editierbar = kandidat.status === 'neu' || kandidat.status === 'fehler';
  const referenz = kandidat.referenz;

  return (
    <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-4 space-y-4">
      {/* Kopf */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-bold text-gray-900 dark:text-slate-100 truncate">
            {kandidat.kundenname}
          </div>
          {kandidat.kundennummer && (
            <div className="text-xs text-gray-400">{kandidat.kundennummer}</div>
          )}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span
              className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${badge.className}`}
            >
              {badge.label}
            </span>
            <span
              className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${profil.className}`}
            >
              {profil.label}
            </span>
            <span className="text-xs text-gray-500 dark:text-slate-400">{quelleLabel(kandidat)}</span>
          </div>
        </div>
        <button
          onClick={onSchliessen}
          className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-slate-200 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 flex-shrink-0"
          title="Detail schließen"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {kandidat.statusGrund && (
        <div className="text-xs text-amber-600 dark:text-amber-400">{kandidat.statusGrund}</div>
      )}

      {/* Referenzdaten */}
      {referenz && (
        <div className="bg-gray-50 dark:bg-slate-900/50 border border-gray-100 dark:border-slate-700 rounded-lg px-3 py-2 text-sm space-y-0.5">
          <div className="font-semibold text-gray-700 dark:text-slate-300 text-xs uppercase tracking-wide">
            Referenz (größte Bestellung)
          </div>
          <div className="text-gray-700 dark:text-slate-300">
            {referenz.jahr ? `Saison ${referenz.jahr}` : 'Jahr unbekannt'} · Datenbasis:{' '}
            {REFERENZ_TYP_LABEL[referenz.typ]}
          </div>
          <div className="text-gray-700 dark:text-slate-300">
            {referenz.tonnage > 0 && (
              <>{referenz.tonnage.toLocaleString('de-DE')} t Schüttgut · </>
            )}
            {eur(referenz.wert)} netto
            {referenz.anzahlVorjahresProjekte !== undefined &&
              referenz.anzahlVorjahresProjekte > 1 && (
                <> · aus {referenz.anzahlVorjahresProjekte} Vorjahres-Projekten</>
              )}
          </div>
          {referenz.ausVerlorenemProjekt && (
            <div className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" /> Referenz aus verlorenem Projekt
            </div>
          )}
        </div>
      )}

      {/* Fehler & Warnungen */}
      {kandidat.fehler.length > 0 && (
        <div className="text-xs text-red-600 dark:text-red-400 space-y-0.5">
          {kandidat.fehler.map((f, i) => (
            <div key={i} className="flex items-start gap-1">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" /> {f}
            </div>
          ))}
        </div>
      )}
      {kandidat.warnungen.length > 0 && (
        <div className="text-xs text-amber-600 dark:text-amber-400 space-y-0.5">
          {kandidat.warnungen.map((w, i) => (
            <div key={i} className="flex items-start gap-1">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" /> {w}
            </div>
          ))}
        </div>
      )}

      {/* Empfänger-E-Mail */}
      <div>
        <label className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide flex items-center gap-1.5 mb-1">
          <Mail className="w-3.5 h-3.5" /> Empfänger-E-Mail
        </label>
        <input
          type="email"
          value={kandidat.empfaengerEmail ?? ''}
          disabled={!editierbar}
          onChange={(e) => onEmailAendern(kandidat.kundeId, e.target.value)}
          placeholder="empfaenger@verein.de"
          className={`w-full px-2.5 py-1.5 border rounded-lg bg-white dark:bg-slate-900 text-sm text-gray-900 dark:text-slate-100 disabled:opacity-60 ${
            kandidat.emailFehlt
              ? 'border-red-400 dark:border-red-700'
              : 'border-gray-300 dark:border-slate-600'
          }`}
        />
        {kandidat.emailFehlt && (
          <div className="text-xs text-red-600 dark:text-red-400 mt-1">
            E-Mail fehlt — Angebot kann erzeugt, aber nicht versendet werden.
          </div>
        )}
      </div>

      {/* Positionen */}
      <div>
        <div className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-1">
          Angebots-Positionen
        </div>
        {kandidat.positionen.length === 0 ? (
          <div className="text-sm text-gray-400 py-2">Keine Positionen.</div>
        ) : (
          <div className="border border-gray-100 dark:border-slate-700 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-slate-900/60">
                <tr className="text-left text-xs uppercase tracking-wide text-gray-500 dark:text-slate-400">
                  <th className="px-2 py-1.5">Position</th>
                  <th className="px-2 py-1.5 text-right w-20">Menge</th>
                  <th className="px-2 py-1.5 text-right w-24">Preis</th>
                  <th className="px-2 py-1.5 text-right w-24">Gesamt</th>
                  {editierbar && <th className="px-1 py-1.5 w-8"></th>}
                </tr>
              </thead>
              <tbody>
                {kandidat.positionen.map((pos) => (
                  <tr
                    key={pos.id}
                    className="border-t border-gray-100 dark:border-slate-700/60 align-top"
                  >
                    <td className="px-2 py-1.5">
                      <div className="text-gray-900 dark:text-slate-100">{pos.bezeichnung}</div>
                      <div className="text-xs text-gray-400">
                        {pos.artikelnummer}
                        {pos.istBedarfsposition && (
                          <span className="ml-1.5 px-1 py-0.5 bg-gray-100 dark:bg-slate-700 rounded text-[10px] uppercase">
                            Bedarf
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      {editierbar ? (
                        <input
                          type="number"
                          value={pos.menge || ''}
                          min={0}
                          step={0.5}
                          onChange={(e) =>
                            onPositionAendern(
                              kandidat.kundeId,
                              pos.id,
                              Number(e.target.value),
                              pos.einzelpreis ?? 0
                            )
                          }
                          className={`w-16 ${inputClass}`}
                        />
                      ) : (
                        <span className="text-gray-500">{pos.menge}</span>
                      )}
                      <div className="text-[10px] text-gray-400">{pos.einheit}</div>
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      {editierbar ? (
                        <input
                          type="number"
                          value={pos.einzelpreis || ''}
                          min={0}
                          step={0.5}
                          onChange={(e) =>
                            onPositionAendern(
                              kandidat.kundeId,
                              pos.id,
                              pos.menge ?? 0,
                              Number(e.target.value)
                            )
                          }
                          className={`w-20 ${inputClass}`}
                        />
                      ) : (
                        <span className="text-gray-500">{eur(pos.einzelpreis ?? 0)}</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right font-medium text-gray-900 dark:text-slate-100">
                      {eur(pos.gesamtpreis ?? 0)}
                    </td>
                    {editierbar && (
                      <td className="px-1 py-1.5">
                        <button
                          onClick={() => onPositionEntfernen(kandidat.kundeId, pos.id)}
                          className="p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400 rounded"
                          title="Position entfernen"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-900/40">
                  <td
                    colSpan={editierbar ? 3 : 3}
                    className="px-2 py-1.5 text-right text-xs uppercase tracking-wide text-gray-500 dark:text-slate-400"
                  >
                    Netto-Summe
                  </td>
                  <td className="px-2 py-1.5 text-right font-bold text-gray-900 dark:text-slate-100">
                    {eur(kandidat.angebotssumme)}
                  </td>
                  {editierbar && <td></td>}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Notiz */}
      <div>
        <label className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide flex items-center gap-1.5 mb-1">
          <StickyNote className="w-3.5 h-3.5" /> Notiz (wird ins Projekt übernommen)
        </label>
        <textarea
          value={kandidat.notiz ?? ''}
          disabled={!editierbar}
          onChange={(e) => onNotizAendern(kandidat.kundeId, e.target.value)}
          rows={2}
          placeholder="Interne Notiz zum Angebot…"
          className="w-full px-2.5 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-sm text-gray-900 dark:text-slate-100 disabled:opacity-60 resize-y"
        />
      </div>
    </div>
  );
};

export default MassenAngebotDetailPanel;
