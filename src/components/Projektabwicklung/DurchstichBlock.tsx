/**
 * Der Durchstich in der Projektakte — vier Kacheln, die zeigen, was an diesem
 * Vorgang außerhalb der Dokument-Reiter passiert.
 *
 * Die Akte zeigte bisher vier Reiter, je einen Beleg. Woher der Auftrag kam, ob
 * er in der Dispo liegt, ob ein Wiegeschein vorliegt und wie es um die Forderung
 * steht — dafür musste man in vier andere Werkzeuge wechseln. Die Verknüpfungen
 * dahin existieren im Datenmodell längst, sie wurden nur nirgends gezeigt.
 *
 * Grundregel: LEERE KACHELN BLEIBEN STEHEN. Dass kein Wiegeschein da ist, ist der
 * Grund, warum die Rechnung wartet — diese Information darf nicht dadurch
 * verschwinden, dass man sie ausblendet. Was nicht zutrifft, sagt es im Klartext.
 */

import { useEffect, useState } from 'react';
import {
  ShoppingCart,
  Inbox,
  HardHat,
  Truck,
  Scale,
  Euro,
  ExternalLink,
  AlertTriangle,
} from 'lucide-react';
import { Projekt } from '../../types/projekt';
import { DebitorMetadaten } from '../../types/debitor';
import { getProjektHerkunft, getShopBestellnummer } from '../../utils/projektHerkunft';
import { wiegescheinVorgesehen } from '../../utils/abwicklungsweg';
import { debitorService } from '../../services/debitorService';
import { anfragenService } from '../../services/anfragenService';
import SchuettstelleFotos from './SchuettstelleFotos';

const DISPO_LABEL: Record<string, string> = {
  offen: 'noch nicht disponiert',
  geplant: 'auf einer Tour eingeplant',
  beladen: 'verladen',
  unterwegs: 'unterwegs',
  geliefert: 'geliefert',
};

const WIEGESCHEIN_LABEL: Record<string, string> = {
  offen: 'liegt vor, noch nicht geprüft',
  bestaetigt: 'geprüft und bestätigt',
  korrigiert: 'geprüft, Menge korrigiert',
  unlesbar: 'unlesbar — Menge von Hand nötig',
};

const Kachel = ({
  titel,
  icon: Icon,
  farbe,
  leer,
  children,
}: {
  titel: string;
  icon: typeof Truck;
  farbe: string;
  leer?: boolean;
  children: React.ReactNode;
}) => (
  <div
    className={`rounded-xl border p-3 ${
      leer
        ? 'border-dashed border-gray-300 dark:border-slate-700 bg-gray-50/60 dark:bg-slate-800/40'
        : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800'
    }`}
  >
    <div className="flex items-center gap-1.5 mb-1.5">
      <Icon className={`w-4 h-4 ${leer ? 'text-gray-400 dark:text-slate-500' : farbe}`} />
      <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
        {titel}
      </span>
    </div>
    <div className={`text-sm ${leer ? 'text-gray-500 dark:text-slate-400' : 'text-gray-900 dark:text-slate-100'}`}>
      {children}
    </div>
  </div>
);

const Verweis = ({ to, children }: { to: string; children: React.ReactNode }) => (
  <a
    href={to}
    className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
  >
    {children} <ExternalLink className="w-3 h-3" />
  </a>
);

