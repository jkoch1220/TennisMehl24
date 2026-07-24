import { useEffect, useRef, useState } from 'react';
import { Package, Wrench } from 'lucide-react';
import AutoGrowTextarea from './AutoGrowTextarea';
import { LayoutPos, ZUBEHOER_WIDTH } from './mindmapUtils';

interface ZubehoerBlaseProps {
  art: 'werkzeuge' | 'materialien';
  text: string;
  pos: LayoutPos;
  onChange: (text: string) => void;
}

const ARTEN = {
  werkzeuge: {
    icon: Wrench,
    label: 'Werkzeuge',
    blase:
      'border-blue-300 bg-blue-50/95 dark:border-blue-700 dark:bg-blue-900/40',
    icon_klasse: 'text-blue-500 dark:text-blue-400',
    label_klasse: 'text-blue-700 dark:text-blue-300',
    input:
      'border-blue-300 bg-white/80 focus:ring-blue-500 dark:border-blue-700 dark:bg-dark-input',
  },
  materialien: {
    icon: Package,
    label: 'Material',
    blase:
      'border-amber-300 bg-amber-100/95 dark:border-amber-700 dark:bg-amber-900/40',
    icon_klasse: 'text-amber-500 dark:text-amber-400',
    label_klasse: 'text-amber-700 dark:text-amber-300',
    input:
      'border-amber-300 bg-white/80 focus:ring-amber-500 dark:border-amber-700 dark:bg-dark-input',
  },
} as const;

/**
 * Werkzeug- (links, blau) bzw. Material-Blase (rechts, gelb) an einem
 * Prozessschritt. Ein Eintrag pro Zeile; Doppelklick = direkt in der Blase
 * bearbeiten, Blur = speichern (leerer Text entfernt die Blase). Die Position
 * folgt automatisch der Schritt-Karte.
 */
const ZubehoerBlase = ({ art, text, pos, onChange }: ZubehoerBlaseProps) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const config = ARTEN[art];
  const ArtIcon = config.icon;

  useEffect(() => {
    if (editing) {
      setDraft(text);
      textRef.current?.select();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const commit = () => {
    setEditing(false);
    if (draft !== text) onChange(draft);
  };

  const eintraege = text
    .split('\n')
    .map((zeile) => zeile.trim())
    .filter(Boolean);

  return (
    <div
      onDoubleClick={() => setEditing(true)}
      title={editing ? undefined : 'Doppelklick: bearbeiten'}
      className={`absolute select-none rounded-lg border p-2 shadow-md transition-[left,top] duration-200 ${config.blase}`}
      style={{ left: pos.x, top: pos.y, width: ZUBEHOER_WIDTH }}
    >
      <div className={`mb-1 flex items-center gap-1.5 text-[11px] font-semibold ${config.label_klasse}`}>
        <ArtIcon className={`h-3.5 w-3.5 shrink-0 ${config.icon_klasse}`} />
        {config.label}
      </div>
      {editing ? (
        <AutoGrowTextarea
          ref={textRef}
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setEditing(false);
          }}
          placeholder={art === 'werkzeuge' ? 'Ein Werkzeug pro Zeile…' : 'Ein Material pro Zeile…'}
          className={`w-full rounded border px-1 py-0.5 text-[13px] leading-[18px] text-gray-900 focus:outline-none focus:ring-1 dark:text-dark-text ${config.input}`}
        />
      ) : (
        <ul className="space-y-0.5">
          {eintraege.map((eintrag, index) => (
            <li
              key={index}
              className="flex items-start gap-1.5 text-[13px] leading-[18px] text-gray-800 dark:text-dark-text"
            >
              <span className={`mt-[7px] h-1 w-1 shrink-0 rounded-full bg-current ${config.icon_klasse}`} />
              <span className="min-w-0 break-words">{eintrag}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default ZubehoerBlase;
