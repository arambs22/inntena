import { lazy, Suspense, useMemo, useState } from "react";
import { generateStars } from "../lib/starfield";
import { useMediaQuery } from "../lib/useMediaQuery";

// Loaded on demand so three.js stays out of the main bundle and is only fetched where the panel is shown.
const AuthScene = lazy(() => import("./AuthScene"));

const STAR_COUNT = 70;

interface SceneFallbackProps {
  /** Fades the sky out once the animated scene has taken over. */
  retired: boolean;
}

/**
 * Static night sky used as the panel's backdrop and as the fallback whenever the animated
 * scene is unavailable (no WebGL, or while its chunk is still loading). Pure CSS: one
 * absolutely-positioned dot per star, so it costs nothing and cannot fail.
 */
function SceneFallback({ retired }: SceneFallbackProps) {
  const stars = useMemo(() => generateStars(STAR_COUNT), []);

  return (
    <div className={`absolute inset-0 transition-opacity duration-700 ${retired ? "opacity-0" : "opacity-100"}`}>
      {stars.map((star, index) => (
        <span
          key={index}
          className="absolute rounded-full bg-scene-star"
          style={{
            left: `${star.x}%`,
            top: `${star.y}%`,
            width: star.size,
            height: star.size,
            opacity: star.opacity,
          }}
        />
      ))}
    </div>
  );
}

/**
 * Tall decorative panel on the right of the auth pages. It stays dark in both themes on
 * purpose: it reads as a window onto a night landscape rather than as part of the page
 * chrome, which also keeps the scene's contrast independent of the active theme.
 * Hidden below the `lg` breakpoint, where the form takes the full width; the animated
 * scene is not even requested there.
 */
export function AuthScenePanel() {
  const isWide = useMediaQuery("(min-width: 1024px)");
  const [sceneReady, setSceneReady] = useState(false);

  return (
    <aside aria-hidden className="hidden p-4 lg:sticky lg:top-0 lg:block lg:h-screen lg:w-[34%] xl:w-[32%]">
      <div className="relative h-full overflow-hidden rounded-2xl border border-border bg-scene">
        {/* Dusk haze: a faint warm glow behind the sphere and along the horizon, so the sky is not flat black. */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 70% 38% at 50% 27%, rgba(242,56,67,0.13), transparent 70%), linear-gradient(to top, rgba(242,56,67,0.09), transparent 42%)",
          }}
        />
        <SceneFallback retired={sceneReady} />
        {isWide && (
          <Suspense fallback={null}>
            <AuthScene onReady={() => setSceneReady(true)} />
          </Suspense>
        )}
      </div>
    </aside>
  );
}
