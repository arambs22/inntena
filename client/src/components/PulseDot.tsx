interface PulseDotProps {
  className?: string;
}

/** Radar-pulse signature: a solid dot with an expanding ping ring, respecting prefers-reduced-motion. Sized entirely via `className`. */
export function PulseDot({ className = "h-2.5 w-2.5" }: PulseDotProps) {
  return (
    <span className={`relative inline-flex ${className}`}>
      <span className="motion-safe:animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-solid opacity-75" />
      <span className={`relative inline-flex rounded-full bg-primary-solid ${className}`} />
    </span>
  );
}
