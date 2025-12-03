# Appwrite Collections Setup - Anleitung

Diese Anleitung erklärt, wie Sie die benötigten Collections in Appwrite anlegen müssen, damit die Dispo-Planung funktioniert.

## Voraussetzungen

- Zugriff auf Ihr Appwrite Dashboard
- Projekt-ID: `tennismehl24_db` (oder wie in Ihrer `.env` definiert)
- API Key mit Admin-Rechten

## Collections die angelegt werden müssen

Die folgenden Collections müssen in Appwrite erstellt werden:

1. **bestellungen** - Für die Bestellungsverwaltung
2. **kunden** - Für die Kundenverwaltung
3. **lieferungen** - Für Lieferungen (falls noch nicht vorhanden)
4. **routen** - Für Routen (falls noch nicht vorhanden)
5. **fahrzeuge** - Für Fahrzeuge (falls noch nicht vorhanden)
6. **kreditoren** - Für die Kreditoren-Verwaltung (Glaubiger)
7. **offene_rechnungen** - Für die Verwaltung offener Rechnungen
8. **konkurrenten** - Für die Konkurrenten-Verwaltung und Lieferkosten-Analyse
9. **tickets** - Für Verbesserungsvorschläge/Tickets
10. **todos** - Für die TODO-Verwaltung
11. **wiki_pages** - Für Wiki-Seiten
12. **wiki_files** - Für Wiki-Dateianhänge

## Schritt-für-Schritt Anleitung

### 1. Appwrite Dashboard öffnen

1. Gehen Sie zu Ihrem Appwrite Dashboard: `https://cloud.appwrite.io` (oder Ihre Instanz)
2. Wählen Sie Ihr Projekt aus

### 2. Database öffnen

1. Klicken Sie auf **"Databases"** im linken Menü
2. Wählen Sie die Database `tennismehl24_db` aus (oder erstellen Sie sie, falls sie nicht existiert)

### 3. Collections erstellen

Für jede Collection führen Sie folgende Schritte aus:

#### Collection: `bestellungen`

1. Klicken Sie auf **"Create Collection"**
2. Collection ID: `bestellungen`
3. Name: `Bestellungen`
4. Klicken Sie auf **"Create"**
5. **Wichtig:** Erstellen Sie ein Attribut:
   - Klicken Sie auf **"Create Attribute"**
   - Typ: **String**
   - Key: `data`
   - Required: **Nein**
   - Size: `100000` (für große JSON-Strings)
   - Klicken Sie auf **"Create"**

#### Collection: `kunden`

1. Klicken Sie auf **"Create Collection"**
2. Collection ID: `kunden`
3. Name: `Kunden`
4. Klicken Sie auf **"Create"**
5. Erstellen Sie ein Attribut:
   - Typ: **String**
   - Key: `data`
   - Required: **Nein**
   - Size: `100000`
   - Klicken Sie auf **"Create"**

#### Collection: `lieferungen` (falls noch nicht vorhanden)

1. Klicken Sie auf **"Create Collection"**
2. Collection ID: `lieferungen`
3. Name: `Lieferungen`
4. Klicken Sie auf **"Create"**
5. Erstellen Sie ein Attribut:
   - Typ: **String**
   - Key: `data`
   - Required: **Nein**
   - Size: `100000`
   - Klicken Sie auf **"Create"**

#### Collection: `routen` (falls noch nicht vorhanden)

1. Klicken Sie auf **"Create Collection"**
2. Collection ID: `routen`
3. Name: `Routen`
4. Klicken Sie auf **"Create"**
5. Erstellen Sie ein Attribut:
   - Typ: **String**
   - Key: `data`
   - Required: **Nein**
   - Size: `100000`
   - Klicken Sie auf **"Create"**

#### Collection: `fahrzeuge` (falls noch nicht vorhanden)

1. Klicken Sie auf **"Create Collection"**
2. Collection ID: `fahrzeuge`
3. Name: `Fahrzeuge`
4. Klicken Sie auf **"Create"**
5. Erstellen Sie ein Attribut:
   - Typ: **String**
   - Key: `data`
   - Required: **Nein**
   - Size: `100000`
   - Klicken Sie auf **"Create"**

#### Collection: `kreditoren`

1. Klicken Sie auf **"Create Collection"**
2. Collection ID: `kreditoren`
3. Name: `Kreditoren`
4. Klicken Sie auf **"Create"**
5. Erstellen Sie ein Attribut:
   - Typ: **String**
   - Key: `data`
   - Required: **Nein**
   - Size: `100000`
   - Klicken Sie auf **"Create"**

#### Collection: `offene_rechnungen`

1. Klicken Sie auf **"Create Collection"**
2. Collection ID: `offene_rechnungen`
3. Name: `Offene Rechnungen`
4. Klicken Sie auf **"Create"**
5. Erstellen Sie ein Attribut:
   - Typ: **String**
   - Key: `data`
   - Required: **Nein**
   - Size: `100000`
   - Klicken Sie auf **"Create"**

#### Collection: `konkurrenten`