const DurchstichBlock = ({ projekt }: { projekt: Projekt }) => {
  const [debitor, setDebitor] = useState<DebitorMetadaten | null>(null);
  const [debitorGeprueft, setDebitorGeprueft] = useState(false);
  const [anfrageId, setAnfrageId] = useState<string | null>(null);
  const [anfrageGeprueft, setAnfrageGeprueft] = useState(false);

  // Die Forderung liegt in einer eigenen Collection. Ein Fehler beim Laden darf
  // die Akte nicht blockieren — die Kachel sagt dann, dass sie nichts weiß.
  useEffect(() => {
    let aktiv = true;
    const id = (projekt as { $id?: string }).$id || projekt.id;
    if (!id) return;
    // Bewusst `loadMetadatenFuerProjekt` und NICHT `getOrCreateMetadaten`: Das
    // bloße Betrachten einer Akte darf keinen Debitorendatensatz anlegen.
    void debitorService
      .loadMetadatenFuerProjekt(id)
      .then((m) => {
        if (aktiv) setDebitor(m);
      })
      .catch(() => undefined)
      .finally(() => {
        if (aktiv) setDebitorGeprueft(true);
      });
    return () => {
      aktiv = false;
    };
  }, [projekt]);

  // Der Altbestand traegt keinen `herkunft`-Marker — dass ein Projekt aus einer
  // Anfrage entstand, steht dann nur auf der Anfrage selbst. Ohne diese Abfrage
  // behauptete die Kachel „direkt erfasst", was fuer jedes Projekt vor dem
  // Marker schlicht falsch waere.
  useEffect(() => {
    let aktiv = true;
    // Steht ein anderer Kanal fest, ist nichts nachzuschlagen. Bei 'anfrage'
    // schon: die Spalte sagt DASS es eine Anfrage gab, nicht WELCHE — und ohne
    // deren ID führte der Verweis nur auf die Sammelliste statt auf den Vorgang.
    if (projekt.herkunft && projekt.herkunft !== 'anfrage') {
      setAnfrageId(null);
      setAnfrageGeprueft(true);
      return;
    }
    setAnfrageGeprueft(false);
    void anfragenService
      .findeAnfrageZuProjekt(projekt.id, (projekt as { $id?: string }).$id)
      .then((a) => {
        if (aktiv) setAnfrageId(a?.id ?? null);
      })
      .catch(() => undefined)
      .finally(() => {
        if (aktiv) setAnfrageGeprueft(true);
      });
    return () => {
      aktiv = false;
    };
  }, [projekt]);

  const herkunftMarker = getProjektHerkunft(projekt);
  const herkunft = herkunftMarker ?? (anfrageId ? 'anfrage' : null);
  const shopNummer = getShopBestellnummer(projekt);
  const wiegeschein = projekt.wiegeschein;
  // Nur loses Material wird gewogen. Bei Sackware, Hydrocourt oder Universal gibt
  // es keinen Wiegeschein — dort einen anzumahnen wäre eine Aufgabe, die niemand
  // erledigen kann. `null` heißt „Warenart noch offen": dann keine Aussage.
  const wiegepflicht = wiegescheinVorgesehen(projekt);
  const geliefertOhneNachweis =
    (projekt.status === 'geliefert' || projekt.status === 'rechnung') &&
    !wiegeschein &&
    wiegepflicht === true;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2">
      {/* HERKUNFT — woher kam der Auftrag */}
      <Kachel
        titel="Herkunft"
        icon={herkunft === 'shop' ? ShoppingCart : herkunft === 'platzbau' ? HardHat : Inbox}
        farbe="text-blue-600 dark:text-blue-400"
        leer={!herkunft}
      >
        {herkunft === 'shop' && (
          <>
            <div>
              Onlineshop{shopNummer ? <> · Bestellung <strong>{shopNummer}</strong></> : null}
            </div>
            <Verweis to="/projekt-verwaltung?view=shop">Bestellungen öffnen</Verweis>
          </>
        )}
        {herkunft === 'platzbau' && (
          <>
            <div>Über Platzbauer</div>
            <Verweis
              to={
                projekt.zugeordnetesPlatzbauerprojektId
                  ? `/platzbauer-projektabwicklung/${projekt.zugeordnetesPlatzbauerprojektId}`
                  : '/platzbauer-verwaltung'
              }
            >
              {projekt.zugeordnetesPlatzbauerprojektId
                ? 'Platzbauer-Projekt öffnen'
                : 'Platzbauer-Verwaltung'}
            </Verweis>
          </>
        )}
        {herkunft === 'anfrage' && (
          <>
            <div>Aus einer Anfrage entstanden</div>
            <Verweis
              to={
                anfrageId
                  ? `/projekt-verwaltung?view=anfragen&anfrageId=${anfrageId}`
                  : '/projekt-verwaltung?view=anfragen'
              }
            >
              {anfrageId ? 'Anfrage öffnen' : 'Anfragen öffnen'}
            </Verweis>
          </>
        )}
        {!herkunft &&
          (anfrageGeprueft ? (
            <div>Direkt erfasst — kein Shop, kein Platzbauer, keine Anfrage.</div>
          ) : (
            <div className="text-gray-400 dark:text-slate-500">Wird ermittelt …</div>
          ))}
      </Kachel>

      {/* DISPO — liegt der Auftrag in der Planung */}
      <Kachel
        titel="Disposition"
        icon={Truck}
        farbe="text-emerald-600 dark:text-emerald-400"
        leer={!projekt.dispoStatus}
      >
        {projekt.dispoStatus ? (
          <>
            <div>{DISPO_LABEL[projekt.dispoStatus] ?? projekt.dispoStatus}</div>
            {projekt.positionInRoute !== undefined && (
              <div className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                Stopp {projekt.positionInRoute} auf der Tour
              </div>
            )}
            {projekt.dispoAnsprechpartner?.name && (
              <div className="text-xs text-gray-500 dark:text-slate-400">
                Kontakt vor Ort: {projekt.dispoAnsprechpartner.name}
                {projekt.dispoAnsprechpartner.telefon
                  ? ` · ${projekt.dispoAnsprechpartner.telefon}`
                  : ''}
              </div>
            )}
            <Verweis to="/dispo-planung">Zur Wochenplanung</Verweis>
          </>
        ) : (
          <div>Keine Dispo-Buchung. Der Auftrag steht in keiner Tour.</div>
        )}
      </Kachel>

      {/* Fotos der Schüttstelle: stehen bewusst direkt bei der Dispo — dort
          wird entschieden, welches Fahrzeug fährt. */}
      <SchuettstelleFotos projekt={projekt} />

      {/* WIEGESCHEIN — Voraussetzung für die Rechnung */}
      <Kachel
        titel="Wiegeschein"
        icon={Scale}
        farbe="text-amber-600 dark:text-amber-400"
        leer={!wiegeschein}
      >
        {wiegeschein ? (
          <>
            <div>{WIEGESCHEIN_LABEL[wiegeschein.pruefStatus] ?? wiegeschein.pruefStatus}</div>
            {wiegeschein.gepruefteMengeTonnen !== undefined && (
              <div className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                Bestätigte Menge: {wiegeschein.gepruefteMengeTonnen} t
              </div>
            )}
            {wiegeschein.pruefStatus === 'offen' && (
              <Verweis to="/projekt-verwaltung?view=wiegescheine">Zur Prüfliste</Verweis>
            )}
          </>
        ) : geliefertOhneNachweis ? (
          <div className="flex items-start gap-1.5 text-amber-700 dark:text-amber-400">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <span>
              Kein Wiegeschein hinterlegt — er ist Voraussetzung für die Rechnung.
            </span>
          </div>
        ) : wiegepflicht === false ? (
          <div>Für diesen Auftrag keiner nötig — es wird nichts loses gewogen.</div>
        ) : wiegepflicht === null ? (
          <div>Ob einer gebraucht wird, entscheidet sich mit der Warenart.</div>
        ) : (
          <div>Noch kein Wiegeschein — kommt mit der Lieferung.</div>
        )}
      </Kachel>

      {/* FORDERUNG — was die Debitorenverwaltung sagt */}
      <Kachel
        titel="Forderung"
        icon={Euro}
        farbe="text-purple-600 dark:text-purple-400"
        leer={!projekt.rechnungsnummer}
      >
        {projekt.rechnungsnummer ? (
          <>
            <div>
              <strong>{projekt.rechnungsnummer}</strong>
              {projekt.bezahltAm ? ' · bezahlt' : projekt.rechnungVersendetAm ? ' · versendet' : ''}
            </div>
            {!projekt.rechnungVersendetAm && !projekt.bezahltAm && (
              <div className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                erstellt, aber nie versendet
              </div>
            )}
            {debitor?.status && (
              <div className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                Debitorenstatus: {debitor.status}
                {/* Bei einer bezahlten Forderung ist die Mahnstufe Historie, kein
                    Zustand. „bezahlt · Mahnstufe 1" nebeneinander liest sich, als
                    laufe das Mahnwesen weiter — deshalb im Klartext getrennt. */}
                {debitor.mahnstufe
                  ? debitor.status === 'bezahlt'
                    ? ` (wurde gemahnt, Stufe ${debitor.mahnstufe})`
                    : ` · Mahnstufe ${debitor.mahnstufe}`
                  : ''}
              </div>
            )}
            {debitorGeprueft && !debitor && (
              <div className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">
                In der Debitorenverwaltung nicht geführt.
              </div>
            )}
            <Verweis to="/debitoren">Debitoren öffnen</Verweis>
          </>
        ) : (
          <div>Noch keine Rechnung gestellt.</div>
        )}
      </Kachel>
    </div>
  );
};

export default DurchstichBlock;
