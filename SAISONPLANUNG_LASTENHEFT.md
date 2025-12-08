# Lastenheft: Saisonplanung TennisMehl (manuelle Kundenliste, Peak UI/UX)

## Ziel und Kontext
- Saisonplanung direkt in der aktuellen Kundenliste durchführen; Kunden werden diese Woche per Formular manuell erfasst (kein Import).
- Telefonaktion: alle Kunden (Vereine und Tennisplatzbauer) anrufen, Mengen und Lieferfenster erfassen, Status abhaken.
- Minimalistische, sehr klare UI angelehnt an `KreditorenVerwaltung` (Layout/UX-Vorbild).
- Transparente Visualisierung von Mengen, Preisen, Lieferfenstern, Beziehungen Verein ↔ Platzbauer und Aktivitätsverlauf.

## Begriffe
- **Kunde**: Tennisplatzverein oder Tennisplatzbauer (Typ kennzeichnen).
- **Saison**: Geschäftsjahr für Tennismehl (Stichtag Abschluss: Juni).
- **Angefragte Menge**: Menge, die im Frühjahr telefonisch erfragt wird.
- **Tatsächliche Menge**: Endgültig bestellte/gelieferte Menge; Referenz fürs Folgejahr.
- **Call-Liste**: Geführte Telefonliste der aktuellen Kunden mit Abhak-Logik.

## Datenmodell (Soll)
### Kunde
- Typ: `verein` | `platzbauer`.
- Stammdaten: Name, Adresse (Straße, PLZ, Ort, Bundesland), E-Mail, Kundennummer (optional), Notizen, Aktiv-Flag.
- Preis-Infos: zuletzt gezahlter Preis pro Tonne, Historie der Preise je Saison.
- Bezugsweg-Standard: direkt oder über Platzbauer (nur falls Typ = Verein und Standard bekannt).

### Beziehungen Verein ↔ Platzbauer
- Ein Verein kann über einen oder mehrere Platzbauer beliefert werden.
- Ein Platzbauer kann mehrere Vereine beliefern.
- Beziehung speichert: Verein-ID, Platzbauer-ID, Status (aktiv/inaktiv), Notiz (z. B. „hauptsächlich“, „Backup“).

### Ansprechpartner (mehrere pro Kunde)
- Felder: Name, Rolle/Funktion (Platzwart, Vorstand, Dispo), E-Mail, beliebig viele Telefonnummern (Typ beschreibbar), bevorzugter Kontaktweg, Notizen, Aktiv-Flag.

### Saison-Datensatz pro Kunde und Jahr
- Saisonjahr.
- Referenzmenge (automatisch = tatsächliche Menge Vorjahr, falls vorhanden).
- Angefragte Menge (Frühjahr).
- Tatsächliche Menge (Saisonabschluss, Stichtag Juni).
- Preis dieser Saison (€/Tonne).
- Bezugsweg dieser Saison: direkt | über Platzbauer (+ Auswahl Platzbauer).
- Bestellabsicht: bestellt / bestellt nicht / unklar.
- Lieferfenster: frühestes Lieferdatum, spätestes Lieferdatum.
- Gesprächsstatus: offen | in Bearbeitung | erledigt; Abhak-Funktion.
- Gesprächsnotizen/Freitext.
- Zeitstempel & Bearbeiter.

### Aktivitätsverlauf je Kunde
- Chronologische Liste von Aktivitäten (Calls, Updates, Mengenänderungen, Notizen).
- Felder: Typ, Datum, User, Kurznotiz, verlinkter Saison-Datensatz.

### Historie / Verlauf
- Saisonverlauf je Kunde: Jahre, angefragte/tatsächliche Mengen, Bezugsweg, Preis, Lieferfenster, Notizen, Status.

## Funktionale Anforderungen
- Kundenpflege (manuell):
  - Kunde anlegen/bearbeiten/löschen per Formular; Typ wählen (Verein/Platzbauer).
  - Preise pro Saison pflegen; zuletzt gezahlter Preis sichtbar.
