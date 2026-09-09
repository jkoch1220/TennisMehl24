/**
 * Rückmeldung an der Anlage: Ton, Vibration, Bewegung.
 * ============================================================================
 *
 * Wer mit Handschuhen und Gehörschutz am Band steht, sieht das Display oft nur
 * kurz. Deshalb bestätigt jede Aktion doppelt — spürbar UND hörbar —, und die
 * Muster sind so gewählt, dass sie sich unterscheiden lassen, ohne hinzusehen:
 * ein Tick beim Verstellen, ein aufsteigender Zweiklang beim Buchen, ein
 * dumpfes Brummen bei Fehler oder Anschlag.
 *
 * Drei Dinge, die die frühere Fassung (inline in SwipeWheelPicker) falsch
 * machte und die hier gelöst sind:
 *
 * 1. Der AudioContext wurde beim ersten Ton erzeugt — also oft mitten in einer
 *    Geste. Browser starten ihn dann im Zustand `suspended`, und der erste,
 *    wichtigste Ton fiel aus. Hier wird er bei der ersten Berührung/Taste
 *    geweckt (`weckeAudio`).
 * 2. Es gab keinen Schalter. In einer stillen Werkstatt oder im Büro ist
 *    Piepen unerwünscht — `setTonAn` / `setHaptikAn` merken sich die Wahl.
 * 3. `prefers-reduced-motion` wurde ignoriert. Wer Bewegung abgestellt hat,
 *    bekommt hier auch keine Animationen aufgedrängt (`bewegungReduziert`).
 */

// ---------------------------------------------------------------------------
// Einstellungen (pro Gerät, im localStorage)
// ---------------------------------------------------------------------------

const SPEICHER_TON = 'produktion_ton_an';
const SPEICHER_HAPTIK = 'produktion_haptik_an';

const leseSchalter = (schluessel: string): boolean => {
  try {
    return localStorage.getItem(schluessel) !== 'aus';
  } catch {
    return true;
  }
};

let tonAn = leseSchalter(SPEICHER_TON);
let haptikAn = leseSchalter(SPEICHER_HAPTIK);

export const istTonAn = () => tonAn;
export const istHaptikAn = () => haptikAn;

export const setTonAn = (an: boolean): void => {
  tonAn = an;
  try {
    localStorage.setItem(SPEICHER_TON, an ? 'an' : 'aus');
  } catch {
    /* privater Modus: Einstellung gilt dann nur für diese Sitzung */
  }
};

export const setHaptikAn = (an: boolean): void => {
  haptikAn = an;
  try {
    localStorage.setItem(SPEICHER_HAPTIK, an ? 'an' : 'aus');
  } catch {
    /* siehe oben */
  }
};

/** Hat der Nutzer im Betriebssystem weniger Bewegung eingestellt? */
export const bewegungReduziert = (): boolean => {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

// ---------------------------------------------------------------------------
// Ton
// ---------------------------------------------------------------------------

let audioKontext: AudioContext | null = null;

const holeKontext = (): AudioContext | null => {
  if (typeof window === 'undefined') return null;
  if (!audioKontext) {
    const Konstruktor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Konstruktor) return null;
    try {
      audioKontext = new Konstruktor();
    } catch {
      return null;
    }
  }
  return audioKontext;
};

/**
 * Einmal bei der ersten echten Nutzergeste aufrufen. Danach ist der erste
 * bewusste Ton nicht mehr der, der verschluckt wird.
 */
export const weckeAudio = (): void => {
  const ctx = holeKontext();
  if (ctx && ctx.state === 'suspended') {
    void ctx.resume();
  }
};

export type Klang =
  | 'tick' // Wert um eins verstellt
  | 'raste' // spürbare Raste (Zehnerschritt, Schnellwert)
  | 'wechsel' // Bereich/Tab gewechselt
  | 'gebucht' // Buchung gespeichert
  | 'storno' // Buchung zurückgenommen
  | 'anschlag' // Minimum/Maximum erreicht
  | 'fehler';

interface KlangDef {
  frequenz: number;
  /** Zielfrequenz für eine Tonhöhenbewegung; fehlt = gleichbleibend. */
  ziel?: number;
  dauer: number;
  lautstaerke: number;
  form: OscillatorType;
}

