# Appwrite Setup für E-Mail-Templates

## Was muss in Appwrite angepasst werden?

Die E-Mail-Templates werden jetzt in den Stammdaten gespeichert. Du musst folgende Felder zur `stammdaten` Collection hinzufügen:

### Collection: `stammdaten`
### Document ID: `stammdaten_data` (falls bereits vorhanden, sonst wird es automatisch erstellt)

## Neue Felder hinzufügen:

### Feld: `emailTemplates` (String, Size: 10000)
- **Typ:** String
- **Größe:** 10000
- **Erforderlich:** Nein (optional)
- **Beschreibung:** JSON-String mit allen E-Mail-Templates

### Initialer Wert (kann über die App gesetzt werden):

```json
{
  "angebot": {
    "betreff": "Angebot {dokumentNummer} - {kundenname}",
    "emailContent": "Sehr geehrte Damen und Herren,\n\nanbei erhalten Sie unser angebot {dokumentNummer}{kundennummerText}.\n\nWir freuen uns auf Ihre Rückmeldung.\n\nBei Fragen stehen wir Ihnen gerne zur Verfügung.\n\nMit freundlichen Grüßen\nKoch Dienste"
  },
  "auftragsbestaetigung": {
    "betreff": "Auftragsbestätigung {dokumentNummer} - {kundenname}",
    "emailContent": "Sehr geehrte Damen und Herren,\n\nanbei erhalten Sie unsere auftragsbestätigung {dokumentNummer}{kundennummerText}.\n\nVielen Dank für Ihren Auftrag. Wir bestätigen Ihnen hiermit die Bestellung.\n\nBei Fragen stehen wir Ihnen gerne zur Verfügung.\n\nMit freundlichen Grüßen\nKoch Dienste"
  },
  "lieferschein": {
    "betreff": "Lieferschein {dokumentNummer} - {kundenname}",
    "emailContent": "Sehr geehrte Damen und Herren,\n\nanbei erhalten Sie unseren lieferschein {dokumentNummer}{kundennummerText}.\n\nBitte bestätigen Sie den Erhalt der Ware.\n\nBei Fragen stehen wir Ihnen gerne zur Verfügung.\n\nMit freundlichen Grüßen\nKoch Dienste"
  },
  "rechnung": {
    "betreff": "Rechnung {dokumentNummer} - {kundenname}",
    "emailContent": "Sehr geehrte Damen und Herren,\n\nanbei erhalten Sie unsere rechnung {dokumentNummer}{kundennummerText}.\n\nBitte überweisen Sie den Rechnungsbetrag innerhalb der angegebenen Zahlungsfrist.\n\nBei Fragen stehen wir Ihnen gerne zur Verfügung.\n\nMit freundlichen Grüßen\nKoch Dienste"
  }
}
```

## Wie füge ich das Feld hinzu?

### Option 1: Über Appwrite Console (Web-Interface)
1. Gehe zu deinem Appwrite-Projekt
2. Navigiere zu **Databases** → **tennismehl24_db** → **stammdaten** Collection
3. Klicke auf **Attributes** (oder **Felder**)
4. Klicke auf **Create Attribute**
5. Wähle **String** als Typ
6. Name: `emailTemplates`
7. Size: `10000`
8. Required: **Nein** (unchecked)
9. Array: **Nein** (unchecked)
10. Klicke auf **Create**

### Option 2: Über das Setup-Script
Falls du ein Setup-Script hast, füge dort das Feld hinzu.

## Nach dem Hinzufügen

Die App wird automatisch:
- Die Templates aus Appwrite laden
- Sie im Stammdaten-Tool anzeigen und bearbeitbar machen
- Änderungen in Appwrite speichern

## Platzhalter

Die folgenden Platzhalter können in den Templates verwendet werden:
- `{dokumentNummer}` - Wird durch die Dokumentnummer ersetzt
- `{kundenname}` - Wird durch den Kundennamen ersetzt
- `{kundennummer}` - Wird durch die Kundennummer ersetzt (falls vorhanden)
- `{kundennummerText}` - Wird durch " (Kundennummer: {kundennummer})" ersetzt, falls vorhanden, sonst leer
