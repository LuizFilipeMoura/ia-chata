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

  // 2) A printable PDF: label (codename + weapons) above each QR, grid-laid out.
  const pdfPath = join(OUT, "chassis-qr-cards.pdf");
  await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const stream = createWriteStream(pdfPath);
    stream.on("finish", resolve);
    stream.on("error", reject);
    doc.pipe(stream);

    const PAGE_W = 595.28, MARGIN = 40, COLS = 2, ROWS = 3;
    const cardW = (PAGE_W - MARGIN * 2) / COLS;
    const qrSize = 190;
    const rowH = 250;

    cards.forEach((card, i) => {
      const slot = i % (COLS * ROWS);
      if (i > 0 && slot === 0) doc.addPage();
      const col = slot % COLS;
      const row = Math.floor(slot / COLS);
      const x = MARGIN + col * cardW;
      const y = MARGIN + row * rowH;

      doc.fillColor("#111").font("Helvetica-Bold").fontSize(14)
        .text(card.name, x, y, { width: cardW, align: "center" });
      doc.font("Helvetica").fontSize(10).fillColor("#444")
        .text(card.weapons, x, y + 20, { width: cardW, align: "center" });
      doc.image(card.pngPath, x + (cardW - qrSize) / 2, y + 40, { width: qrSize, height: qrSize });
    });

    doc.end();
  });

  console.log(`Wrote ${cards.length} PNGs + chassis-qr-cards.pdf to ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
