import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets your phone load the dev server over Tailscale or the home Wi-Fi. Development only; it has no effect on the live site.
  allowedDevOrigins: ["100.90.228.111", "amir.tail1d410.ts.net", "192.168.68.54"],
  // Hides the Next.js development badge. Real compile and runtime errors are still shown.
  devIndicators: false,
  // Keeps a visited page for 20 seconds so going back or revisiting is instant. Saving something refreshes it.
  experimental: { staleTimes: { dynamic: 20 } },
  // The website widget loads these fonts from other domains, which browsers only allow with this header.
  async headers() {
    return [
      {
        source: "/fonts/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
  /* config options here */
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
