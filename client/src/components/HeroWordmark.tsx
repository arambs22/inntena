import { PulseDot } from "./PulseDot";

/** Single-line "inntena" wordmark for the auth pages; the radar-pulse dot doubles as the dot of the leading "i". */
export function HeroWordmark() {
  return (
    <h1
      data-grid-avoid
      className="mx-auto w-fit select-none font-display font-semibold leading-[0.85] tracking-wide text-text"
    >
      <span className="block text-7xl">
        <span className="relative inline-block">
          <span className="absolute left-[45%] top-[-0.55em] -translate-x-1/2">
            <PulseDot className="h-4 w-4" />
          </span>
          {/* Dotless "ı" (Turkish, U+0131) instead of "i" — a real serif glyph matching the rest
              of the word, but with no built-in dot to fight for position with PulseDot above. */}
          ı
        </span>
        nntena
      </span>
    </h1>
  );
}
