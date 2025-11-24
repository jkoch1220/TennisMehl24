# Appwrite Setup-Anleitung für TennisMehl24

## Schritt 1: Appwrite-Konfiguration

### Für lokale Entwicklung:
Erstelle eine `.env`-Datei im Root-Verzeichnis des Projekts mit folgenden Werten:

```env
VITE_APPWRITE_PROJECT_ID=tennismehl24
VITE_APPWRITE_PROJECT_NAME=TennisMehl24
VITE_APPWRITE_ENDPOINT=https://fra.cloud.appwrite.io/v1
VITE_APPWRITE_API_KEY=dein_api_key_hier
```

**WICHTIG**: Die `.env`-Datei ist bereits in `.gitignore` und wird nicht gepusht.

### Für Netlify:
Setze die folgenden Umgebungsvariablen im Netlify-Dashboard (Site Settings → Environment variables):

**Erforderliche Variablen:**
- `VITE_APPWRITE_PROJECT_ID` = `tennismehl24`
- `VITE_APPWRITE_PROJECT_NAME` = `TennisMehl24`
- `VITE_APPWRITE_ENDPOINT` = `https://fra.cloud.appwrite.io/v1`
- `VITE_APPWRITE_API_KEY` = Dein API Key (siehe Schritt 6)

**WICHTIG für Secrets Scanning:**
Um Netlify Secrets Scanning zu konfigurieren, füge zusätzlich hinzu:
- `SECRETS_SCAN_OMIT_KEYS` = `VITE_APPWRITE_PROJECT_ID,VITE_APPWRITE_PROJECT_NAME,VITE_APPWRITE_ENDPOINT`

Dies teilt Netlify mit, dass diese Werte öffentlich sind und nicht als Secrets behandelt werden sollen.

## Schritt 2: Appwrite-Projekt erstellen

