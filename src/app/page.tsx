import { LandingPage } from "./_components/landing-page";
import { RivianLanding } from "./_components/rivian-landing";
import { RIVIAN_DEMO } from "~/lib/demo-flag";

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Thomas Claw",
  description:
    "Made By Sales People....it probably sucks and your data is now being sold on Temu.",
  applicationCategory: "Productivity",
  operatingSystem: "Web",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  creator: {
    "@type": "Organization",
    name: "Sales People",
  },
};

export default async function Page() {
  return (
    <>
      <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      {RIVIAN_DEMO ? <RivianLanding /> : <LandingPage />}
    </>
  );
}
