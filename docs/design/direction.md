# Design direction

The visual rules for Inntena's client (`client/`). Read this before touching any UI, so
that work done in parallel stays coherent. When this document and the code disagree, the
code (`client/src/index.css`) is the source of truth for values; fix this file.

## Character

Quiet, organized and precise: a dark charcoal workspace with one assertive accent. Warm
neutrals (the grays lean slightly red, never blue), a pinkish off-white for text, and a
single saturated red used sparingly. The product is a research tool, so the interface
stays out of the way and the data carries the page.

Direction taken from a landing-page reference (charcoal, off-white and red). Only its
**color** and its split layout with an animated panel were adopted. Its other traits (hairline
grid frames, uppercase tracked labels, film grain, square corners, wide display type) were
deliberately **not** adopted; adding any of them is a separate decision.

Explicitly rejected earlier, and still off the table: glows and colored shadows, translucent
"glass" surfaces, decorative gradients on controls. If a surface needs emphasis, use the
accent, a border or spacing, never an effect.

## Color

All colors are CSS variables in `client/src/index.css`, mapped to Tailwind classes in
`client/tailwind.config.js`. **Never write a hex value or a Tailwind palette color
(`text-red-500`, `bg-gray-100`, `text-slate-500`) in a component.** Dark is the default
theme; light uses the same hues, lighter.

| Token (class) | Dark | Light | Use |
|---|---|---|---|
| `bg` | `#1f1b1a` | `#f6ecec` | page background |
| `surface` | `#2a2423` | `#fffafa` | cards, modals, inputs' container |
| `text` | `#fbeded` | `#241f1f` | primary text |
| `text-muted` | `#b9a9a8` | `#6b5e5d` | secondary text, hints, labels |
| `border` | `#3d3433` | `#e6d5d5` | hairlines, dividers, input borders |
| `primary` | `#ff5560` | `#c8252f` | **red as text, border or icon** |
| `primary-solid` / `-hover` | `#dc2b37` / `#cc2834` | `#c8252f` / `#b81f2c` | **red as a fill** (buttons) |
| `on-primary` | `#ffffff` | `#ffffff` | text on a `primary-solid` fill |
| `primary-tint` | 12% of `primary` | 12% of `primary` | soft red background (active tab, banner, error box) |
| `primary-line` | 35% of `primary` | 35% of `primary` | soft red border (error box) |
| `rise` | `#8fb08a` | `#4f7a4a` | **only** "rising" values (growth). Never decorative |
| `series-2`, `series-3` | `#fbeded`, `#9a8d8c` | `#241f1f`, `#7a6c6b` | chart lines 2 and 3 (line 1 is `primary`) |
| `scene`, `scene-star` | `#141110`, `#fbeded` | same | the auth panel; dark in both themes |

### Why red is split in two

The reference red (`#f23843`) does not reach WCAG AA as small text on the dark background
(4.41:1) nor behind white text (3.87:1). So:

- Red that is **text, a border or a thin icon** uses `primary` (tuned to read on `bg` and `surface`).
- Red that is a **solid fill behind text** uses `primary-solid` with `on-primary` on top.
- Do not swap them: `bg-primary` with white text fails contrast in dark mode.

Contrast of the values above (WCAG 2.1, computed): dark text 15.0:1, muted 7.6:1, `primary`
on `bg` 5.5:1, white on `primary-solid` 4.7:1, `rise` 6.4:1; light text 14.0:1, muted 5.4:1,
`primary` on `surface` 4.8:1, white on `primary-solid` 5.6:1, `rise` 4.8:1. Re-run the check
whenever a token changes. Small text needs 4.5:1; large text and UI components need 3:1.

### Meaning of color

- Red is the brand and the "needs attention" color (blocked collection, errors, destructive
  actions). It is also the primary action fill. Keep it scarce: if a screen is mostly red, something is wrong.
- Green (`rise`) means growth and nothing else.
- Never encode information in color alone. The third chart series is dashed for that reason;
  follow the same rule for anything new (icon, label or pattern in addition to color).

### Translucent variants

Tailwind 3 silently drops opacity modifiers on these tokens (`bg-primary/10` generates no
CSS because the colors are `var(--x)`). Use the dedicated tokens (`bg-primary-tint`,
`border-primary-line`). For another translucent need, add a token in `index.css` built with
`color-mix(in srgb, var(--color-x) N%, transparent)` and map it in `tailwind.config.js`.

## Typography

Three roles, loaded from Google Fonts in `client/index.html`:

- **Zilla Slab** (`font-display`): headings, the wordmark, titles.
- **Karla** (`font-sans`, default): body and UI text.
- **IBM Plex Mono** (`font-mono`): data (dates, values, growth figures).

The wordmark is lowercase `inntena` with a dotless `ı` and the pulsing dot above it. Prose
uses `Inntena`.

## Components

- **Surfaces:** `bg-surface`, `border border-border`, `rounded-lg`, at most `shadow-sm`
  (`shadow-lg` only for floating layers such as tooltips and modals). No decorative effects.
- **Primary button:** `rounded bg-primary-solid text-on-primary hover:bg-primary-solid-hover`,
  `text-sm font-medium`, `disabled:opacity-50`. One primary action per view.
- **Secondary / destructive button:** `border border-primary text-primary hover:bg-primary-tint`.
- **Inputs:** `rounded border border-border bg-bg px-3 py-2 text-sm text-text`.
- **Error box:** use `FormError`, do not restyle it.
- **Tabs / chips (active):** `border-primary bg-primary-tint text-primary`; inactive:
  `border-border bg-surface text-text-muted`.
- **Class names must be literal.** Tailwind scans source text; a class assembled at runtime
  (`` `text-${size}` ``) is purged. Use a lookup table of full class names instead. Custom CSS
  that targets runtime-generated class names goes in `index.css` **outside** any `@layer`.

## Motion

- Motion is signature, not decoration: the pulse dot, the auth scene, the snakes. Everything
  else is static or uses a short opacity/transform transition.
- Every animation must respect `prefers-reduced-motion` (`motion-safe:` in Tailwind, or a
  `matchMedia` check in JS). Under reduced motion the scene draws a single still frame.
- Loops must pause when the tab is hidden (`requestAnimationFrame` does this on its own).

## The auth pages

`AuthPageShell` is a two-column layout from the `lg` breakpoint: the form on the left, a tall
panel (`AuthScenePanel`) on the right with a three.js scene of monoliths on a circular base
under a red sphere that pulses like the wordmark's dot. Below `lg` the panel is not rendered
and its code is not downloaded. The panel is dark in both themes on purpose. It always has a
static CSS night sky underneath (`SceneFallback`) for when WebGL is unavailable. Any new auth
page must use `AuthPageShell`.

## Internationalization

Every user-facing string lives in `client/src/lib/i18n.ts`, in both Spanish and English;
nothing is hardcoded in a component. Spanish is neutral (no voseo). The `Translations`
interface forces both languages to have the same keys, so the type checker catches a missing one.

## Checklist before finishing UI work

1. No hex values or palette colors in components; only tokens.
2. Red is used as `primary` (text/border) or `primary-solid` (fill), never mixed up.
3. Text and UI meet contrast in **both** themes (check dark and light in the browser).
4. Information does not depend on color alone.
5. New strings are in `i18n.ts` in both languages.
6. New motion respects `prefers-reduced-motion`.
7. `npm run typecheck --prefix client`, `npm run lint --prefix client` and `npm test --prefix client` pass.
8. After editing `tailwind.config.js`, restart the dev server; Tailwind does not reload it live.