- Beziehungen:
  - Vereine einem oder mehreren Platzbauern zuordnen; Übersicht „welche Vereine von welchen Platzbauern beliefert werden“.
- Saison/Call-Liste:
  - Geführte Liste aller aktuellen Kunden; Filter nach Typ, Bundesland, Status (offen/erledigt), Bezugsweg, Platzbauer.
  - Nach Abhaken automatisch zum nächsten offenen Kunden springen.
  - Erfassung pro Kunde: Bestellabsicht, angefragte Menge, Bezugsweg (direkt/Platzbauer + Auswahl), Lieferfenster (früh/spät), Notizen, Status.
- Mengenlogik:
  - Angefragte Menge im Frühjahr erfassen.
  - Tatsächliche Menge zum Saisonabschluss; wird als Referenz fürs Folgejahr gesetzt.
  - Historie bleibt erhalten, kein Überschreiben älterer Jahre.
- Anzeige:
  - Kundendetail: Stammdaten, Ansprechpartner, Preisinfo, Saisonverlauf, aktuelle Saisonfelder, Aktivitätsverlauf.
  - Listenansicht (minimal, klar): Kerninfos (Typ, Ort, Ansprechpartner-Shortlist, letzte/tatsächliche Menge, angefragte Menge aktuelle Saison, Status, Bezugsweg, Preis).

## UX/Workflow (Soll)
1) Kunden diese Woche manuell erfassen (Formular, Typ setzen, Ansprechpartner, Beziehung zu Platzbauer falls Verein).
2) Call-Liste abarbeiten: Kunde öffnen → Gespräch führen → Menge, Bezugsweg, Lieferfenster, Preis, Notiz → abhaken → Auto-Sprung zum nächsten offenen.
3) Während der Saison: Anpassungen der angefragten Menge/Absichten möglich.
4) Saisonabschluss (Juni): Tatsächliche Menge erfassen; System setzt diese als Referenz fürs Folgejahr.
5) Aktivitätsverlauf je Kunde fortschreiben; Historie der Saisons unverändert lassen.

## Nicht-Ziele (vorerst)
- Keine Rollen/Berechtigungen (Einbenutzerteam).
- Kein automatischer Import; alles manuell erfassen.
- Keine komplexe Touren-/Lieferlogistikoptimierung.
- Kein automatisches Mailing/SMS.

## System- und Integrationsaspekte (Annahmen)
- Appwrite Collections anpassen für: Kunden (mit Typ), Ansprechpartner, Beziehungen Verein↔Platzbauer, Saison-Datensätze, Aktivitäten.
- APIs/Services: CRUD für alle genannten Entitäten; Query/Filter für Call-Liste und Verein↔Platzbauer-Beziehungen.

## Offene Fragen (aktualisiert)
1) Status „nicht erreicht / später anrufen“ in der Call-Liste aufnehmen?
2) Follow-ups/Wiedervorlage-Datum (optional, kein Muss) trotzdem vorsehen?
3) Exportbedarf (CSV/Excel) für Call-Liste oder Saisonübersicht?

## Akzeptanzkriterien (grober Vorschlag)
- Kunden lassen sich manuell als Verein oder Platzbauer anlegen; Preise je Saison speicherbar, zuletzt gezahlter Preis sichtbar.
- Vereine können einem oder mehreren Platzbauern zugeordnet werden; Übersicht zeigt „welche Vereine werden von welchen Platzbauern beliefert“.
- Call-Liste ermöglicht Status-Update, Erfassung von Menge, Bezugsweg, Platzbauer, Lieferfenster, Preis, Notiz und springt nach Abhaken zum nächsten offenen Kunden.
- Saisonverlauf und Aktivitätsverlauf je Kunde bleiben erhalten; tatsächliche Menge eines Jahres wird zum Stichtag Referenz fürs Folgejahr.
