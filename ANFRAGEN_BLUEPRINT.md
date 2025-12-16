# Blueprint: Automatische E-Mail-Anfragen-Verarbeitung mit n8n

## Übersicht

Dieses Dokument beschreibt das komplette Konzept zur automatischen Verarbeitung von E-Mail-Anfragen mit n8n und der Integration in das TennisMehl24-System.

## Architektur

```
E-Mail-Postfach → n8n Workflow → Appwrite Database → Anfragen-Tool (Frontend)
```

## 1. n8n Workflow Setup

### 1.1 E-Mail-Trigger

**Ziel:** Automatisches Abrufen neuer E-Mails

**Konfiguration:**
- **Trigger:** IMAP / Gmail Trigger
  - E-Mail-Konto konfigurieren (IMAP oder Gmail API)
  - Polling-Intervall: 5-15 Minuten (je nach Volumen)
  - Filter: Nur E-Mails von bestimmten Absendern oder mit bestimmten Keywords

**Beispiel-Filter:**
- Betreff enthält: "Anfrage", "Angebot", "Preis", "Ziegelmehl"
- ODER Absender-Domain ist nicht intern
- ODER E-Mail enthält bestimmte Keywords

### 1.2 E-Mail-Parsing & Extraktion

**Ziel:** Strukturierte Daten aus E-Mails extrahieren

**Schritte:**

1. **E-Mail-Text extrahieren**
   - HTML zu Text konvertieren (falls HTML-E-Mail)
   - Plain-Text beibehalten

2. **AI/LLM-basierte Extraktion** (empfohlen)
   - **n8n AI Node** (OpenAI, Anthropic, etc.)
   - **Prompt-Beispiel:**
     ```
     Extrahiere aus folgender E-Mail-Anfrage strukturierte Daten:
     
     E-Mail:
     {emailText}
     
     Extrahiere:
     - Kundenname (Firmenname oder Name des Absenders)
     - E-Mail-Adresse
     - Telefonnummer
     - Adresse (Straße, PLZ, Ort, Bundesland)
     - Angefragte Menge (in Tonnen)
     - Artikel/Produkt
     - Gewünschtes Lieferdatum
     - Sonstige wichtige Informationen
     
     Antworte im JSON-Format:
     {
       "kundenname": "...",
       "email": "...",
       "telefon": "...",
       "adresse": {
         "strasse": "...",
         "plz": "...",
         "ort": "...",
         "bundesland": "..."
       },
       "menge": 0,
       "artikel": "...",
       "lieferdatum": "...",
       "anfrageinhalt": "...",
       "konfidenz": 0.0-1.0
     }
     ```

3. **RegEx-basierte Fallback-Extraktion** (wenn kein AI verfügbar)
   - PLZ: `\b\d{5}\b`
   - Telefon: `(\+49|0)[\d\s\/\-]+`
   - Mengen: `\d+[\.,]?\d*\s*(tonnen|t|kg|paletten)`
   - Datum: Verschiedene Datumsformate erkennen

4. **Geocoding** (optional)
   - Adresse zu Koordinaten konvertieren (Google Maps API, OpenStreetMap)
   - Für spätere Kartenansicht

### 1.3 Duplikat-Erkennung

**Ziel:** Verhindern von doppelten Einträgen

**Strategie:**
- Hash aus: Absender + Betreff + Datum (nur Tag)
- In Appwrite nach Hash suchen
- Wenn gefunden: Skip oder Update bestehender Eintrag

### 1.4 Appwrite-Integration

**Ziel:** Anfrage in Appwrite speichern

**n8n HTTP Request Node:**
- **Method:** POST
- **URL:** `https://cloud.appwrite.io/v1/databases/{DATABASE_ID}/collections/{ANFRAGEN_COLLECTION_ID}/documents`
- **Headers:**
  ```
  X-Appwrite-Project: {PROJECT_ID}
  X-Appwrite-Key: {API_KEY}
  Content-Type: application/json
  ```
- **Body:**
  ```json
  {
    "documentId": "unique()",
    "data": {
      "emailBetreff": "{{ $json.subject }}",
      "emailAbsender": "{{ $json.from }}",
      "emailDatum": "{{ $json.date }}",
      "emailText": "{{ $json.text }}",
      "emailHtml": "{{ $json.html }}",
      "extrahierteDaten": "{{ $json.extractedData }}",
      "status": "neu",
      "erstelltAm": "{{ $now }}",
      "aktualisiertAm": "{{ $now }}",
      "n8nWorkflowId": "{{ $workflow.id }}",
      "n8nExecutionId": "{{ $execution.id }}"
    }
  }
  ```

**Wichtig:** 
- `extrahierteDaten` muss als JSON-String gespeichert werden
- API-Key mit Schreibrechten auf die Collection

### 1.5 Error Handling

- **Retry-Logik:** Bei Fehlern 3x wiederholen mit Exponential Backoff
- **Error-Notification:** Bei dauerhaften Fehlern E-Mail an Admin
- **Logging:** Alle Schritte in n8n Execution History protokollieren

