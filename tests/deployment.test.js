import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8");

test("Pages workflow tests and builds before upload and deployment", () => {
  const workflow = read(".github/workflows/deploy-pages.yml");
  const orderedTokens = [
    "run: npm ci",
    "run: npm test",
    "uses: actions/configure-pages@v5",
    "run: npm run build",
    "uses: actions/upload-pages-artifact@v5",
    "uses: actions/deploy-pages@v5",
  ];
  const positions = orderedTokens.map((token) => workflow.indexOf(token));

  assert.ok(positions.every((position) => position >= 0));
  assert.deepEqual(positions, [...positions].sort((left, right) => left - right));
  assert.match(workflow, /branches:\s*\n\s*- main/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /pages: write/);
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /uses: actions\/checkout@v7/);
  assert.match(workflow, /uses: actions\/setup-node@v7/);
  assert.match(workflow, /path: dist/);
  assert.doesNotMatch(workflow, /continue-on-error/);
});

test("standard production build is static and repository-subpath configurable", () => {
  const packageJson = JSON.parse(read("package.json"));
  const viteConfig = read("vite.config.js");
  const html = read("index.html");

  assert.match(packageJson.scripts.build, /^vite build && node scripts\/verify-pages-build\.js$/);
  assert.doesNotMatch(packageJson.scripts.build, /prepare-sites-build/);
  assert.match(packageJson.scripts["build:sites"], /prepare-sites-build/);
  assert.match(viteConfig, /VITE_BASE_PATH/);
  assert.match(viteConfig, /serie-a-keeper-draft-board/);
  assert.match(viteConfig, /command === "serve"/);
  assert.match(html, /%PUBLIC_SITE_URL%/);
  assert.doesNotMatch(html, /chatgpt\.site/);
});