1. Gehe zu [Appwrite Cloud](https://cloud.appwrite.io) und melde dich an
2. Erstelle ein neues Projekt mit folgenden Einstellungen:
   - **Project ID**: `tennismehl24`
   - **Project Name**: `TennisMehl24`

## Schritt 3: Datenbank erstellen

1. Gehe zu **Databases** im Appwrite-Dashboard
2. Klicke auf **Create Database**
3. Verwende folgende Einstellungen:
   - **Database ID**: `tennismehl24_db`
   - **Database Name**: `TennisMehl24 Database`

## Schritt 4: Collection "fixkosten" erstellen

1. In der Datenbank `tennismehl24_db`, klicke auf **Create Collection**
2. Verwende folgende Einstellungen:
   - **Collection ID**: `fixkosten`
   - **Collection Name**: `Fixkosten`

### Felder für "fixkosten" Collection:

**✅ AUTOMATISCH**: Die Felder werden automatisch erstellt! Du musst sie nicht manuell anlegen.

Falls du sie manuell erstellen möchtest, hier die Liste (alle vom Typ **Double**):

#### Grundstück:
- `grundstueck_pacht` (Double)
- `grundstueck_steuer` (Double)
- `grundstueck_pflege` (Double)
- `grundstueck_buerocontainer` (Double)

#### Maschinen:
- `maschinen_wartungRadlader` (Double)
- `maschinen_wartungStapler` (Double)
- `maschinen_wartungMuehle` (Double)
- `maschinen_wartungSiebanlage` (Double)
- `maschinen_wartungAbsackanlage` (Double)
- `maschinen_sonstigeWartung` (Double)
- `maschinen_grundkostenMaschinen` (Double)

#### Sonstige:
- `ruecklagenErsatzkauf` (Double)
- `sonstiges` (Double)

#### Verwaltung:
- `verwaltung_sigleKuhn` (Double)
- `verwaltung_brzSteuerberater` (Double)
- `verwaltung_kostenVorndran` (Double)
- `verwaltung_telefonCloudServer` (Double)
- `verwaltung_gewerbesteuer` (Double)

### Berechtigungen für "fixkosten":

- **Read Access**: `users` (oder `any` für öffentlichen Zugriff)
- **Write Access**: `users` (oder `any` für öffentlichen Zugriff)
- **Update Access**: `users` (oder `any` für öffentlichen Zugriff)
- **Delete Access**: `users` (oder `any` für öffentlichen Zugriff)

**WICHTIG**: Wenn du keine Authentifizierung verwendest, setze alle Berechtigungen auf `any`.

## Schritt 5: Collection "variable_kosten" erstellen

1. In der Datenbank `tennismehl24_db`, klicke auf **Create Collection**
2. Verwende folgende Einstellungen:
   - **Collection ID**: `variable_kosten`
   - **Collection Name**: `Variable Kosten`

### Felder für "variable_kosten" Collection:

**✅ AUTOMATISCH**: Die Felder werden automatisch erstellt! Du musst sie nicht manuell anlegen.

Falls du sie manuell erstellen möchtest, hier die Liste (alle vom Typ **Double**):

#### Lohnkosten:
- `lohnkosten_stundenlohn` (Double)
- `lohnkosten_tonnenProArbeitsstunde` (Double)

#### Einkauf:
- `einkauf_dieselKostenProTonne` (Double)
- `einkauf_ziegelbruchKostenProTonne` (Double)
- `einkauf_stromKostenProTonne` (Double)
- `einkauf_entsorgungContainerKostenProTonne` (Double)
- `einkauf_gasflaschenKostenProTonne` (Double)

#### Verschleißteile:
- `verschleissteile_preisProHammer` (Double)
- `verschleissteile_verbrauchHaemmerProTonne` (Double)
- `verschleissteile_siebkoerbeKostenProTonne` (Double)
- `verschleissteile_verschleissblecheKostenProTonne` (Double)
- `verschleissteile_wellenlagerKostenProTonne` (Double)

#### Sackware:
- `sackware_palettenKostenProPalette` (Double)
- `sackware_saeckeKostenProPalette` (Double)
- `sackware_schrumpfhaubenKostenProPalette` (Double)
- `sackware_palettenProTonne` (Double)

#### Verkaufspreise:
- `verkaufspreis1_tonnen` (Double)
- `verkaufspreis1_preisProTonne` (Double)
- `verkaufspreis2_tonnen` (Double)
- `verkaufspreis2_preisProTonne` (Double)
- `verkaufspreis3_tonnen` (Double)
- `verkaufspreis3_preisProTonne` (Double)

#### Sonstiges:
- `geplanterUmsatz` (Double)

### Berechtigungen für "variable_kosten":

- **Read Access**: `users` (oder `any` für öffentlichen Zugriff)
- **Write Access**: `users` (oder `any` für öffentlichen Zugriff)
- **Update Access**: `users` (oder `any` für öffentlichen Zugriff)
- **Delete Access**: `users` (oder `any` für öffentlichen Zugriff)

**WICHTIG**: Wenn du keine Authentifizierung verwendest, setze alle Berechtigungen auf `any`.

## Schritt 6: API Key erstellen (ERFORDERLICH für automatisches Field-Setup)

**⚠️ WICHTIG**: Um die Felder automatisch zu erstellen, benötigst du einen API Key!

1. Gehe zu **Settings** → **API Keys** im Appwrite-Dashboard
2. Klicke auf **Create API Key**
3. Gib einen Namen ein (z.B. "TennisMehl24 Setup")
4. Wähle folgende Berechtigungen:
   - `databases.read`
   - `databases.write`
   - `databases.update`
   - `databases.delete`
5. Kopiere den API Key (wird nur einmal angezeigt!)

### Für lokale Entwicklung:
Füge den API Key zur `.env`-Datei hinzu:
```env
VITE_APPWRITE_API_KEY=dein_api_key_hier
```

### Für Netlify:
Füge den API Key als Umgebungsvariable `VITE_APPWRITE_API_KEY` im Netlify-Dashboard hinzu.

## Schritt 7: Felder automatisch erstellen

### Option 1: Automatisch beim App-Start (Empfohlen)
Wenn `VITE_APPWRITE_API_KEY` gesetzt ist, werden die Felder automatisch beim ersten App-Start erstellt.

### Option 2: Manuell per Script
Falls du die Felder manuell erstellen möchtest, führe aus:

```bash
npm run setup:appwrite
```

Das Script erstellt alle benötigten Felder automatisch.

## Schritt 8: Dokumente erstellen

Nachdem die Collections erstellt wurden, werden die Dokumente automatisch beim ersten Speichern erstellt. Die Dokument-IDs sind:

- **Fixkosten**: `fixkosten_data`
- **Variable Kosten**: `variable_kosten_data`

## Zusammenfassung der benötigten IDs:

- **Database ID**: `tennismehl24_db`
- **Collection ID (Fixkosten)**: `fixkosten`
- **Collection ID (Variable Kosten)**: `variable_kosten`
- **Document ID (Fixkosten)**: `fixkosten_data`
- **Document ID (Variable Kosten)**: `variable_kosten_data`

## Funktionsweise:

- Beim Öffnen der Rechner werden die Daten automatisch aus Appwrite geladen
- Bei jeder Eingabe werden die Daten automatisch nach 1 Sekunde Inaktivität gespeichert
- Ein "Gespeichert"-Indikator zeigt den Status an
- Die Daten werden in Echtzeit synchronisiert

## Fehlerbehebung:

Falls Fehler auftreten:
1. Überprüfe die `.env`-Datei
2. Überprüfe die Collection-IDs und Feldnamen
3. Überprüfe die Berechtigungen in Appwrite
4. Öffne die Browser-Konsole für detaillierte Fehlermeldungen