1. Klicken Sie auf **"Create Collection"**
2. Collection ID: `konkurrenten`
3. Name: `Konkurrenten`
4. Klicken Sie auf **"Create"**
5. Erstellen Sie ein Attribut:
   - Typ: **String**
   - Key: `data`
   - Required: **Nein**
   - Size: `100000`
   - Klicken Sie auf **"Create"**

#### Collection: `tickets`

1. Klicken Sie auf **"Create Collection"**
2. Collection ID: `tickets`
3. Name: `Tickets`
4. Klicken Sie auf **"Create"**
5. Erstellen Sie ein Attribut:
   - Typ: **String**
   - Key: `data`
   - Required: **Nein**
   - Size: `100000`
   - Klicken Sie auf **"Create"**

#### Collection: `todos`

1. Klicken Sie auf **"Create Collection"**
2. Collection ID: `todos`
3. Name: `TODOs`
4. Klicken Sie auf **"Create"**
5. Erstellen Sie ein Attribut:
   - Typ: **String**
   - Key: `data`
   - Required: **Nein**
   - Size: `100000`
   - Klicken Sie auf **"Create"**

#### Collection: `wiki_pages`

1. Klicken Sie auf **"Create Collection"**
2. Collection ID: `wiki_pages`
3. Name: `Wiki Seiten`
4. Klicken Sie auf **"Create"**
5. Erstellen Sie folgende Attribute:

| Key | Typ | Size | Required | Default |
|-----|-----|------|----------|---------|
| `title` | String | 500 | Ja | - |
| `slug` | String | 500 | Ja | - |
| `content` | String | 1000000 | Nein | - |
| `description` | String | 1000 | Nein | - |
| `icon` | String | 10 | Nein | 📄 |
| `sortOrder` | Integer | - | Nein | 0 |
| `isPublished` | Boolean | - | Nein | true |
| `parentId` | String | 100 | Nein | - |
| `createdBy` | String | 100 | Nein | - |
| `lastEditedBy` | String | 100 | Nein | - |

6. **Index erstellen** für schnelle Suche:
   - Klicken Sie auf **"Indexes"**
   - Erstellen Sie einen Index auf `slug` (Unique)
   - Erstellen Sie einen Index auf `sortOrder`

#### Collection: `wiki_files`

1. Klicken Sie auf **"Create Collection"**
2. Collection ID: `wiki_files`
3. Name: `Wiki Dateien`
4. Klicken Sie auf **"Create"**
5. Erstellen Sie folgende Attribute:

| Key | Typ | Size | Required |
|-----|-----|------|----------|
| `pageId` | String | 100 | Ja |
| `fileName` | String | 500 | Ja |
| `fileId` | String | 100 | Ja |
| `mimeType` | String | 100 | Ja |
| `size` | Integer | - | Ja |

6. **Index erstellen**:
   - Erstellen Sie einen Index auf `pageId`

### Storage Bucket für Wiki-Dateien erstellen

1. Gehen Sie zu **"Storage"** im linken Menü
2. Klicken Sie auf **"Create Bucket"**
3. Bucket ID: `wiki-dateien`
4. Name: `Wiki Dateien`
5. Maximale Dateigröße: `50000000` (50 MB)
6. Erlaubte Dateierweiterungen: `pdf,doc,docx,xls,xlsx,ppt,pptx,txt,csv,jpg,jpeg,png,gif,webp,svg,zip,rar`
7. Aktivieren Sie **File security**
8. Setzen Sie die Berechtigungen:
   - Read: `users` oder `any`
   - Create: `users`
   - Update: `users`
   - Delete: `users`

## Berechtigungen setzen

Für jede Collection müssen Sie die Berechtigungen setzen:

1. Gehen Sie zu **"Settings"** in der Collection
2. Unter **"Permissions"**:
   - **Read**: Erlauben Sie `users` oder `any` (je nach Ihren Sicherheitsanforderungen)
   - **Create**: Erlauben Sie `users` oder `any`
   - **Update**: Erlauben Sie `users` oder `any`
   - **Delete**: Erlauben Sie `users` oder `any`

**Wichtig für Netlify:** Falls Sie die App auf Netlify deployen, müssen Sie auch die CORS-Einstellungen anpassen (siehe `APPWRITE_NETLIFY_SETUP.md`).

## Automatisches Setup (Optional)

Alternativ können Sie das Setup-Script ausführen, das die Felder automatisch erstellt:

```bash
npm run setup:appwrite
```

**Hinweis:** Das Script erstellt nur die Felder, nicht die Collections selbst. Die Collections müssen manuell erstellt werden (siehe oben).

## Verifizierung

Nach dem Setup sollten Sie:

1. In der App eine Bestellung erstellen können
2. Kunden auswählen können (ohne 404-Fehler)
3. Bestellungen speichern können

Falls weiterhin Fehler auftreten:

- Überprüfen Sie die Collection-IDs in `src/config/appwrite.ts`
- Überprüfen Sie die Berechtigungen in Appwrite
- Überprüfen Sie die CORS-Einstellungen (siehe `APPWRITE_NETLIFY_SETUP.md`)

