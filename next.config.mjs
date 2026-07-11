import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export', // Tells Next.js to generate static HTML/CSS/JS files
  images: {
    unoptimized: true, // Required because GitHub Pages cannot dynamically resize images
  },
};

export default withSentryConfig(
  nextConfig,
  {
    silent: true,
    org: "bustap",
    project: "web-app",
    // Skip sentry release creation and source map uploading if no auth token is provided
    dryRun: !process.env.SENTRY_AUTH_TOKEN,
  },
  {
    widenClientBounds: true,
    transpileClientSDK: true,
    //tunnelRoute: "/monitoring",
    hideSourceMaps: true,
    disableLogger: true,
    automaticVercelMonitors: true,
  }
);