## 2. Appwrite Collection Schema

### Collection: `anfragen`

**Attributes:**
- `emailBetreff` (String, 500)
- `emailAbsender` (String, 255, required)
- `emailDatum` (String, required) - ISO-Datum
- `emailText` (String, 10000)
- `emailHtml` (String, 50000, optional)
- `extrahierteDaten` (String, 50000) - JSON-String
- `status` (String, enum: neu, zugeordnet, angebot_erstellt, angebot_versendet, abgelehnt, erledigt)
- `zugeordneterKundeId` (String, optional)
- `zugeordneterKundeTyp` (String, enum: dispo, saison, optional)
- `zugeordnetAm` (String, optional) - ISO-Datum
- `zugeordnetVon` (String, optional) - User-ID
- `angebotId` (String, optional) - Projekt-ID
- `angebotErstelltAm` (String, optional) - ISO-Datum
- `angebotVersendetAm` (String, optional) - ISO-Datum
- `bearbeitetVon` (String, optional) - User-ID
- `bearbeitetAm` (String, optional) - ISO-Datum
- `notizen` (String, 5000, optional)
- `erstelltAm` (String, required) - ISO-Datum
- `aktualisiertAm` (String, required) - ISO-Datum
- `n8nWorkflowId` (String, optional)
- `n8nExecutionId` (String, optional)

**Indexes:**
- `emailDatum` (DESC) - Für Sortierung
- `status` - Für Filterung
- `zugeordneterKundeId` - Für Kunden-Zuordnung
- `emailAbsender` - Für Suche

**Permissions:**
- **Create:** n8n API-Key (Server)
- **Read:** Authenticated Users
- **Update:** Authenticated Users
- **Delete:** Admins only

## 3. Frontend-Integration (Anfragen-Tool)

### 3.1 Übersichtsseite

**Features:**
- Liste aller Anfragen mit Status-Badges
- Filter nach Status (neu, zugeordnet, etc.)
- Suche nach Absender, Betreff, Inhalt
- Sortierung nach Datum (neueste zuerst)

**UI-Komponenten:**
- Karten-Layout für jede Anfrage
- Status-Farbcodierung
- Vorschau der extrahierten Daten
- Quick-Actions (Details öffnen, Kunde zuordnen)

### 3.2 Detailansicht

**Features:**
- Vollständiger E-Mail-Text
- Extrahierte Daten übersichtlich dargestellt
- Zugeordneter Kunde (falls vorhanden)
- Aktionen:
  - Kunde zuordnen/ändern
  - Neues Projekt/Angebot erstellen
  - Angebot als versendet markieren
  - Notizen hinzufügen

### 3.3 Kunden-Zuordnung

**Workflow:**
1. Button "Kunde zuordnen" klicken
2. Dialog öffnet sich mit Kundenliste
3. Suche nach Name oder Kundennummer
4. Kunde auswählen (aus Dispo- oder Saison-Kunden)
5. Bei Bedarf: "Neuen Kunden anlegen" → Navigiert zur Kundenliste
6. Nach Zuordnung: Status ändert sich zu "zugeordnet"

**Technische Umsetzung:**
- `anfragenService.updateAnfrage()` aufrufen
- `zugeordneterKundeId` und `zugeordneterKundeTyp` setzen
- Status auf "zugeordnet" setzen

### 3.4 Angebot erstellen

**Workflow:**
1. Voraussetzung: Kunde muss zugeordnet sein
2. Button "Angebot erstellen" klicken
3. Dialog öffnet sich:
   - Projektname (vorausgefüllt: "Kundenname - Jahr")
   - Saisonjahr
   - Angefragte Menge (aus extrahierten Daten)
   - Preis pro Tonne (optional)
   - Bezugsweg
   - Notizen
4. "Projekt erstellen" klicken
5. Neues Projekt wird erstellt (über `projektService.createProjekt()`)
6. Anfrage wird aktualisiert:
   - `angebotId` = Projekt-ID
   - Status = "angebot_erstellt"
7. Automatische Weiterleitung zur Bestellabwicklung

**Technische Umsetzung:**
- `projektService.createProjekt()` aufrufen
- `anfragenService.updateAnfrage()` mit `angebotId` aufrufen
- Navigation zu `/bestellabwicklung/{projektId}`

### 3.5 Angebot versenden

**Workflow:**
1. In der Bestellabwicklung Angebot erstellen/versenden
2. Zurück zur Anfragen-Seite
3. Button "Als versendet markieren" klicken
4. Status ändert sich zu "angebot_versendet"
5. `angebotVersendetAm` wird gesetzt

**Alternative:** Automatische Markierung wenn Angebot in Bestellabwicklung versendet wird

## 4. Erweiterte Features (Optional)

### 4.1 Automatische Kunden-Zuordnung

**Ziel:** KI-basierte Zuordnung zu bestehenden Kunden

