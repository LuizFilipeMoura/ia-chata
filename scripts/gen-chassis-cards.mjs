// scripts/gen-chassis-cards.mjs
// Offline: emits one PNG QR per chassis (filename = codename + weapons) into
// client/src/assets/qr/, plus a printable PDF with the codename + weapons label
// above each code. Run: node scripts/gen-chassis-cards.mjs
import { writeFile, mkdir } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import QRCode from "qrcode";
import PDFDocument from "pdfkit";
import { CHASSIS } from "../shared/game-state.js";

// Keep in lockstep with QR_PREFIX in client/src/v2/lib/qrCommission.ts. A .mjs
// script can't import a .ts client module, so this single constant is duplicated
// deliberately; it is format-versioned and changes rarely.
const QR_PREFIX = "rig:v1:";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "client", "src", "assets", "qr");

// Windows-safe filename: drop reserved chars, turn the "·" separator into a dash.
const safeName = (s) =>
  s.replace(/·/g, "-").replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim();

async function main() {
  await mkdir(OUT, { recursive: true });

  // 1) One PNG per chassis, named "<Codename> - <LongRange> <Melee>.png".
  const cards = [];
  for (const c of CHASSIS) {
    const payload = `${QR_PREFIX}${c.id}`;
    const label = `${c.name} — ${c.longRange} · ${c.melee}`;
    const file = `${safeName(`${c.name} - ${c.longRange} ${c.melee}`)}.png`;
    const pngPath = join(OUT, file);
    await QRCode.toFile(pngPath, payload, { type: "png", width: 512, margin: 1 });
    cards.push({ name: c.name, weapons: `${c.longRange} · ${c.melee}`, label, pngPath, file });
  }

  // 2) A printable PDF sized to glue onto a mini's ROUND base. The smallest base
  // is 40mm; a square QR inscribed in a 40mm circle maxes at 40/√2 ≈ 28mm on a
  // side (corners touch the rim), so every code fits any base >= 40mm. A faint
  // 40mm circle is drawn around each QR as a cut/alignment guide, with the
  // codename + weapons label above it. Printed at 100% scale (no "fit to page").
  const MM = 2.83465; // pt per millimetre
  const BASE_MM = 40; // smallest round base
  const QR_MM = 28;   // largest square fully inscribed in a 40mm circle
  const pdfPath = join(OUT, "chassis-qr-cards.pdf");
  await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const stream = createWriteStream(pdfPath);
    stream.on("finish", resolve);
    stream.on("error", reject);
    doc.pipe(stream);

    const PAGE_W = 595.28, MARGIN = 40, COLS = 3, ROWS = 4;
    const cellW = (PAGE_W - MARGIN * 2) / COLS;
    const cellH = 175;
    const baseR = (BASE_MM * MM) / 2;
    const qrPt = QR_MM * MM;
    const labelH = 34;

    cards.forEach((card, i) => {
      const slot = i % (COLS * ROWS);
      if (i > 0 && slot === 0) doc.addPage();
      const col = slot % COLS;
      const row = Math.floor(slot / COLS);
      const cellX = MARGIN + col * cellW;
      const cellY = MARGIN + row * cellH;
      const cx = cellX + cellW / 2;

      // Label: codename (bold) + weapons, centred over the base.
      doc.fillColor("#111").font("Helvetica-Bold").fontSize(11)
        .text(card.name, cellX, cellY, { width: cellW, align: "center" });
      doc.font("Helvetica").fontSize(8).fillColor("#555")
        .text(card.weapons, cellX, cellY + 14, { width: cellW, align: "center" });

      // 40mm base circle (cut/align guide) with the 28mm QR centred inside it.
      const cy = cellY + labelH + baseR;
      doc.save().lineWidth(0.4).strokeColor("#bbb").circle(cx, cy, baseR).stroke().restore();
      doc.image(card.pngPath, cx - qrPt / 2, cy - qrPt / 2, { width: qrPt, height: qrPt });
    });

    doc.end();
  });

  console.log(`Wrote ${cards.length} PNGs + chassis-qr-cards.pdf to ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
