import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  /*
    Tunel Cloudflare wystawia serwer pod losowym adresem *.trycloudflare.com.
    Bez tego wpisu Next odrzuca zadania deweloperskie z obcego pochodzenia.
    TYMCZASOWE - przy wdrozeniu na wlasna domene mozna usunac.
  */
  allowedDevOrigins: ["*.trycloudflare.com"],
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
