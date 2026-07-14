import Link from "next/link";
import { TrainFront } from "lucide-react";
import { LandingNav } from "./landing-nav";
import { TrainMascot } from "./train-mascot";
import { TrustClawBrand } from "./trustclaw-brand";
import { Button } from "~/components/ui/button";

const CAPABILITIES = [
  "Reads & sends your email",
  "Runs on a schedule",
  "Remembers everything",
  "Swappable personalities",
  "500+ tools, one chat",
];

export function LandingPage() {
  return (
    <div className="bg-background relative flex min-h-screen flex-col overflow-x-hidden">
      <div
        className="ambient-glow pointer-events-none absolute inset-0 h-[820px]"
        aria-hidden
      />
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[60] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground"
      >
        Skip to content
      </a>
      <LandingNav />

      <main id="main-content" className="relative flex-1">
        <section className="mx-auto flex max-w-3xl flex-col items-center px-4 pt-20 pb-24 text-center md:pt-28">
          <span className="border-border bg-card/60 text-muted-foreground mb-8 inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-medium backdrop-blur">
            <TrainFront className="size-3.5" aria-hidden />
            Now boarding · Claw
          </span>

          <div className="animate-[float-y_6s_ease-in-out_infinite]">
            <TrainMascot size={196} className="drop-shadow-[0_24px_40px_oklch(0_0_0/0.5)]" />
          </div>

          <h1 className="font-heading mt-8 text-4xl font-bold tracking-tight text-balance sm:text-5xl md:text-6xl">
            <span className="text-gradient">Claw</span> ships while you sleep.
          </h1>

          <p className="text-muted-foreground mt-5 max-w-xl text-lg text-pretty">
            Your always-on AI founder that runs on rails - building, emailing,
            scheduling, and closing loops around the clock. All aboard.
          </p>

          <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row">
            <Button
              asChild
              size="lg"
              variant="brand"
              className="h-12 px-7 text-base"
            >
              <Link href="/login?tab=register">Get started - it&apos;s free</Link>
            </Button>
            <Link
              href="/login"
              className="text-muted-foreground hover:text-foreground text-sm"
            >
              Already aboard? Log in →
            </Link>
          </div>

          <div className="mt-14 flex flex-wrap justify-center gap-2">
            {CAPABILITIES.map((c) => (
              <span
                key={c}
                className="border-border bg-card/50 text-muted-foreground rounded-full border px-3.5 py-1.5 text-xs backdrop-blur"
              >
                {c}
              </span>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-border relative border-t px-4 py-6">
        <div className="text-muted-foreground mx-auto flex max-w-3xl flex-col items-center gap-2 text-center text-xs">
          <TrustClawBrand size="sm" />
          <p>Self-hosted. Your keys, your data, your agent.</p>
        </div>
      </footer>
    </div>
  );
}
