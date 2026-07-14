import "~/styles/globals.css";

import { type Metadata, type Viewport } from "next";
import { Bricolage_Grotesque, IBM_Plex_Mono, Inter } from "next/font/google";
import { Toaster } from "~/components/ui/sonner";
import { TRPCReactProvider } from "~/clients/trpc";
import { ThemeProvider } from "~/components/core/theme-provider";

const primary = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});
const code = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-ibm-plex-mono",
  weight: ["400", "500", "600", "700"],
});
const heading = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-heading",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Claw",
  description:
    "Your always-on AI agent that reads and sends email, runs on a schedule, remembers everything, and works across 500+ tools - all from one chat.",
  // Neutral default favicon for the shared app. The per-prospect demo landings
  // (/ford, /gm, …) override this with their own brand mark via route metadata
  // in src/app/[brand]/page.tsx.
  icons: [
    { rel: "icon", url: "/icon.svg", type: "image/svg+xml" },
    { rel: "icon", url: "/favicon.ico", sizes: "any" },
    { rel: "apple-touch-icon", url: "/apple-icon.png" },
  ],
};

// Without this, mobile browsers render at ~980px desktop width and ignore
// every responsive breakpoint. This is the single highest-impact mobile fix.
// interactiveWidget makes the layout viewport shrink when the on-screen
// keyboard opens, so the chat composer stays visible above it (with h-dvh
// shells) instead of being covered.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  interactiveWidget: "resizes-content",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${primary.variable} ${code.variable} ${heading.variable}`} suppressHydrationWarning>
      <body className="bg-background min-h-screen font-sans antialiased">
        <ThemeProvider>
          <TRPCReactProvider>
            {children}
            <Toaster />
            <div id="dialog-portal" />
          </TRPCReactProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
