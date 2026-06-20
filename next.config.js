/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  skipTrailingSlashRedirect: true,

  async redirects() {
    // Old TrustClaw-branded production URLs -> new Thomas Claw canonical domain.
    // Listed explicitly (not a trustclaw-* wildcard) so per-deploy/preview URLs
    // aren't caught. thomasclaw.vercel.app is excluded, so there's no loop.
    const OLD_HOSTS = [
      "trustclaw-blue-kappa.vercel.app",
      "trustclaw-thomas-s-projects-d9abdfd0.vercel.app",
      "trustclaw-thomas-5672-thomas-s-projects-d9abdfd0.vercel.app",
    ];
    return OLD_HOSTS.map((host) => ({
      source: "/:path*",
      has: [{ type: "host", value: host }],
      destination: "https://thomasclaw.vercel.app/:path*",
      permanent: true,
    }));
  },

  async headers() {
    return [
      {
        source: "/images/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/:path*",
        headers: [
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains; preload",
          },
          {
            key: "Permissions-Policy",
            value:
              "camera=(), microphone=(self), geolocation=(), interest-cohort=()",
          },
          ...(process.env.NODE_ENV === "production"
            ? [
                {
                  key: "Content-Security-Policy",
                  value: [
                    "default-src 'self'",
                    // 'unsafe-inline' is here because Next.js streams inline
                    // hydration scripts. A nonce-based CSP is the proper fix
                    // but our prior attempt broke hydration; revisit later.
                    "script-src 'self' 'unsafe-inline'",
                    "style-src 'self' 'unsafe-inline'",
                    "img-src 'self' data: https:",
                    "font-src 'self' data:",
                    "connect-src 'self' *.composio.dev",
                    "frame-ancestors 'none'",
                    "object-src 'none'",
                    "base-uri 'self'",
                    "form-action 'self'",
                    "upgrade-insecure-requests",
                  ].join("; "),
                },
              ]
            : []),
        ],
      },
    ];
  },

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "logos.composio.dev",
      },
    ],
  },

  // Transpile packages if needed
  transpilePackages: [],

  // Strict mode for better debugging
  typescript: {
    ignoreBuildErrors: false,
  },

  eslint: {
    ignoreDuringBuilds: false,
  },
};

export default config;
