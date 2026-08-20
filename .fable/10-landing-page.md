# PR 10: The landing page

Branch: `fable/10-landing-page`
Base: `fable/09-testing-ci`

## What changed

- **page.tsx composes the real site**: LandingNav → Hero → Features → Security → Comparison → BottomCta → footer. The 80-line stub (`landing-page.tsx`) is deleted. JSON-LD (fixed in PR 01) intact; skip link + main landmark carried over.
- **Order rationale**: hero names the category in the first screen; features answer "what does it do" at peak attention; security substantiates the trust claims; the comparison frames the self-host decision; CTA closes. Security-first was considered and rejected: its claims only land once the reader knows what the agent does.
- **Honesty pass on the dormant sections**: hero dropped "1000+ tools via OAuth and sandboxed execution"; the security section's unverifiable competitor stats ("5,700+ unvetted skills") became TrustClaw's own verifiable posture; the comparison stopped disparaging a named competitor in favor of a fair self-hosted-vs-hosted fact table; the chat mockup's script is a realistic inbox triage with no fabricated names.
- **Copy**: H1 stays "Claw ships while you sleep." with a category badge ("Self-hosted personal AI agent") and a concrete subhead (your infra, BYO key or free house models, data in your Postgres, open codebase). The five capability pills promoted into the hero at text-sm with lucide icons.
- **Layout**: all section headers left-aligned (kicker + h2, prose capped at 65ch), matching security-section which was already right. The triplicated p-px gradient-border wrapper is extracted into `GradientCard`. The feature grid goes asymmetric: integrations spanning two columns with real tool logos, then memory / keys / schedule / channels, closed by a full-width self-host card.
- **AnimateOnView fixed for LCP/no-JS**: visible by default; an element only hides pre-entrance after mount, with `prefers-reduced-motion: no-preference`, and after the observer confirms it is off-screen. The hero doesn't animate at all: the LCP H1 is plain markup. Same public API.
- **Left unimported**: floating-prompts-section (duplicates the integrations story, weakest layout, overpromising prompts) and train-mascot (its only consumer was the stub). Files kept for reuse.
- **No testimonials section**: no real attributed quotes exist; nothing fabricated ships (see PR 01).

## Acceptance

- [x] Real sections composed; stub deleted; zero references remain
- [x] No invented testimonials/stats/logos
- [x] Hero visible without JS; below-fold animation gated on reduced-motion
- [x] Headers left-aligned (footer deliberately centered: brand lockup + one line)
- [x] pnpm typecheck + lint + test green (147/147)

Dependencies added: none.
