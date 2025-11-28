# Appwrite CORS-Konfiguration für Netlify

## Problem
Wenn die App auf Netlify deployed ist, können keine Daten gespeichert oder geladen werden, weil Appwrite nur `https://localhost` als erlaubte Origin akzeptiert.

## Lösung: Netlify-URL zu Appwrite hinzufügen

### Schritt 1: Appwrite Dashboard öffnen
1. Gehe zu [https://cloud.appwrite.io](https://cloud.appwrite.io)
2. Melde dich an
3. Wähle dein Projekt aus (z.B. `tennismehl24`)

### Schritt 2: Settings öffnen
1. Klicke auf **"Settings"** im linken Menü
2. Scrolle zu **"Platforms"** oder **"Web Apps"**

### Schritt 3: Netlify-URL hinzufügen
1. Klicke auf **"Add Platform"** oder **"Add Web App"**
2. Wähle **"Web App"** als Plattform-Typ
3. Gib die Netlify-URL ein:
   - **Hostname:** `verdant-arithmetic-ca2ff5.netlify.app`
   - Oder die vollständige URL: `https://verdant-arithmetic-ca2ff5.netlify.app`
4. Klicke auf **"Create"** oder **"Save"**

### Schritt 4: Custom Domain (optional)
Falls du eine Custom Domain verwendest (z.B. `tennismehl24.de`), füge diese ebenfalls hinzu:
1. Wiederhole Schritt 3
2. Gib deine Custom Domain ein

### Schritt 5: Überprüfung
Nach dem Hinzufügen sollte die Liste der erlaubten Origins so aussehen:
- `https://localhost` (für lokale Entwicklung)
- `https://verdant-arithmetic-ca2ff5.netlify.app` (für Netlify)

## Wichtig
- **Keine Trailing Slashes:** Verwende `https://verdant-arithmetic-ca2ff5.netlify.app` (nicht `https://verdant-arithmetic-ca2ff5.netlify.app/`)
- **HTTPS verwenden:** Stelle sicher, dass die URL mit `https://` beginnt
- **Wildcards:** Appwrite unterstützt keine Wildcards wie `*.netlify.app` - jede Domain muss einzeln hinzugefügt werden

## Nach dem Setup
Nach dem Hinzufügen der Netlify-URL sollten die CORS-Fehler verschwinden und die App sollte wieder Daten speichern und laden können.

## Troubleshooting
Falls es weiterhin nicht funktioniert:
1. Überprüfe, ob die URL exakt übereinstimmt (Groß-/Kleinschreibung beachten)
2. Warte einige Minuten, da die Änderungen manchmal Zeit brauchen
3. Leere den Browser-Cache und lade die Seite neu
4. Überprüfe die Browser-Konsole auf weitere Fehler
