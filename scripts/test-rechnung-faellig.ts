/**
 * Prüft die Entscheidungslogik für "Rechnung frisch fällig"
 * (netlify/functions/notifications-generate.ts).
 *
 * Aufruf: npx tsx scripts/test-rechnung-faellig.ts
 *
 * Deckt ab: Fälligkeits-Fenster (1–14 Tage über Ziel), Ausschluss bezahlter/
 * gemahnter/geschlossener Forderungen, Zahlungsziel-Varianten (Override, Text,
 * Vorkasse) und den Vorrang des Rechnungsdokuments vor rückdatierten Daten.
 * Läuft ohne Datenbank — die geprüfte Funktion ist rein.
 */
import { rechnungZuNotification } from '../netlify/functions/notifications-generate';

const vorTagen = (n: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
};

let fehler = 0;
const pruefe = (name: string, ist: unknown, soll: unknown) => {
  const ok = JSON.stringify(ist) === JSON.stringify(soll);
  if (!ok) fehler++;
  console.log(`${ok ? '✅' : '❌'} ${name}${ok ? '' : `\n     erwartet: ${JSON.stringify(soll)}\n     bekommen: ${JSON.stringify(ist)}`}`);
};

const projekt = (extra: Record<string, unknown> = {}) => ({
  $id: 'p1',
  kundenname: 'TC Musterstadt',
  rechnungsnummer: 'RE-2026-001',
  rechnungsbetrag: 1190,
  ...extra,
});

// Zahlungsziel 14 Tage (Standard) -> Rechnung von vor 15 Tagen ist 1 Tag überfällig
pruefe(
  'Standard-Zahlungsziel: 1 Tag überfällig -> meldet',
  rechnungZuNotification(projekt({ rechnungsdatum: vorTagen(15) }), undefined, undefined)?.typ,
  'rechnung_faellig'
);

pruefe(
  'Genau am Zahlungsziel (14 Tage alt) -> keine Meldung',
  rechnungZuNotification(projekt({ rechnungsdatum: vorTagen(14) }), undefined, undefined),
  null
);

pruefe(
  'Noch nicht fällig (5 Tage alt) -> keine Meldung',
  rechnungZuNotification(projekt({ rechnungsdatum: vorTagen(5) }), undefined, undefined),
  null
);

pruefe(
  'Frisch fällig, oberer Rand (14 Tage über Ziel) -> meldet',
  rechnungZuNotification(projekt({ rechnungsdatum: vorTagen(28) }), undefined, undefined)?.typ,
  'rechnung_faellig'
);

pruefe(
  'Altfall (15 Tage über Ziel) -> keine Meldung',
  rechnungZuNotification(projekt({ rechnungsdatum: vorTagen(29) }), undefined, undefined),
  null
);

pruefe(
  'Sehr alter Altfall (200 Tage) -> keine Meldung',
  rechnungZuNotification(projekt({ rechnungsdatum: vorTagen(200) }), undefined, undefined),
  null
);

// --- Ausschlüsse ---
pruefe(
  'Bereits bezahlt (bezahltAm gesetzt) -> keine Meldung',
  rechnungZuNotification(
    projekt({ rechnungsdatum: vorTagen(20), bezahltAm: vorTagen(2) }),
    undefined,
    undefined
  ),
  null
);

for (const status of ['bezahlt', 'teilbezahlt', 'gemahnt', 'storniert', 'reklamiert']) {
  pruefe(
    `Metadaten-Status '${status}' -> keine Meldung`,
    rechnungZuNotification(projekt({ rechnungsdatum: vorTagen(20) }), { status }, undefined),
    null
  );
}

pruefe(
  'Mahnstufe > 0 -> keine Meldung',
  rechnungZuNotification(projekt({ rechnungsdatum: vorTagen(20) }), { mahnstufe: 1 }, undefined),
  null
);

