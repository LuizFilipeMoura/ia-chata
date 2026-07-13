// scripts/gen-chassis-qr.mjs
// Offline generator: emits one printable QR SVG per chassis + a contact sheet.
// Run: node scripts/gen-chassis-qr.mjs
import { writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import QRCode from "qrcode";
import { CHASSIS } from "../shared/game-state.js";

// Keep in lockstep with QR_PREFIX in client/src/v2/lib/qrCommission.ts. A .mjs
// script can't import a .ts client module, so this single constant is duplicated
// deliberately; it is format-versioned and changes rarely.
const QR_PREFIX = "rig:v1:";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "docs", "qr");

async function main() {
  await mkdir(OUT, { recursive: true });
  const cards = [];
  for (const c of CHASSIS) {
    const payload = `${QR_PREFIX}${c.id}`;
    const svg = await QRCode.toString(payload, { type: "svg", margin: 1 });
    await writeFile(join(OUT, `${c.id}.svg`), svg, "utf8");
    cards.push(
      `<figure style="display:inline-block;width:200px;margin:8px;text-align:center;font-family:sans-serif">
        ${svg}
        <figcaption><strong>${c.name}</strong><br><small>${c.label}</small></figcaption>
      </figure>`,
    );
  }
  await writeFile(
    join(OUT, "contact-sheet.html"),
    `<!doctype html><meta charset="utf-8"><title>Chassis QR sheet</title><body>${cards.join("\n")}</body>`,
    "utf8",
  );
  console.log(`Wrote ${CHASSIS.length} codes + contact-sheet.html to ${OUT}`);
}
main();
