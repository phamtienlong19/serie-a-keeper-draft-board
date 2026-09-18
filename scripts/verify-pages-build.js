import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDirectory = path.join(repositoryRoot, "dist");
const repositoryName = (process.env.GITHUB_REPOSITORY || "/serie-a-keeper-draft-board")
  .split("/")
  .at(-1);
const requestedBase = process.env.VITE_BASE_PATH || repositoryName;
const expectedBase = `/${requestedBase.replace(/^\/+|\/+$/g, "")}/`;

function fail(message) {
  throw new Error(`GitHub Pages build verification failed: ${message}`);
}

function requireFile(relativePath) {
  const absolutePath = path.join(distDirectory, relativePath);
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    fail(`missing dist/${relativePath}`);
  }
  return absolutePath;
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(absolutePath) : [absolutePath];
  });
}

const indexPath = requireFile("index.html");
requireFile("og.png");
const builtFiles = walk(distDirectory);
const indexHtml = fs.readFileSync(indexPath, "utf8");
const textFiles = builtFiles.filter((file) => /\.(?:css|html|js|json|map|txt)$/i.test(file));
const textOutput = textFiles.map((file) => fs.readFileSync(file, "utf8")).join("\n");

for (const forbidden of ["chatgpt.site", "file://", "/Users/", "/mnt/data", "localhost"]) {
  if (textOutput.includes(forbidden)) fail(`production output contains ${forbidden}`);
}

if (builtFiles.some((file) => file.endsWith(".map"))) fail("source maps are present");
if (["client", "server", ".openai"].some((name) => fs.existsSync(path.join(distDirectory, name)))) {
  fail("standard build contains development-hosting layout");
}

const localReferences = [...indexHtml.matchAll(/(?:src|href)="([^"]+)"/g)]
  .map((match) => match[1])
  .filter((reference) => !/^(?:https?:|data:|#)/.test(reference));

if (localReferences.length === 0) fail("index.html has no local asset references");
for (const reference of localReferences) {
  if (!reference.startsWith(expectedBase)) {
    fail(`asset reference ${reference} is not rooted at ${expectedBase}`);
  }
  const relativePath = reference.slice(expectedBase.length).split(/[?#]/, 1)[0];
  requireFile(relativePath);
}

const javascript = builtFiles
  .filter((file) => file.endsWith(".js"))
  .map((file) => fs.readFileSync(file, "utf8"))
  .join("\n");
for (const marker of ["sup-fam", "yahooPlayerId", "Cooper Flagg"]) {
  if (!javascript.includes(marker)) fail(`bundled application data is missing marker: ${marker}`);
}

console.log(`Verified static GitHub Pages artifact at ${expectedBase} (${builtFiles.length} files).`);