const KLAENGE: Record<Klang, KlangDef> = {
  tick: { frequenz: 1180, dauer: 0.018, lautstaerke: 0.07, form: 'sine' },
  raste: { frequenz: 820, dauer: 0.03, lautstaerke: 0.11, form: 'triangle' },
  wechsel: { frequenz: 640, ziel: 880, dauer: 0.05, lautstaerke: 0.09, form: 'sine' },
  gebucht: { frequenz: 660, ziel: 1320, dauer: 0.13, lautstaerke: 0.16, form: 'sine' },
  storno: { frequenz: 620, ziel: 300, dauer: 0.14, lautstaerke: 0.13, form: 'triangle' },
  anschlag: { frequenz: 240, ziel: 180, dauer: 0.07, lautstaerke: 0.09, form: 'square' },
  fehler: { frequenz: 300, ziel: 150, dauer: 0.2, lautstaerke: 0.14, form: 'sawtooth' },
};

/**
 * Drosselung. Ein längerer Schwung am Mengenrad erzeugt sonst dutzende
 * Oszillatoren in wenigen Millisekunden — hörbar als Rauschen, spürbar als
 * ruckelnde Oberfläche.
 */
let letzterTick = 0;

export const spieleKlang = (klang: Klang): void => {
  if (!tonAn) return;
  const ctx = holeKontext();
  if (!ctx) return;
  if (ctx.state === 'suspended') void ctx.resume();

  if (klang === 'tick') {
    const abstand = performance.now();
    if (abstand - letzterTick < 40) return;
    letzterTick = abstand;
  }

  const def = KLAENGE[klang];
  const jetzt = ctx.currentTime;

  const oszillator = ctx.createOscillator();
  const verstaerker = ctx.createGain();

  oszillator.type = def.form;
  oszillator.frequency.setValueAtTime(def.frequenz, jetzt);
  if (def.ziel) {
    // exponentialRampToValueAtTime wirft bei 0 — die Frequenzen hier sind alle
    // deutlich darüber, der Guard steht trotzdem, falls jemand nachträglich
    // einen Klang ergänzt.
    oszillator.frequency.exponentialRampToValueAtTime(Math.max(1, def.ziel), jetzt + def.dauer);
  }

  // Kurze Anstiegsflanke: ohne sie knackt jeder Ton hörbar.
  verstaerker.gain.setValueAtTime(0.0001, jetzt);
  verstaerker.gain.exponentialRampToValueAtTime(def.lautstaerke, jetzt + 0.005);
  verstaerker.gain.exponentialRampToValueAtTime(0.0001, jetzt + def.dauer);

  oszillator.connect(verstaerker);
  verstaerker.connect(ctx.destination);
  oszillator.start(jetzt);
  oszillator.stop(jetzt + def.dauer + 0.02);
};

/**
 * AudioContexts sind auf iOS/Safari zahlenmäßig begrenzt. Beim Verlassen des
 * Tools wird der Kontext geschlossen — sonst sammeln sich bei jedem Aufruf
 * neue an, bis irgendwann gar kein Ton mehr kommt.
 */
export const schliesseAudio = (): void => {
  if (audioKontext) {
    void audioKontext.close().catch(() => undefined);
    audioKontext = null;
  }
};

// ---------------------------------------------------------------------------
// Vibration
// ---------------------------------------------------------------------------

export type Vibration = 'tick' | 'raste' | 'wechsel' | 'gebucht' | 'storno' | 'anschlag' | 'fehler';

const MUSTER: Record<Vibration, number | number[]> = {
  tick: 6,
  raste: 12,
  wechsel: 10,
  gebucht: [25, 40, 55],
  storno: [40, 60, 20],
  anschlag: [15, 25, 15],
  fehler: [60, 50, 60],
};

export const vibriere = (muster: Vibration): void => {
  if (!haptikAn) return;
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  try {
    navigator.vibrate(MUSTER[muster]);
  } catch {
    /* Safari auf iOS kennt vibrate nicht — dort trägt der Ton allein */
  }
};

/**
 * Beides zusammen — der Normalfall. Getrennte Aufrufe gibt es nur dort, wo
 * bewusst nur eine Sinnesmodalität bedient werden soll.
 */
export const melde = (was: Klang & Vibration): void => {
  spieleKlang(was);
  vibriere(was);
};
