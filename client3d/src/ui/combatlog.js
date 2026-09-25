// Combat log, Baldur's Gate 3 style: one readable line per event (newest at the
// bottom, a divider per round), rig names coloured by side, and a hover card
// with the full roll breakdown the engine recorded (to-hit target and the terms
// that built it, every die, location, wound roll, damage riders, side effects).
import { el, fill } from "./dom.js";

const LOC = { hull: "Hull", arms: "Arms", legs: "Legs", engine: "Engine" };
const ICON = { attack: "⚔", overheat: "🔥", destruction: "💥", initiative: "⚑", reaction: "🛡", prepare: "🛡", repair: "🔧", reload: "🔄", equipment: "⚙", blast: "💥", perk: "✦", lock: "📡", barrage: "💣", emplace: "⚓", shutdown: "❄" };
const signed = (v) => (v > 0 ? `+${v}` : `${v}`);

export class CombatLog {
  constructor(parent, { side = "a", nameSide = () => null } = {}) {
    this.side = side; this.nameSide = nameSide;
    this.root = el("div", { class: "clog" });
    this.head = el("div", { class: "clog-h" }, "Combat log");
    this.list = el("div", { class: "clog-list" });
    this.card = el("div", { class: "clog-card" });
    this.root.append(this.head, this.list);
    parent.append(this.root);
    document.body.append(this.card);
    this.round = null;
    this.onKey = (e) => { if (e.key === "Escape" && this.pinned) this.unpin(); };
    document.addEventListener("keydown", this.onKey);
  }

  unpin() {
    this.pinned?.classList.remove("pinned");
    this.pinned = null;
    this.card.classList.remove("pinned");
    this.card.style.display = "none";
  }

  // A rig name, coloured by its side.
  who(name) {
    const s = this.nameSide(name);
    return el("b", { class: s === "a" ? "c-a" : s === "b" ? "c-b" : "" }, name);
  }

  add(l, round) {
    if (round != null && round !== this.round) {
      this.round = round;
      this.list.append(el("div", { class: "clog-round" }, `Round ${round}`));
    }
    const line = el("div", { class: `clog-line k-${l.kind}` }, el("span", { class: "ic" }, ICON[l.kind] || "•"), this.text(l));
    line.title = ""; // no native tip; our card is the tip
    line.addEventListener("mouseenter", (e) => { if (!this.pinned) this.show(l, e); });
    line.addEventListener("mousemove", (e) => { if (!this.pinned) this.place(e); });
    line.addEventListener("mouseleave", () => { if (!this.pinned) this.card.style.display = "none"; });
    // Click: lock this entry's card open to study it (click again / ✕ / Esc to release).
    line.addEventListener("click", (e) => {
      if (this.pinned === line) return this.unpin();
      this.unpin();
      this.show(l, e);
      this.pinned = line;
      line.classList.add("pinned");
      this.card.classList.add("pinned");
      this.card.prepend(el("div", { class: "cc-pin" }, "📌 Pinned", el("button", { class: "cc-x", title: "Release (Esc)", onClick: () => this.unpin() }, "✕")));
      const r = this.root.getBoundingClientRect(), c = this.card.getBoundingClientRect();
      this.card.style.left = `${Math.max(8, r.left - c.width - 12)}px`;
      this.card.style.top = `${Math.max(8, Math.min(innerHeight - c.height - 8, r.bottom - c.height))}px`;
    });
    const stick = this.list.scrollHeight - this.list.scrollTop - this.list.clientHeight < 30;
    this.list.append(line);
    while (this.list.children.length > 200) this.list.firstChild.remove();
    if (stick) this.list.scrollTop = this.list.scrollHeight;
  }

