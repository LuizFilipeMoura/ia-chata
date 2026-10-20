// Build a portable HTML document with the real rig code embedded.
// Usage: node client3d/src/tools/export-material-tuner.mjs <output.html>
import { build } from "vite";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

if (!process.argv[2]) throw new Error("Provide an output HTML path.");
const output = resolve(process.argv[2]);
const built = await build({
  configFile: false,
  root: fileURLToPath(new URL("../../", import.meta.url)),
  resolve: { alias: [{ find: /^\/shared/, replacement: fileURLToPath(new URL("../../../shared", import.meta.url)) }] },
  build: {
    write: false,
    lib: { entry: fileURLToPath(new URL("./material-tuner.js", import.meta.url)), name: "TyrianMaterialLab", formats: ["iife"] },
    minify: true,
  },
});
const result = Array.isArray(built) ? built[0] : built;
const chunks = result.output.filter((part) => part.type === "chunk");
if (chunks.length !== 1 || chunks[0].imports.length || result.output.some((part) => part.type === "asset")) {
  throw new Error("Expected one self-contained JavaScript bundle.");
}
let html = await readFile(new URL("./material-tuner.html", import.meta.url), "utf8");
html = html.replace('href="../../#dev=poc.scene"', 'href="http://localhost:5174/3d/#dev=poc.scene"');
html = html.replace('<script type="module" src="./material-tuner.js"></script>', () => `<script>${chunks[0].code.replace(/<\/script/gi, "<\\/script")}</script>`);
await mkdir(dirname(output), { recursive: true });
await writeFile(output, html);
console.log(`Standalone HTML saved: ${output}`);
