import {
  Code,
  Database,
  KeyRound,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { AnimateOnView } from "~/components/core/animate-on-view";

const GUARANTEES: {
  icon: LucideIcon;
  label: string;
  description: string;
  detail: string;
}[] = [
  {
    icon: KeyRound,
    label: "KEY STORAGE",
    description:
      "API keys are encrypted with AES-256-GCM before they are stored. The database never holds a plaintext key.",
    detail:
      "Bring your own Anthropic key, or start on the free house models and store no key at all.",
  },
  {
    icon: Database,
    label: "DATA LOCATION",
    description:
      "Chat history and vector memory live in your own Postgres database, on infrastructure you control.",
    detail: "Deploy to Vercel with Postgres, or run everything locally.",
  },
  {
    icon: ShieldCheck,
    label: "SCOPED TOOL ACCESS",
    description:
      "Tool connections are per-user OAuth grants brokered by Composio. The agent never handles your passwords.",
    detail: "Revoke a connection and the agent's access ends with it.",
  },
  {
    icon: Code,
    label: "OPEN CODEBASE",
    description:
      "The code is open and auditable. You can read exactly what the agent can do before you hand it your inbox.",
    detail: "No black box between your prompt and your data.",
  },
];

export function SecuritySection() {
  return (
    <section className="px-4 py-16 md:px-6 md:py-24 lg:py-32">
      <div className="mx-auto max-w-4xl">
        <AnimateOnView className="mb-10 md:mb-16">
          <p className="text-muted-foreground mb-4 font-mono text-xs font-medium uppercase tracking-widest">
            Security model
          </p>
          <h2 className="text-foreground text-2xl font-bold tracking-tight md:text-3xl lg:text-4xl">
            Your keys stay encrypted.
            <br />
            Your data stays in your database.
          </h2>
        </AnimateOnView>

        <div className="divide-border divide-y">
          {GUARANTEES.map((item, index) => (
            <AnimateOnView
              key={item.label}
              className="flex flex-col gap-4 py-8 first:pt-0 last:pb-0 md:flex-row md:gap-12"
              delay={index * 0.1}
              margin="-50px"
            >
              <div className="flex shrink-0 items-center gap-3 md:w-64">
                <item.icon
                  className="text-muted-foreground h-5 w-5 shrink-0"
                  aria-hidden
                />
                <span className="text-muted-foreground font-mono text-xs font-medium tracking-wider">
                  {item.label}
                </span>
              </div>
              <div className="flex max-w-[65ch] flex-col gap-3">
                <p className="text-foreground leading-relaxed">
                  {item.description}
                </p>
                <p className="text-muted-foreground leading-relaxed">
                  {item.detail}
                </p>
              </div>
            </AnimateOnView>
          ))}
        </div>
      </div>
    </section>
  );
}
