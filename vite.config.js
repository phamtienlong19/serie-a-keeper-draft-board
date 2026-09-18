import { sites } from "@openai/sites-vite-plugin";
import { defineConfig, loadEnv } from "vite";

const DEFAULT_REPOSITORY = "serie-a-keeper-draft-board";
const DEFAULT_OWNER = "phamtienlong19";

function normalizeBasePath(value) {
  const withLeadingSlash = value.startsWith("/") ? value : `/${value}`;
  return withLeadingSlash.endsWith("/") ? withLeadingSlash : `${withLeadingSlash}/`;
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const repository = (env.GITHUB_REPOSITORY || `/${DEFAULT_REPOSITORY}`).split("/").at(-1);
  const owner = (env.GITHUB_REPOSITORY || `${DEFAULT_OWNER}/`).split("/")[0];
  const isSitesPreview = mode === "sites";
  const base = command === "serve" || isSitesPreview
    ? "/"
    : normalizeBasePath(env.VITE_BASE_PATH || repository);
  const publicSiteUrl = (env.VITE_PUBLIC_SITE_URL || `https://${owner}.github.io${base}`).replace(
    /\/*$/,
    "/",
  );

  return {
    base,
    build: {
      sourcemap: false,
    },
    plugins: [
      {
        name: "public-site-metadata",
        transformIndexHtml(html) {
          return html.replaceAll("%PUBLIC_SITE_URL%", publicSiteUrl);
        },
      },
      ...(isSitesPreview ? [sites()] : []),
    ],
  };
});
