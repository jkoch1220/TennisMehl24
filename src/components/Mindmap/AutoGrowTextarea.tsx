import {
  TextareaHTMLAttributes,
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
} from 'react';

/**
 * Textarea, die mit dem Inhalt nach unten mitwächst, damit beim
 * Bearbeiten immer der gesamte Text sichtbar ist (min. eine Zeile;
 * Mindesthöhe über `min-h-*`-Klassen steuerbar).
 */
const AutoGrowTextarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, value, ...props }, outerRef) => {
  const innerRef = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(outerRef, () => innerRef.current as HTMLTextAreaElement);

  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    el.style.height = 'auto';
    // Rahmenhöhe mitrechnen (box-border), sonst bleibt ein Scrollrest
    const borders = el.offsetHeight - el.clientHeight;
    el.style.height = `${el.scrollHeight + borders}px`;
  }, [value]);

  return (
    <textarea
      ref={innerRef}
      value={value}
      rows={1}
      className={`resize-none overflow-hidden ${className ?? ''}`}
      {...props}
    />
  );
});

AutoGrowTextarea.displayName = 'AutoGrowTextarea';

export default AutoGrowTextarea;