  text(l) {
    const b = l.breakdown;
    if (l.kind === "attack" && b) {
      const hit = b.steps?.find((s) => s.kind === "hit");
      const hits = hit?.dice?.filter((d) => d.ok).length ?? 0;
      if (!b.sp) return el("span", {}, this.who(b.actor), hits ? " struck " : " missed ", this.who(b.target), el("span", { class: "muted" }, ` with ${b.weapon}`), hits ? el("span", { class: "muted" }, ": no damage") : null);
      return el("span", {}, this.who(b.actor), " hit ", this.who(b.target), el("span", { class: "muted" }, ` with ${b.weapon}: `), el("b", { class: "dmg" }, `${b.sp} damage`), el("span", { class: "muted" }, ` to ${LOC[b.location] || b.location}`));
    }
    if (l.kind === "overheat") {
      const m = /^(.*?):\s*(.*?)\s*\(/.exec(l.summary || "");
      return m ? el("span", {}, this.who(m[1]), /Nothing happens/.test(m[2]) ? el("span", { class: "muted" }, " overheated but held together") : [" overheated: ", el("b", { class: "bad" }, m[2])]) : l.summary;
    }
    if (l.kind === "initiative") {
      const m = /(\b[ab]\b) (?:activates )?first/.exec(l.summary || "");
      return m ? el("span", {}, `${m[1] === this.side ? "You act" : "The enemy acts"} first this round`, el("span", { class: "muted" }, ` (${(l.summary.match(/\(([^)]*)\)/) || [])[1] || "initiative"})`)) : l.summary;
    }
    if (l.kind === "destruction") return el("span", { class: "bad" }, l.summary);
    return el("span", {}, l.summary || l.kind);
  }

  // ---- Hover card ----
  show(l, e) {
    const b = l.breakdown;
    const dice = (arr) => el("span", { class: "dice" }, (arr || []).map((d) => el("i", { class: d.ok ? "ok" : "no" }, String(d.value))));
    const terms = (arr) => (arr || []).map((t) => el("div", { class: "term" }, el("span", {}, t.label), el("span", {}, signed(t.value))));
    let body;
    if (l.kind === "attack" && b) {
      body = [el("div", { class: "cc-title" }, `${b.actor} → ${b.target}`, el("span", { class: "muted" }, ` · ${b.weapon}`))];
      for (const s of b.steps || []) {
        if (s.kind === "hit") body.push(el("div", { class: "cc-step" }, el("div", { class: "cc-sh" }, `To hit: ${s.target}+ on D6`, el("span", { class: "out" }, s.out)), terms(s.terms), dice(s.dice)));
        else if (s.kind === "location") body.push(el("div", { class: "cc-step" }, el("div", { class: "cc-sh" }, "Location", el("span", { class: "out" }, s.out)), s.die != null ? dice([{ value: s.die, ok: true }]) : null));
        else if (s.kind === "wound") body.push(el("div", { class: "cc-step" }, el("div", { class: "cc-sh" }, s.target != null ? `Wound: ${s.target}+ on D10` : "Wound", el("span", { class: "out" }, s.out || "")),
          s.pen != null ? el("div", { class: "muted small" }, `Penetration ${s.pen} vs Toughness ${s.toughness}`) : null, terms(s.terms), dice(s.dice)));
        else if (s.kind === "damage") body.push(el("div", { class: "cc-step" }, el("div", { class: "cc-sh" }, "Damage", el("span", { class: "out" }, s.out)), terms(s.terms)));
      }
    } else {
      body = [el("div", { class: "cc-title" }, l.summary || l.kind),
        (l.rolls || []).length ? el("div", { class: "cc-step" }, el("div", { class: "cc-sh" }, "Rolls"), el("span", { class: "dice" }, l.rolls.map((r) => el("i", { class: r.tone === "miss" ? "no" : "ok", title: `${r.label} (d${r.sides})` }, String(r.value))))) : null];
    }
    if (l.effects?.length) body.push(el("div", { class: "cc-step" }, el("div", { class: "cc-sh" }, "Effects"), l.effects.map((x) => el("div", { class: "fx" }, `• ${x}`))));
    fill(this.card, body);
    this.card.style.display = "block";
    this.place(e);
  }

  place(e) {
    const r = this.card.getBoundingClientRect();
    const x = Math.max(8, Math.min(window.innerWidth - r.width - 8, e.clientX - r.width - 16));
    const y = Math.max(8, Math.min(window.innerHeight - r.height - 8, e.clientY - r.height / 2));
    this.card.style.left = `${x}px`; this.card.style.top = `${y}px`;
  }

  destroy() { document.removeEventListener("keydown", this.onKey); this.root.remove(); this.card.remove(); }
}