pruefe(
  'Metadaten-Status "offen" -> meldet trotzdem',
  rechnungZuNotification(projekt({ rechnungsdatum: vorTagen(20) }), { status: 'offen', mahnstufe: 0 }, undefined)?.typ,
  'rechnung_faellig'
);

// --- Zahlungsziel-Varianten ---
pruefe(
  'Zahlungsziel-Override 30 Tage: 20 Tage alt -> noch nicht fällig',
  rechnungZuNotification(projekt({ rechnungsdatum: vorTagen(20) }), { zahlungszielTage: 30 }, undefined),
  null
);

pruefe(
  'Zahlungsziel-Override 30 Tage: 35 Tage alt -> meldet',
  rechnungZuNotification(projekt({ rechnungsdatum: vorTagen(35) }), { zahlungszielTage: 30 }, undefined)?.typ,
  'rechnung_faellig'
);

pruefe(
  'Zahlungsziel-Text "30 Tage netto" aus rechnungsDaten: 35 Tage alt -> meldet',
  rechnungZuNotification(
    projekt({ rechnungsdatum: vorTagen(35), rechnungsDaten: JSON.stringify({ zahlungsziel: '30 Tage netto' }) }),
    undefined,
    undefined
  )?.typ,
  'rechnung_faellig'
);

pruefe(
  'Zahlungsziel "Vorkasse" (0 Tage): 1 Tag alt -> meldet sofort',
  rechnungZuNotification(
    projekt({ rechnungsdatum: vorTagen(1), rechnungsDaten: JSON.stringify({ zahlungsziel: 'Vorkasse' }) }),
    undefined,
    undefined
  )?.typ,
  'rechnung_faellig'
);

// --- Rechnungsdokument hat Vorrang vor rueckdatiertem projekt.rechnungsdatum ---
pruefe(
  'Rückdatiertes rechnungsdatum, Dokument erst gestern erstellt -> keine Meldung',
  rechnungZuNotification(
    projekt({ rechnungsdatum: vorTagen(200) }),
    undefined,
    { $createdAt: `${vorTagen(1)}T10:00:00.000Z`, projektId: 'p1', dokumentNummer: 'RE-2026-001' }
  ),
  null
);

pruefe(
  'Ohne Rechnungsdatum und ohne Dokument -> keine Meldung',
  rechnungZuNotification(projekt(), undefined, undefined),
  null
);

// --- Inhalt der Meldung ---
const meldung = rechnungZuNotification(
  projekt({ rechnungsdatum: vorTagen(17) }),
  undefined,
  { $createdAt: `${vorTagen(17)}T10:00:00.000Z`, projektId: 'p1', dokumentNummer: 'RE-2026-042', bruttobetrag: 1190 }
);
pruefe('Titel nutzt die Rechnungsnummer des Dokuments', meldung?.titel, 'Rechnung RE-2026-042 überfällig');
// Normalisiert die Whitespace-Varianten, die Intl vor dem Euro-Zeichen setzt (U+00A0 / U+202F)
const normal = (s: string | undefined) => s?.replace(/[  ]/g, ' ');
pruefe('Nachricht enthält Kunde, Betrag und Tage', normal(meldung?.nachricht), 'TC Musterstadt · 1.190,00 € · seit 3 Tagen überfällig');
pruefe('Verlinkt auf die Debitorenverwaltung', meldung?.link, '/debitoren');
pruefe('refId ist die Projekt-ID (eine Meldung pro Rechnung)', meldung?.refId, 'p1');
pruefe('Priorität hoch', meldung?.prioritaet, 'hoch');

const einTag = rechnungZuNotification(projekt({ rechnungsdatum: vorTagen(15) }), undefined, undefined);
pruefe('Singular bei genau 1 Tag', einTag?.nachricht?.includes('seit 1 Tag überfällig'), true);

console.log(fehler === 0 ? '\n🎉 Alle Prüfungen bestanden' : `\n💥 ${fehler} Prüfung(en) fehlgeschlagen`);
process.exit(fehler === 0 ? 0 : 1);
