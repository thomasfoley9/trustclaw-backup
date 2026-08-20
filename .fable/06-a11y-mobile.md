# PR 06: Accessibility and mobile

Branch: `fable/06-a11y-mobile`
Base: `fable/05-design-system`

## What changed

- **Dark primary contrast (WCAG-computed).** Before: 3.42:1. Key finding: no primary lightness passes both as button fill under white text (needs L <= 0.578) and as `text-primary` accent on the dark background (needs L >= 0.60). So dark `--primary-foreground` flips to dark ink `oklch(0.16 0.02 287)` = 5.53:1, primary itself untouched. The brand gradient keeps near-white text by owning `color` inside `.bg-accent-gradient` (stops already AA from PR 05). Checkbox check, switch thumb, badge, sonner action, voice pill re-verified >= 4.5:1. Ratios documented in globals.css.
- **Live regions:** thinking indicator (`role="status"`, rotating flavor word aria-hidden), a polite sr-only region announcing "Assistant is replying"/"Reply finished"/"Response failed" transitions (never token text), voice phase pill announces phase changes without re-reading the mute button.
- **Labels:** deletion confirm input gets id/htmlFor; toolkit search, sidebar rename, RHF fields the migration left unlabeled, and Label+Select pairs (model x2, voice, bucket) all fixed.
- **iOS keyboard:** authenticated shell `h-screen` → `h-dvh`, `interactiveWidget: "resizes-content"` in the viewport export, safe-area-inset padding on the composer and bottom sheets (terminal sheet also 80vh → 80dvh).
- **Landmarks + skip links + h1:** `<nav aria-label>` in both navbars, skip-to-content in dashboard and landing targeting `main#main-content`, sr-only `<h1>Chat</h1>` on the dashboard.
- **Reduced motion:** global media block freezes the infinite decorative loops and near-instants entrance fades (content still appears); onboarding wrapped in `MotionConfig reducedMotion="user"`.
- **44px tap targets at the primitive:** coarse-pointer-only `min-h-11` / `size-11` overrides on buttonVariants (xs sizes deliberately left as dense escape hatches). Chose real enlargement over pseudo-element hit slop: no dense grids use these sizes, and invisible overlapping hit areas mis-tap in gap-1 rows. Verified the media-variant classes compile after plain size utilities and survive twMerge. Onboarding's local min-h-44 patches removed where the primitive now covers them.

## Acceptance

- [x] Dark default button text 5.53:1 (was 3.42:1), documented
- [x] Streaming state announced; thinking/voice phases announced
- [x] Deletion confirm labeled; unlabeled-input sweep done
- [x] dvh shell + resizes-content + safe areas
- [x] Landmarks, skip links, dashboard h1
- [x] Reduced motion global + onboarding
- [x] 44px coarse-pointer targets on the Button primitive
- [x] pnpm typecheck + lint clean

## Known remaining (flagged, not fixed here)

- Dark `destructive` button with white text sits at ~3.7:1 (out of scope per brief; worth a follow-up).
- brand-landing.tsx is a hardcoded-dark demo page and was left alone.

Dependencies added: none.
