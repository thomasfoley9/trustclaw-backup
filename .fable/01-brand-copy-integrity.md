# PR 01: Stop the bleeding (brand and copy integrity)

Branch: `fable/01-brand-copy-integrity`
Base: `feat/sales-tool-customizations`

## What changed

- H1 no longer ships the developer's first name: "Claw ships while you sleep."
- JSON-LD rewritten to describe the actual product (self-hostable agent, vector memory, 500+ tools, Telegram); creator is now Composio, not "Sales People", and the Temu joke is gone.
- Deleted `composio-cta.tsx` (Proverbs 16:16 banner above every chat) and its usage in `chat-view.tsx`.
- Deleted `testimonials-section.tsx` outright: fabricated quotes, invented engagement counts, attacks on a named competitor. PR 10 ships without a testimonials section; real attributed quotes can be added when they exist.
- Brand tagline "Brought to you by Cracked Cookies" replaced with "Self-hosted AI agent"; the 8px/9px sizes bumped above the legibility floor.
- Footer joke copy replaced with "Self-hosted. Your keys, your data, your agent."
- MCP `CLIENT_INFO.name` is now `trustclaw` (was `thomas-claw`, leaked into every MCP handshake for every self-hosted deployment).
- Train mascot aria-label no longer says "Thomas"; comment examples in `auth.ts`/`username.ts` de-personalized.
- Voice worker: `VOICE_TURN_URL` fallback no longer points at the developer's personal Vercel app (now localhost; real deploys set the env var); the 401 spoken error no longer says "tell Thomas"; `.env.example` uses placeholders instead of the personal LiveKit/Vercel URLs.
- Every emoji-as-UI replaced with lucide icons: TrainFront (landing pill), Briefcase/PartyPopper (writing-style step), X (workbench error header, connection failed dot), Clock (link expiry). "On the house" labels lose the beer glass. Warning-emoji prefixes stripped from persisted chat error text and the tRPC dev logger.

## Acceptance

- [x] grep for Thomas, Temu, Cracked Cookies, Proverbs, thomas-claw: zero hits in shipped code (src/, cli/, claw-voice/src/)
- [x] Zero emoji in src/app and src/components
- [x] testimonials-section.tsx deleted
- [x] pnpm typecheck and pnpm lint clean

## Notes

- `fly.worker.toml` keeps `app = "thomasclaw-worker"` and the LiveKit agent's deployed names: those are the live infrastructure identifiers for this instance; renaming them breaks `fly deploy` against the existing app. Flagged rather than changed.
- Dependencies added: none.
