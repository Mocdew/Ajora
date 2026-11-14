import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";
import vinext from "vinext";

const production = process.env.AJORA_CLOUDFLARE_PRODUCTION === "true";

// Keep local Next.js .env files out of deployed Worker builds.
process.env.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV = "false";
process.env.AJORA_CLOUDFLARE_WORKER = "true";
process.env.NEXT_PUBLIC_AJORA_MANUAL_SAVINGS_ENABLED = production ? "false" : "true";
process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = production ? (process.env.AJORA_PRODUCTION_GOOGLE_CLIENT_ID ?? "") : "";

export default defineConfig({
  // The RSC loader resolves the SSR child entry as ssr/index.js.
  environments: {
    ssr: { build: { rolldownOptions: { output: { entryFileNames: "[name].js" } } } },
  },
  plugins: [
    vinext(),
    cloudflare({
      configPath: production ? "wrangler.production.jsonc" : "wrangler.jsonc",
      viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
    }),
  ],
});
