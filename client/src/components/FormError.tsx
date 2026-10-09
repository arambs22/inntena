interface FormErrorProps {
  message: string;
  /** Compact forms (like a modal) use "xs" to match their tighter layout. */
  size?: "xs" | "sm";
}

// Tailwind's build-time scanner needs full, literal class strings — a
// template-interpolated `text-${size}` would never get picked up and the
// size would silently do nothing once built. See CLAUDE.md's note on the
// same issue with Recharts focus outlines.
const SIZE_CLASS: Record<NonNullable<FormErrorProps["size"]>, string> = {
  xs: "text-xs",
  sm: "text-sm",
};

/** The standard inline error banner shown below a form's fields, used by every auth page and modal in the app. */
export function FormError({ message, size = "sm" }: FormErrorProps) {
  return <p className={`rounded border border-primary-line bg-primary-tint p-2 text-primary ${SIZE_CLASS[size]}`}>{message}</p>;
}
