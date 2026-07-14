import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Blocks,
  BrainCircuit,
  CalendarClock,
  Drama,
  Mail,
  TrainFront,
  type LucideIcon,
} from "lucide-react";
import { Button } from "~/components/ui/button";
import { ChatMockup } from "./chat-mockup";

const CAPABILITIES: { icon: LucideIcon; label: string }[] = [
  { icon: Mail, label: "Reads & sends your email" },
  { icon: CalendarClock, label: "Runs on a schedule" },
  { icon: BrainCircuit, label: "Remembers everything" },
  { icon: Drama, label: "Swappable personalities" },
  { icon: Blocks, label: "500+ tools, one chat" },
];

const SCATTERED_LOGOS = [
  { slug: "gmail", top: "5%", left: "55%" },
  { slug: "github", top: "18%", left: "85%" },
  { slug: "jira", top: "65%", left: "58%" },
  { slug: "notion", top: "75%", left: "82%" },
  { slug: "googlecalendar", top: "35%", left: "92%" },
  { slug: "linear", top: "85%", left: "70%" },
  { slug: "figma", top: "10%", left: "72%" },
  { slug: "asana", top: "48%", left: "55%" },
  { slug: "trello", top: "8%", left: "95%" },
  { slug: "googledrive", top: "70%", left: "95%" },
  { slug: "discord", top: "40%", left: "65%" },
  { slug: "dropbox", top: "25%", left: "62%" },
] as const;

const SCATTER_TIMING = [
  { delay: 0, duration: 6 },
  { delay: 0.5, duration: 7 },
  { delay: 1, duration: 5.5 },
  { delay: 1.5, duration: 6.5 },
  { delay: 0.8, duration: 7.5 },
  { delay: 0.3, duration: 5 },
  { delay: 1.2, duration: 6.8 },
  { delay: 0.7, duration: 5.8 },
  { delay: 1.8, duration: 6.2 },
  { delay: 0.4, duration: 7.2 },
  { delay: 1.1, duration: 5.3 },
  { delay: 2, duration: 6.4 },
] as const;

/**
 * Above-the-fold content renders statically visible: no AnimateOnView, no
 * opacity gating. The H1 is the LCP element and must never depend on JS.
 * Decorative flourishes (scattered logos, mockup slide-in) are pure CSS.
 */
export function HeroSection() {
  return (
    <section className="relative px-4 pt-24 pb-16 md:px-6 md:pt-32 md:pb-24 lg:pb-32">
      <Image
        src="/images/elements/rays_left.svg"
        alt=""
        aria-hidden
        width={1920}
        height={1080}
        priority
        className="pointer-events-none absolute left-1/2 top-1/2 hidden h-auto w-[140%] max-w-none -translate-x-1/2 -translate-y-1/2 -scale-x-100 lg:block"
      />
      <div className="pointer-events-none absolute right-0 top-1/2 hidden h-[600px] w-[600px] -translate-y-1/2 translate-x-1/4 lg:block">
        <div className="h-full w-full rounded-full bg-[radial-gradient(ellipse_at_center,_color-mix(in_oklch,var(--primary)_15%,transparent),_transparent_70%)]" />
      </div>

      {SCATTERED_LOGOS.map((pos, i) => {
        const timing = SCATTER_TIMING[i]!;
        return (
          <div
            key={pos.slug}
            className="pointer-events-none absolute z-[7] hidden lg:block"
            style={{
              top: pos.top,
              left: pos.left,
              animation: `scatter-in 2s var(--ease-out-quad) ${timing.delay + 0.5}s both, float-y ${timing.duration}s ease-in-out ${timing.delay + 0.5}s infinite`,
            }}
          >
            <Image
              src={`/images/logos/${pos.slug}.svg`}
              alt=""
              aria-hidden
              width={36}
              height={36}
              style={{ width: 36, height: 36 }}
            />
          </div>
        );
      })}

      <div className="pointer-events-none absolute inset-0 hidden lg:block lg:z-[5] lg:bg-[radial-gradient(ellipse_120%_140%_at_0%_50%,_var(--background)_40%,_transparent_100%)]" />

      <div className="relative z-10 mx-auto flex max-w-6xl flex-col items-center gap-12 lg:flex-row lg:items-center lg:gap-16">
        <div className="flex flex-1 flex-col items-center gap-6 text-center lg:items-start lg:text-left">
          <span className="border-border bg-card/60 text-muted-foreground inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-medium backdrop-blur">
            <TrainFront className="size-3.5" aria-hidden />
            Self-hosted personal AI agent
          </span>

          <h1 className="text-foreground text-4xl font-bold leading-tight tracking-tight text-balance md:text-5xl lg:text-6xl">
            <span className="text-gradient">Claw</span> ships while you sleep.
          </h1>

          <p className="text-muted-foreground max-w-[65ch] text-base text-pretty md:text-lg">
            A personal AI agent that runs on your own infrastructure. Bring
            your own Anthropic key or use the free house models, keep your
            data in your own Postgres, and read every line of the open
            codebase.
          </p>

          <div className="flex flex-col items-center gap-4 sm:flex-row">
            <Button
              asChild
              size="lg"
              variant="brand"
              className="h-12 px-7 text-base"
            >
              <Link href="/login?tab=register">
                Get started
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Link
              href="/login"
              className="text-muted-foreground hover:text-foreground text-sm transition-colors duration-fast ease-out-quad"
            >
              Already aboard? Log in →
            </Link>
          </div>

          <ul className="mt-2 flex flex-wrap justify-center gap-x-5 gap-y-2.5 lg:justify-start">
            {CAPABILITIES.map(({ icon: Icon, label }) => (
              <li
                key={label}
                className="text-muted-foreground flex items-center gap-2 text-sm"
              >
                <Icon className="text-primary size-4 shrink-0" aria-hidden />
                {label}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex w-full flex-1 justify-center lg:w-auto lg:justify-end">
          <ChatMockup />
        </div>
      </div>
    </section>
  );
}
