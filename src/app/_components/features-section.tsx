import Image from "next/image";
import {
  AudioLines,
  BrainCircuit,
  CalendarClock,
  KeyRound,
  Layers,
  Server,
  type LucideIcon,
} from "lucide-react";
import { AnimateOnView } from "~/components/core/animate-on-view";
import { GradientCard } from "./gradient-card";

function FeatureIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <div className="bg-muted flex h-10 w-10 shrink-0 items-center justify-center rounded-full shadow-[0_0_15px_color-mix(in_oklch,var(--primary)_20%,transparent)]">
      <Icon className="text-foreground h-5 w-5" aria-hidden />
    </div>
  );
}

const INTEGRATION_TOOLS: { slug: string; name: string }[] = [
  { slug: "gmail", name: "Gmail" },
  { slug: "googlecalendar", name: "Google Calendar" },
  { slug: "slack", name: "Slack" },
  { slug: "github", name: "GitHub" },
  { slug: "notion", name: "Notion" },
  { slug: "linear", name: "Linear" },
  { slug: "jira", name: "Jira" },
  { slug: "figma", name: "Figma" },
  { slug: "googledrive", name: "Google Drive" },
  { slug: "todoist", name: "Todoist" },
  { slug: "asana", name: "Asana" },
  { slug: "trello", name: "Trello" },
  { slug: "stripe", name: "Stripe" },
  { slug: "hubspot", name: "HubSpot" },
  { slug: "airtable", name: "Airtable" },
];

function IntegrationsCard({ index }: { index: number }) {
  return (
    <AnimateOnView delay={index * 0.1} className="md:col-span-2">
      <GradientCard>
        <FeatureIcon icon={Layers} />
        <div className="flex flex-col gap-1.5">
          <h3 className="text-foreground font-semibold">
            500+ tools, one chat
          </h3>
          <p className="text-muted-foreground max-w-[65ch] text-sm leading-relaxed">
            Connect Gmail, Calendar, Slack, GitHub, Notion, Linear, and
            hundreds more through Composio. Every connection is an OAuth grant
            scoped to your account, revocable in one click.
          </p>
        </div>
        <div className="grid grid-cols-5 gap-2 pt-1 sm:grid-cols-8 lg:grid-cols-[repeat(15,minmax(0,1fr))]">
          {INTEGRATION_TOOLS.map((tool) => (
            <div
              key={tool.slug}
              className="border-border bg-background flex aspect-square items-center justify-center rounded-lg border p-1.5"
              title={tool.name}
            >
              <Image
                src={`/images/logos/${tool.slug}.svg`}
                alt={tool.name}
                width={20}
                height={20}
                className="h-5 w-5"
              />
            </div>
          ))}
        </div>
      </GradientCard>
    </AnimateOnView>
  );
}

function ChannelsCard({ index }: { index: number }) {
  return (
    <AnimateOnView delay={index * 0.1}>
      <GradientCard>
        <FeatureIcon icon={AudioLines} />
        <div className="flex flex-col gap-1.5">
          <h3 className="text-foreground font-semibold">Beyond the browser</h3>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Message Claw from its Telegram bot, or talk to it on a realtime
            voice call. Same agent, same memory, same tools.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 pt-1">
          <div className="border-border bg-background flex items-center gap-2 rounded-lg border px-3 py-2">
            <Image
              src="/images/logos/telegram.svg"
              alt=""
              aria-hidden
              width={20}
              height={20}
              style={{ width: 20, height: 20 }}
            />
            <span className="text-muted-foreground text-sm font-medium">
              Telegram
            </span>
          </div>
          <div className="border-border bg-background flex items-center gap-2 rounded-lg border px-3 py-2">
            <AudioLines className="text-primary size-5 shrink-0" aria-hidden />
            <span className="text-muted-foreground text-sm font-medium">
              Voice calls
            </span>
          </div>
        </div>
      </GradientCard>
    </AnimateOnView>
  );
}

interface SimpleFeature {
  icon: LucideIcon;
  title: string;
  description: string;
}

