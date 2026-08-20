-- Voice calls pin the persona the spoken agent was dispatched with, so the
-- delegate that does the work cannot silently adopt a newly-picked persona
-- mid-call (which made the call speak in the old voice with the new
-- persona's wording). Additive and nullable: existing rows and older code
-- are unaffected.
ALTER TABLE "composio_claw_conversation" ADD COLUMN "voicePersonaId" TEXT;
