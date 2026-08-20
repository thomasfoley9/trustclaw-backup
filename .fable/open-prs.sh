#!/usr/bin/env bash
# Push the overnight branch stack and open the ten stacked PRs.
# Run from the repo root with a GitHub account that has write access to
# ComposioHQ/trustclaw (the overnight account thomasfoley9 was pull-only).
#
#   bash .fable/open-prs.sh
#
# Each PR's base is the previous branch, so they review as small diffs and
# merge top-down (01 first). PR bodies come from .fable/NN-*.md.

set -euo pipefail

BASE="feat/sales-tool-customizations"
BRANCHES=(
  "fable/01-brand-copy-integrity"
  "fable/02-chat-correctness"
  "fable/03-activation-path"
  "fable/04-settings-integrity"
  "fable/05-design-system"
  "fable/06-a11y-mobile"
  "fable/07-performance"
  "fable/08-voice-terminal-telegram"
  "fable/09-testing-ci"
  "fable/10-landing-page"
  "fable/11-voice-dictation-dedup"
)
TITLES=(
  "Brand and copy integrity: remove dev in-jokes from shipped surfaces"
  "Chat correctness: stop no longer loses data, IME and history fixes"
  "Activation path: no wall after onboarding, honest auth flows"
  "Settings integrity: error states, confirms, timezone UI, toolkit disconnect"
  "Design system: motion tokens, one purple, contrast, type ramp, primitives"
  "Accessibility and mobile: contrast, live regions, dvh shell, tap targets"
  "Performance: sweeper indexes, bounded chat DOM, LiveKit code-split"
  "Voice, terminal, Telegram: honest states and no more silent failures"
  "Testing and CI foundation: Vitest, 147 tests, GitHub Actions"
  "Landing page: ship the marketing site that already existed"
  "Voice dictation: stop re-typing every word the engine re-delivers"
)

git push -u origin "$BASE"

prev="$BASE"
for i in "${!BRANCHES[@]}"; do
  branch="${BRANCHES[$i]}"
  n=$(printf "%02d" $((i + 1)))
  body_file=$(ls .fable/${n}-*.md)

  git push -u origin "$branch"

  body=$(mktemp)
  cat "$body_file" > "$body"
  printf '\n🤖 Generated with [Claude Code](https://claude.com/claude-code)\n' >> "$body"

  gh pr create \
    --base "$prev" \
    --head "$branch" \
    --title "${TITLES[$i]}" \
    --body-file "$body"

  rm -f "$body"
  prev="$branch"
done

echo "All ten stacked PRs opened. Merge top-down starting with 01."
