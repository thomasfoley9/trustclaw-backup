-- Pinning the persona ID alone still desyncs the two voice agents when the
-- personality is EDITED or DELETED mid-call (the delegate re-resolves the row
-- while the spoken agent holds a dispatch-time snapshot). Capture the prompt
-- itself so a live call is immune to both. Additive and nullable.
ALTER TABLE "composio_claw_conversation" ADD COLUMN "voicePersonaPrompt" TEXT;
ALTER TABLE "composio_claw_conversation" ADD COLUMN "voicePersonaName" TEXT;
