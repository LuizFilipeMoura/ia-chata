// The dice-resolution overlay. In auto mode it animates a server resolution-log
// entry: dice flicker + jitter, then land on their real values with a zone glow,
// then the summary/effects stagger in. Math.random here only drives the cosmetic
// flicker — the landed values always come from the server entry.
const scrim = document.getElementById("rollScrim");
const consoleEl = document.getElementById("rollConsole");
const kindEl = document.getElementById("rollKind");
const diceEl = document.getElementById("rollDice");
const summaryEl = document.getElementById("rollSummary");
const effectsEl = document.getElementById("rollEffects");
const closeBtn = document.getElementById("rollClose");

const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let hideTimer = null;

const KIND_TONE = { overheat: "crit", attack: "crit", ram: "crit", destruction: "crit", blast: "crit", repair: "cool", initiative: "oil", perk: "crit", skip: "warn" };

function open() {
  clearTimeout(hideTimer);
  scrim.hidden = false;
  void scrim.offsetWidth;
  scrim.classList.add("show");
}
export function closeRoll() {
  scrim.classList.remove("show");
  hideTimer = setTimeout(() => { scrim.hidden = true; }, 220);
}
closeBtn.addEventListener("click", closeRoll);
scrim.addEventListener("click", (e) => { if (e.target === scrim) closeRoll(); });

// Animate one resolution entry. Returns a promise that resolves when it settles.
export function playResolution(entry) {
  kindEl.textContent = (entry.kind || "resolution").toUpperCase();
  diceEl.innerHTML = "";
  summaryEl.textContent = "";
  effectsEl.innerHTML = "";
  const tone = KIND_TONE[entry.kind] || "oil";
  open();

  const dice = (entry.rolls || []).filter((r) => r.sides);
  const settled = dice.map((roll) => {
    const wrap = document.createElement("div");
    wrap.className = "die-wrap";
    const die = document.createElement("div");
    die.className = `die ${roll.sides === 12 ? "d12" : "d6"} rolling`;
    die.textContent = "?";
    const label = document.createElement("span");
    label.className = "die-label";
    label.textContent = roll.label || `D${roll.sides}`;
    wrap.appendChild(die);
    wrap.appendChild(label);
    diceEl.appendChild(wrap);
    return { die, roll };
  });

  const finish = () => {
    for (const { die, roll } of settled) {
      die.classList.remove("rolling");
      die.classList.add("settled");
      die.dataset.tone = tone === "cool" ? "cool" : (roll.sides === 12 || tone === "crit" ? "crit" : "");
      die.textContent = String(roll.value);
    }
    summaryEl.textContent = entry.summary || "";
    (entry.effects || []).forEach((text, i) => {
      const el = document.createElement("div");
      el.className = "roll-effect";
      el.style.animationDelay = `${0.5 + i * 0.12}s`;
      el.textContent = text;
      effectsEl.appendChild(el);
    });
  };

  if (reduced || dice.length === 0) { finish(); return Promise.resolve(); }

  return new Promise((resolve) => {
    const started = performance.now();
    const flicker = setInterval(() => {
      for (const { die, roll } of settled) die.textContent = String(Math.floor(Math.random() * roll.sides) + 1);
      if (performance.now() - started > 650) { clearInterval(flicker); finish(); resolve(); }
    }, 60);
  });
}
