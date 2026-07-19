import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwind from "@astrojs/tailwind";
import vercel from "@astrojs/vercel";

// Static output; dynamic room codes are passed as ?code= on /host and /play.
export default defineConfig({
  integrations: [react(), tailwind()],
  adapter: vercel(),
  output: "static",
  server: {
    port: 4321,
  },
});
