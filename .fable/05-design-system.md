# PR 05: Design system

Branch: `fable/05-design-system`
Base: `fable/04-settings-integrity`

## What changed

- **Motion tokens** in @theme: `--ease-out-quad`, `--ease-spring`, fast/base/slow durations. Tailwind v4.1 has no `--duration-*` theme namespace (verified against the installed package), so `duration-fast/base/slow` are explicit `@utility` blocks that also set `--tw-duration` for tw-animate-css; `ease-*` generates natively. tw-merge extended so variant durations replace base ones. All ~52 `transition-*` sites across 40 files now carry explicit duration + easing (fast for color/opacity, base for transforms, slow for overlays; popovers use base because 320ms reads laggy on small surfaces).
- **Zero `hover:scale-*`**: replaced with 1px lift + shadow step; buttons also depress (`active:translate-y-0 active:brightness-95`).
- **One purple**: all 20 occurrences of the stale `oklch(0.488 0.243 264.376)` replaced with `var(--primary)` (alpha via `color-mix`), including the unshipped marketing sections PR 10 will mount. SVG gradient stops moved to style props.
- **Gradient contrast**: `.bg-accent-gradient` gets a `.dark` variant; recomputed stops hit 7.1:1/5.0:1 (light) and 5.2:1/5.0:1 (dark) against `text-primary-foreground` (WCAG luminance computed via oklch→sRGB script; values documented in a CSS comment). `text-white` on the gradient is gone.
- **Type ramp**: `--text-2xs: 0.6875rem` (+ line height); all 57 `text-[8|9|10|11px]` uses codemodded to `text-2xs`.
- **Primitives**: `components/ui/spinner.tsx` (cva sm/default/lg; replaced 47 hand-rolled Loader2 spinners in 29 files), `components/core/empty-state.tsx` (used across seven surfaces with icons + actions), and ten co-located settings skeletons (also fixes the key cards flashing the "no key yet" form during load).
- **Focus parity** on prompt chips, sidebar toggle, voice rows, terminal toggles, model-picker rows (outline restored via ring tokens).
- **Depth**: Card primitive uses `.elevated` (Cards are settings-only, verified); `.glass` on Dialog/AlertDialog/Sheet/Popover content; modal radius bumped to `rounded-2xl` per the radius rule (controls lg, cards xl, modals 2xl, pills full).
- **Brand Button variant** (`bg-accent-gradient text-primary-foreground` + lift/depress) adopted at landing nav/hero, sidebar New chat, onboarding Continue, chat send. Login submit was never gradient; left default. Brand-landing keeps its parameterized per-brand accents but gains the motion language.

## Acceptance

- [x] Zero `hover:scale-*` in src/ (grep verified)
- [x] Zero `text-[8|9|10|11px]` (grep verified)
- [x] Every `transition-*` carries explicit duration + easing
- [x] Zero `264.376` (grep verified); one purple
- [x] pnpm typecheck + lint clean

## Notes

- Compiled globals.css through the real postcss pipeline to confirm `duration-*`, `ease-out-quad`, `text-2xs`, and the `.dark .bg-accent-gradient` variant all generate.
- Dependencies added: none.
