import type { ReactNode } from "react";
import { GridBackground } from "./GridBackground";
import { LanguageToggle } from "./LanguageToggle";
import { ThemeToggle } from "./ThemeToggle";
import { HeroWordmark } from "./HeroWordmark";
import { AuthScenePanel } from "./AuthScenePanel";

interface AuthPageShellProps {
  children: ReactNode;
}

/**
 * The shared outer layout used by every public auth page — login, register, forgot/reset
 * password: the form column (animated background, theme/language toggles, wordmark) on the
 * left and a decorative scene panel on the right. Each page supplies its own card (a <form>
 * or a plain <div>, depending on whether it needs to swap content conditionally) as children.
 * The animated background lives inside the form column so it never crosses into the panel.
 */
export function AuthPageShell({ children }: AuthPageShellProps) {
  return (
    <div className="flex min-h-screen bg-bg">
      <div className="relative flex min-h-screen min-w-0 flex-1 flex-col items-center justify-center gap-8 overflow-hidden px-4 py-12">
        <GridBackground />
        <div className="absolute right-4 top-4 flex items-center gap-2">
          <ThemeToggle />
          <LanguageToggle />
        </div>
        <div className="relative">
          <HeroWordmark />
        </div>
        {children}
      </div>
      <AuthScenePanel />
    </div>
  );
}
