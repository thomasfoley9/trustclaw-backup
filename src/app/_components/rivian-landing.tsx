"use client";

import Link from "next/link";
import { Mail, CalendarDays, MessageSquare, Zap } from "lucide-react";

// Reversible Rivian demo skin for the LANDING PAGE ONLY (the app + onboarding
// stay ThomasClaw). Toggled by RIVIAN_DEMO in ~/lib/demo-flag. The "RIVIAN"
// wordmark is recreated in type + Rivian Compass Yellow on a dark cinematic
// field — not Rivian's official trademarked assets.
const YELLOW = "#FED813";

const CAPS = [
  { icon: Mail, label: "Clears your inbox", sub: "Reads, drafts, replies, sends." },
  { icon: CalendarDays, label: "Runs your calendar", sub: "Books, moves, defends your time." },
  { icon: MessageSquare, label: "Works your tools", sub: "Slack, CRM, docs — connected." },
  { icon: Zap, label: "Actually does it", sub: "Not suggestions. Done." },
];

export function RivianLanding() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0a0a0b] text-white antialiased">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div
          className="absolute top-[44%] left-1/2 h-[62vh] w-[150vw] -translate-x-1/2 rounded-[100%] blur-[130px]"
          style={{ backgroundColor: YELLOW, opacity: 0.1 }}
        />
        <div className="absolute inset-x-0 top-[58%] h-px bg-white/10" />
        <div
          className="absolute bottom-0 left-1/2 h-[42vh] w-px -translate-x-1/2"
          style={{ background: `linear-gradient(to top, ${YELLOW}55, transparent)` }}
        />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,#0a0a0b_100%)]" />
      </div>

      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-3">
          <span className="text-lg font-semibold tracking-[0.4em] text-white">RIVIAN</span>
          <span className="h-4 w-px bg-white/25" />
          <span className="text-sm tracking-wide text-white/65">ThomasClaw</span>
        </div>
        <Link
          href="/login"
          className="rounded-full border border-white/20 px-5 py-2 text-sm font-medium text-white transition hover:bg-white hover:text-black"
        >
          Sign in
        </Link>
      </header>

      <main className="relative z-10 mx-auto flex max-w-5xl flex-col items-center px-6 pt-16 pb-20 text-center sm:pt-24">
        <span
          className="mb-7 inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-[11px] font-medium tracking-[0.22em] uppercase"
          style={{ borderColor: `${YELLOW}55`, backgroundColor: `${YELLOW}14`, color: YELLOW }}
        >
          AI that can do things
        </span>
        <h1 className="font-heading text-4xl leading-[1.04] font-bold tracking-tight text-balance sm:text-6xl md:text-[5rem]">
          The only AI driving
          <br className="hidden sm:block" /> experience worth your time.
        </h1>
        <p className="mt-7 max-w-2xl text-lg text-white/60 sm:text-xl">
          Meet <span className="text-white">ThomasClaw</span> — the AI that doesn&apos;t just
          answer, it <span style={{ color: YELLOW }}>drives</span>. Your inbox, your calendar,
          your busywork: handled, hands-free.
        </p>
        <div className="mt-11 flex flex-col items-center gap-4 sm:flex-row">
          <Link
            href="/login"
            className="rounded-full px-8 py-3.5 text-base font-semibold text-black transition hover:brightness-95"
            style={{ backgroundColor: YELLOW }}
          >
            Take the wheel
          </Link>
          <Link
            href="/login"
            className="rounded-full border border-white/20 px-8 py-3.5 text-base font-medium text-white transition hover:bg-white/5"
          >
            See it drive
          </Link>
        </div>
        <p className="mt-12 text-[11px] tracking-[0.35em] text-white/35 uppercase">by Rivian</p>
      </main>

      <section className="relative z-10 mx-auto max-w-5xl px-6 pb-28">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          {CAPS.map(({ icon: Icon, label, sub }) => (
            <div
              key={label}
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-left backdrop-blur-sm"
            >
              <Icon className="size-5" style={{ color: YELLOW }} />
              <p className="mt-3 text-sm font-medium text-white">{label}</p>
              <p className="mt-1 text-xs leading-relaxed text-white/45">{sub}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="relative z-10 mx-auto max-w-6xl px-6 pb-10">
        <div className="flex flex-col items-center justify-between gap-3 border-t border-white/10 pt-6 text-xs text-white/40 sm:flex-row">
          <span className="tracking-[0.3em] uppercase">ThomasClaw — by Rivian</span>
          <span>The drive that does the work.</span>
        </div>
      </footer>
    </div>
  );
}