const SIMPLE_FEATURES: SimpleFeature[] = [
  {
    icon: KeyRound,
    title: "Your keys, encrypted",
    description:
      "Bring your own Anthropic key or start on the free house models. Keys are encrypted with AES-256-GCM before they ever touch the database.",
  },
  {
    icon: BrainCircuit,
    title: "Remembers everything",
    description:
      "Persistent vector memory in your own Postgres. Claw recalls decisions, preferences, and context across every conversation.",
  },
  {
    icon: CalendarClock,
    title: "Runs on a schedule",
    description:
      "Cron-style scheduled tasks in your timezone: morning briefings, weekly digests, follow-up nudges. Claw runs them while you are away.",
  },
];

function SimpleFeatureCard({
  feature,
  index,
}: {
  feature: SimpleFeature;
  index: number;
}) {
  return (
    <AnimateOnView delay={index * 0.1}>
      <GradientCard>
        <FeatureIcon icon={feature.icon} />
        <div className="flex flex-col gap-1.5">
          <h3 className="text-foreground font-semibold">{feature.title}</h3>
          <p className="text-muted-foreground text-sm leading-relaxed">
            {feature.description}
          </p>
        </div>
      </GradientCard>
    </AnimateOnView>
  );
}

function SelfHostCard({ index }: { index: number }) {
  return (
    <AnimateOnView delay={index * 0.1} className="md:col-span-2 lg:col-span-3">
      <GradientCard innerClassName="md:flex-row md:items-center md:gap-6">
        <FeatureIcon icon={Server} />
        <div className="flex flex-col gap-1.5">
          <h3 className="text-foreground font-semibold">
            Runs on your infrastructure
          </h3>
          <p className="text-muted-foreground max-w-[65ch] text-sm leading-relaxed">
            Deploy to Vercel with Postgres, or run everything locally. The
            codebase is open, so you can audit exactly what your agent can do
            before you hand it your inbox.
          </p>
        </div>
      </GradientCard>
    </AnimateOnView>
  );
}

export function FeaturesSection() {
  return (
    <section className="relative overflow-hidden px-4 py-16 md:px-6 md:py-24 lg:py-32">
      {/* Decorative concentric quarter-circle arcs. CSS substitute for the
          former quarter_circle.svg, which was 572KB of raster texture
          embedded in an SVG wrapper. */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-0 -right-40 hidden h-[500px] w-[500px] opacity-[0.07] md:h-[700px] md:w-[700px] dark:block"
        style={{
          background:
            "repeating-radial-gradient(circle at 100% 0%, var(--foreground) 0 1px, transparent 1px 48px)",
          maskImage:
            "radial-gradient(circle at 100% 0%, black 30%, transparent 78%)",
          WebkitMaskImage:
            "radial-gradient(circle at 100% 0%, black 30%, transparent 78%)",
        }}
      />

      <div className="relative z-10 mx-auto max-w-6xl">
        <AnimateOnView className="mb-10 md:mb-16">
          <p className="text-muted-foreground mb-4 font-mono text-xs font-medium uppercase tracking-widest">
            What it does
          </p>
          <h2 className="text-foreground text-2xl font-bold tracking-tight md:text-3xl lg:text-4xl">
            A full personal agent, on your terms.
          </h2>
          <p className="text-muted-foreground mt-3 max-w-[65ch] text-base md:text-lg">
            Email, calendar, code, and docs in one chat, with memory that
            persists and jobs that run whether or not you are at the keyboard.
          </p>
        </AnimateOnView>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6 lg:grid-cols-3">
          <IntegrationsCard index={0} />
          <SimpleFeatureCard feature={SIMPLE_FEATURES[1]!} index={1} />
          <SimpleFeatureCard feature={SIMPLE_FEATURES[0]!} index={2} />
          <SimpleFeatureCard feature={SIMPLE_FEATURES[2]!} index={3} />
          <ChannelsCard index={4} />
          <SelfHostCard index={5} />
        </div>
      </div>
    </section>
  );
}
