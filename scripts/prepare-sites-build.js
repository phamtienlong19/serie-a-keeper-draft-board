import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDirectory = path.join(repositoryRoot, "dist");
const clientDirectory = path.join(distDirectory, "client");
const serverDirectory = path.join(distDirectory, "server");

fs.mkdirSync(clientDirectory, { recursive: true });
for (const entry of fs.readdirSync(distDirectory, { withFileTypes: true })) {
  if ([".openai", "client", "server"].includes(entry.name)) continue;
  fs.renameSync(path.join(distDirectory, entry.name), path.join(clientDirectory, entry.name));
}

fs.mkdirSync(serverDirectory, { recursive: true });
fs.writeFileSync(
  path.join(serverDirectory, "index.js"),
  [
    "export default {",
    "  async fetch(request, env) {",
    "    return env.ASSETS.fetch(request);",
    "  },",
    "};",
    "",
  ].join("\n"),
);