**Umsetzung:**
- In n8n: Nach Extraktion Kundenliste aus Appwrite laden
- AI-Vergleich: Extrahierter Name/Adresse mit bestehenden Kunden
- Wenn Match (Konfidenz > 0.8): Automatisch zuordnen
- Status: "zugeordnet" (automatisch)

### 4.2 E-Mail-Benachrichtigungen

**Ziel:** Benachrichtigung bei neuen Anfragen

**Umsetzung:**
- n8n: Nach erfolgreichem Speichern E-Mail an Team senden
- ODER: Webhook zu Slack/Teams
- ODER: Push-Notification (wenn implementiert)

### 4.3 Duplikat-Erkennung & Zusammenführung

**Ziel:** Ähnliche Anfragen erkennen und zusammenführen

**Umsetzung:**
- Fuzzy-Matching auf Absender + Betreff
- Wenn ähnlich: Als "Duplikat" markieren oder zusammenführen
- UI: Duplikate gruppiert anzeigen

### 4.4 Statistiken & Reporting

**Ziel:** Übersicht über Anfragen-Volumen

**Features:**
- Anzahl Anfragen pro Monat
- Conversion-Rate (Anfrage → Angebot → Auftrag)
- Durchschnittliche Bearbeitungszeit
- Top-Anfragequellen

## 5. Sicherheit & Best Practices

### 5.1 API-Key Sicherheit

- **n8n:** API-Key in n8n Credentials speichern (verschlüsselt)
- **Niemals** API-Key in Code committen
- Separate API-Keys für n8n (nur Schreibrechte) und Frontend (Lese-/Schreibrechte)

### 5.2 Datenvalidierung

- **n8n:** Alle Daten vor dem Speichern validieren
- **Frontend:** Client-seitige Validierung + Server-seitige Validierung in Appwrite
- **Sanitization:** E-Mail-HTML bereinigen (XSS-Schutz)

### 5.3 Rate Limiting

- n8n: Max. 1 Request pro Sekunde an Appwrite
- Appwrite: Rate Limits konfigurieren

### 5.4 Monitoring

- **n8n:** Execution History überwachen
- **Appwrite:** Logs für fehlgeschlagene Requests
- **Frontend:** Error-Tracking (z.B. Sentry)

## 6. Deployment-Checkliste

### n8n Setup
- [ ] E-Mail-Account konfiguriert (IMAP/Gmail)
- [ ] n8n Workflow erstellt
- [ ] AI-Node konfiguriert (falls verwendet)
- [ ] Appwrite API-Key erstellt und in n8n gespeichert
- [ ] Test-E-Mail gesendet und Workflow getestet
- [ ] Error-Handling implementiert
- [ ] Workflow aktiviert

### Appwrite Setup
- [ ] Collection `anfragen` erstellt
- [ ] Alle Attributes definiert
- [ ] Indexes erstellt
- [ ] Permissions konfiguriert
- [ ] API-Key für n8n erstellt

### Frontend
- [ ] Tool "Anfragen" in `constants/tools.ts` hinzugefügt
- [ ] Route in `App.tsx` hinzugefügt
- [ ] Collection-ID in `appwrite.ts` hinzugefügt
- [ ] Service `anfragenService.ts` erstellt
- [ ] Komponente `Anfragen.tsx` erstellt
- [ ] Typen in `types/anfragen.ts` definiert
- [ ] Getestet: Liste anzeigen, Details öffnen, Kunde zuordnen, Angebot erstellen

## 7. Testing

### n8n Workflow Test
1. Test-E-Mail senden
2. Workflow manuell auslösen
3. Prüfen: Wurde Anfrage in Appwrite erstellt?
4. Prüfen: Sind extrahierte Daten korrekt?

### Frontend Test
1. Anfragen-Seite öffnen
2. Liste sollte geladen werden
3. Filter testen
4. Suche testen
5. Detailansicht öffnen
6. Kunde zuordnen
7. Angebot erstellen
8. Navigation zur Bestellabwicklung prüfen

## 8. Troubleshooting

### Problem: E-Mails werden nicht erkannt
- **Lösung:** Filter in n8n anpassen, Polling-Intervall prüfen

### Problem: Extraktion funktioniert nicht
- **Lösung:** AI-Prompt anpassen, Fallback auf RegEx

### Problem: Duplikate werden erstellt
- **Lösung:** Duplikat-Erkennung implementieren/verbessern

### Problem: API-Fehler beim Speichern
- **Lösung:** API-Key prüfen, Permissions prüfen, Rate Limits prüfen

## 9. Zukünftige Verbesserungen

- **Automatische Angebotserstellung:** Basierend auf extrahierten Daten
- **E-Mail-Antwort:** Automatische Bestätigung an Absender
- **Integration mit CRM:** Zwei-Wege-Sync
- **Machine Learning:** Verbesserte Extraktion durch Training
- **Multi-Language:** Unterstützung für englische E-Mails

---

**Erstellt:** 2026
**Version:** 1.0
**Autor:** TennisMehl24 Development Team

