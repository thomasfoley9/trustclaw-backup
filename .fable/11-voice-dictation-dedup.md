# PR 11: Voice dictation dedupe

Branch: `fable/11-voice-dictation-dedup`
Base: `fable/10-landing-page`

## The bug (reported live: one spoken word typed ~80 times)

Both speech hooks (`use-speech-dictation.ts`, `use-voice-conversation.ts`) iterated `event.results` from `event.resultIndex` and treated every `isFinal` result in that slice as a fresh chunk. That is the spec pattern, but real engines (macOS/iOS Safari, Chrome on Android, desktop Chrome in continuous mode) re-deliver already-final results on every subsequent event with `resultIndex` stuck at 0. Continuous mode fires one event per interim update, many per second while speaking, so each finalized word was appended to the composer once per event.

## The fix

- Per-recognizer high-water mark: every event rebuilds the full final transcript from index 0 and delivers only the not-yet-consumed suffix. Handles the re-delivery bug, finals that grow in place, in-place revisions (resync without re-delivering), and the hands-free loop's engine auto-restarts (a results reset shows up as a non-extension and just resyncs).
- Second bug found in the same inspection: dictation `start()` could spawn two live recognizers (the busy guard flipped only in async `onstart`, and `start()` awaits a `getUserMedia` preflight; a double-tap during that window created two engines with only the newest stoppable). The slot is now claimed synchronously and a start token cancels a preflight that outlives a toggle-off or unmount.
- `SpeechRecognitionResultList` typed as iterable (it is, in every shipping engine) so the scan is a clean for-of.

## Verification

8 new regression tests simulate the exact buggy engine sequences: spec-compliant delivery, 80-event re-delivery (the reported symptom), in-place growth, in-place revision, interim-only events, double-tap, mid-preflight cancel, and deduped auto-send in the conversation loop. **Mutation-checked**: with the fix stashed, 5 of 8 fail against the old implementation; all pass with it.

Full suite: 155/155. Typecheck and lint clean.

Real-mic smoke test still recommended (unit fakes can't prove engine behavior): dictate a sentence in the affected browser and confirm each word appears once.
