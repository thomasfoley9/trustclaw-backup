import { LandingPage } from "./_components/landing-page";

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "TrustClaw",
  description:
    "Self-hostable personal AI agent with vector memory, 500+ tool integrations, scheduled tasks, and a Telegram bot. Your keys, your data, your infrastructure.",
  applicationCategory: "Productivity",
  operatingSystem: "Web",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  creator: {
    "@type": "Organization",
    name: "Composio",
  },
};

export default async function Page() {
  return (
    <>
      <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      <LandingPage />
    </>
  );
}
