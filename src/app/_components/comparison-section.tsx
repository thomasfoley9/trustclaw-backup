import { AnimateOnView } from "~/components/core/animate-on-view";

interface ComparisonRow {
  category: string;
  selfHosted: string;
  hosted: string;
}

const ROWS: ComparisonRow[] = [
  {
    category: "Where your data lives",
    selfHosted: "Your Postgres database, on your infrastructure",
    hosted: "The vendor's cloud",
  },
  {
    category: "Model API keys",
    selfHosted: "Yours, encrypted with AES-256-GCM at rest",
    hosted: "Held and managed by the vendor",
  },
  {
    category: "Memory",
    selfHosted: "pgvector tables you can query, export, or delete",
    hosted: "Stored on the vendor's side",
  },
  {
    category: "Code",
    selfHosted: "Open and auditable",
    hosted: "Usually closed source",
  },
  {
    category: "Model choice",
    selfHosted: "Any model your key unlocks, or the free house models",
    hosted: "The vendor's menu",
  },
  {
    category: "Who can switch it off",
    selfHosted: "Only you",
    hosted: "The vendor",
  },
];

export function ComparisonSection() {
  return (
    <section className="px-4 py-16 md:px-6 md:py-24 lg:py-32">
      <div className="mx-auto max-w-4xl">
        <AnimateOnView className="mb-10 md:mb-16">
          <p className="text-muted-foreground mb-4 font-mono text-xs font-medium uppercase tracking-widest">
            Self-hosted vs hosted
          </p>
          <h2 className="text-foreground text-2xl font-bold tracking-tight md:text-3xl lg:text-4xl">
            What self-hosting actually changes.
          </h2>
          <p className="text-muted-foreground mt-3 max-w-[65ch] text-base md:text-lg">
            Hosted assistants are convenient, and for plenty of people the
            right choice. Here is what moves to your side of the table when
            you run the agent yourself.
          </p>
        </AnimateOnView>

        <AnimateOnView
          className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0"
          delay={0.1}
          margin="-50px"
        >
          <table className="w-full min-w-[560px] border-collapse">
            <thead>
              <tr className="border-border border-b">
                <th className="py-4 pr-4 text-left" />
                <th className="text-foreground px-4 py-4 text-left text-sm font-semibold md:text-base">
                  Self-hosted Claw
                </th>
                <th className="text-muted-foreground px-4 py-4 text-left text-sm font-semibold md:text-base">
                  Typical hosted assistant
                </th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.category} className="border-border border-b">
                  <td className="text-foreground py-4 pr-4 align-top text-sm font-medium md:text-base">
                    {row.category}
                  </td>
                  <td className="text-foreground px-4 py-4 align-top text-xs md:text-sm">
                    {row.selfHosted}
                  </td>
                  <td className="text-muted-foreground px-4 py-4 align-top text-xs md:text-sm">
                    {row.hosted}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </AnimateOnView>
      </div>
    </section>
  );
}
