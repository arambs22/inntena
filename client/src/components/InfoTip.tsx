import { useEffect, useId, useRef, useState, type ReactNode } from "react";

/** Viewport space, in px, the explanation panel needs above the button; with less, it opens below. */
const PANEL_ROOM_ABOVE = 300;

interface InfoTipProps {
  /** Accessible name of the "?" button; also names the explanation panel. */
  label: string;
  children: ReactNode;
}

/**
 * A small "?" button that opens a floating explanation above it. Click or keyboard toggles it
 * (so it works on touch too); it closes on Escape, an outside click, scrolling or resizing.
 *
 * The panel opens above the button, or below it when the button sits near the top of the viewport. It uses `fixed` coordinates taken from the button's bounding rect, not `absolute`: the
 * button often lives inside a scrolling container (a modal), which would otherwise clip the panel.
 * Escape is caught in the capture phase and stopped, so inside a modal it closes only this panel
 * instead of the whole dialog.
 */
export function InfoTip({ label, children }: InfoTipProps) {
  const [anchor, setAnchor] = useState<{ top?: number; bottom?: number; right: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const open = anchor !== null;

  function toggle() {
    if (open) {
      setAnchor(null);
      return;
    }
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const right = Math.max(8, window.innerWidth - rect.right);
    // Open above the button; when there is not enough room above, open below it instead.
    setAnchor(
      rect.top < PANEL_ROOM_ABOVE ? { top: rect.bottom + 8, right } : { bottom: window.innerHeight - rect.top + 8, right },
    );
  }

  useEffect(() => {
    if (!open) return;
    const close = () => setAnchor(null);

    function handleKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      close();
      buttonRef.current?.focus();
    }
    function handlePointer(event: MouseEvent) {
      const target = event.target as Node;
      if (!panelRef.current?.contains(target) && !buttonRef.current?.contains(target)) close();
    }

    window.addEventListener("keydown", handleKey, true);
    document.addEventListener("mousedown", handlePointer);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("keydown", handleKey, true);
      document.removeEventListener("mousedown", handlePointer);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={toggle}
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-border text-[10px] font-semibold leading-none text-text-muted hover:border-primary hover:text-primary"
      >
        ?
      </button>
      {anchor && (
        <div
          ref={panelRef}
          id={panelId}
          role="region"
          aria-label={label}
          className="fixed z-[60] w-72 max-w-[calc(100vw-1rem)] space-y-2 rounded-lg border border-border bg-surface p-3.5 text-xs normal-case tracking-normal text-text-muted shadow-lg"
          style={{ top: anchor.top, bottom: anchor.bottom, right: anchor.right }}
        >
          {children}
        </div>
      )}
    </>
  );
}
