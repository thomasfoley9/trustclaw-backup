"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";

// Self-contained Web Audio hold-music loop. It plays through the browser's OWN
// audio output (not a separate LiveKit track), so — unlike the server-side
// BackgroundAudioPlayer that was removed — it actually plays on mobile. A gentle
// looping arpeggio, kept well under the agent's voice. Driven by real
// "Agent B is working" events on the call: start() while a tool runs, stop() the
// moment work finishes and the agent comes back to speak.

// Cmaj7 -> Am7 -> Fmaj7 -> G, one soft note per step. Warm and unobtrusive.
const NOTES = [
  261.63, 329.63, 392.0, 493.88, 220.0, 261.63, 329.63, 392.0, 174.61, 220.0,
  261.63, 329.63, 196.0, 246.94, 293.66, 392.0,
] as const;
const STEP = 0.34; // seconds between notes
const PEAK_GAIN = 0.085; // master volume — sits under the agent's voice
const FADE = 0.35; // fade in / out, seconds

export interface HoldMusic {
  // Unlock the AudioContext from inside a user gesture (mobile autoplay policy).
  prime: () => void;
  start: () => void;
  stop: () => void;
}

export function useHoldMusic(): HoldMusic {
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const filterRef = useRef<BiquadFilterNode | null>(null);
  const intervalRef = useRef<number | null>(null);
  const stepIdxRef = useRef(0);
  const nextTimeRef = useRef(0);
  const playingRef = useRef(false);

  const ensureGraph = useCallback((): AudioContext | null => {
    if (ctxRef.current) return ctxRef.current;
    if (typeof window === "undefined" || !("AudioContext" in window)) return null;
    const ctx = new AudioContext();
    const master = ctx.createGain();
    master.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1400;
    filter.connect(master).connect(ctx.destination);
    ctxRef.current = ctx;
    masterRef.current = master;
    filterRef.current = filter;
    return ctx;
  }, []);

  const prime = useCallback(() => {
    const ctx = ensureGraph();
    if (ctx) void ctx.resume().catch(() => undefined);
  }, [ensureGraph]);

  const stop = useCallback(() => {
    if (!playingRef.current) return;
    playingRef.current = false;
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    const ctx = ctxRef.current;
    const master = masterRef.current;
    if (ctx && master) {
      const t = ctx.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(0, t + FADE);
    }
  }, []);

  const start = useCallback(() => {
    if (playingRef.current) return;
    const ctx = ensureGraph();
    const master = masterRef.current;
    const filter = filterRef.current;
    if (!ctx || !master || !filter) return;
    void ctx.resume().catch(() => undefined);
    playingRef.current = true;

    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(PEAK_GAIN, now + FADE);
    nextTimeRef.current = now + 0.05;

    // Lookahead scheduler: schedule notes ~0.15s ahead on a 30ms timer so the
    // loop stays glitch-free regardless of main-thread jank.
    const schedule = () => {
      const c = ctxRef.current;
      const f = filterRef.current;
      if (!c || !f || !playingRef.current) return;
      while (nextTimeRef.current < c.currentTime + 0.15) {
        const freq = NOTES[stepIdxRef.current % NOTES.length] ?? NOTES[0];
        const at = nextTimeRef.current;
        const osc = c.createOscillator();
        osc.type = "triangle";
        osc.frequency.value = freq;
        const g = c.createGain();
        g.gain.setValueAtTime(0, at);
        g.gain.linearRampToValueAtTime(1, at + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0008, at + 0.5);
        osc.connect(g).connect(f);
        osc.start(at);
        osc.stop(at + 0.55);
        nextTimeRef.current += STEP;
        stepIdxRef.current = (stepIdxRef.current + 1) % NOTES.length;
      }
    };
    schedule();
    intervalRef.current = window.setInterval(schedule, 30);
  }, [ensureGraph]);

  // Full teardown on unmount.
  useEffect(() => {
    return () => {
      if (intervalRef.current !== null) window.clearInterval(intervalRef.current);
      const ctx = ctxRef.current;
      ctxRef.current = null;
      if (ctx) void ctx.close().catch(() => undefined);
    };
  }, []);

  return useMemo(() => ({ prime, start, stop }), [prime, start, stop]);
}
