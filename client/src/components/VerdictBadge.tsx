import { useLanguage } from "../context/LanguageContext";
import type { Verdict } from "../lib/opportunity";

interface VerdictBadgeProps {
  verdict: Verdict;
  size?: "sm" | "md";
}

// Full literal class strings, so Tailwind can see them.
const COLOR: Record<Verdict, string> = {
  opportunity: "border-rise bg-rise-tint text-rise",
  promising: "border-rise text-rise",
  steady: "border-border text-text-muted",
  crowded: "border-primary-line text-primary",
  cooling: "border-border text-text-muted",
};
const ARROW: Record<Verdict, string> = { opportunity: "▲", promising: "△", steady: "→", crowded: "◆", cooling: "▼" };
const SIZE: Record<"sm" | "md", string> = { sm: "px-1.5 py-0.5 text-[11px]", md: "px-2 py-0.5 text-xs" };

/** The verdict as a small labelled badge. The arrow and the word carry the meaning; color only reinforces it. */
export function VerdictBadge({ verdict, size = "sm" }: VerdictBadgeProps) {
  const { t } = useLanguage();
  return (
    <span className={`inline-flex items-center gap-1 rounded border font-medium ${SIZE[size]} ${COLOR[verdict]}`}>
      <span aria-hidden>{ARROW[verdict]}</span>
      {t.supply.verdicts[verdict]}
    </span>
  );
}
