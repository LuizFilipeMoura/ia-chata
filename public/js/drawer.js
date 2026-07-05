// A small, state-agnostic bottom-sheet drawer that speaks the same visual
// language as the attack wizard (aw-scrim/aw-card). Used for location pickers
// (Repair / Emergency Patch) and read-only recaps (activation summary) so the
// console never falls back to a raw window.prompt.
let scrim = null;

export function closeDrawer() {
  if (!scrim) return;
  const el = scrim;
  scrim = null;
  el.classList.remove("show");
  setTimeout(() => el.remove(), 250);
}

// opts:
//   title      — mono kicker at the top (required)
//   tone       — "ember" | "oil" | "cool" accent for the title (default "oil")
//   build(card) — callback to append the drawer's body content
//   actions    — [{ label, icon?, primary?, ghost?, onClick, disabled? }]
//   dismissable — clicking the backdrop closes (default true)
export function openDrawer(opts) {
  closeDrawer();
  scrim = document.createElement("div");
  scrim.className = "dwr-scrim";

  const card = document.createElement("div");
  card.className = "dwr-card";

  const title = document.createElement("div");
  title.className = "dwr-title";
  title.dataset.tone = opts.tone || "oil";
  title.textContent = opts.title;
  card.appendChild(title);

  if (typeof opts.build === "function") opts.build(card);

  if (opts.actions?.length) {
    const row = document.createElement("div");
    row.className = "dwr-actions";
    for (const a of opts.actions) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "dwr-btn" + (a.primary ? " primary" : "") + (a.ghost ? " ghost" : "");
      b.disabled = Boolean(a.disabled);
      b.innerHTML = `${a.icon ? `<span class="dwr-btn-ic">${a.icon}</span>` : ""}<span>${a.label}</span>`;
      b.addEventListener("click", () => a.onClick?.());
      row.appendChild(b);
    }
    card.appendChild(row);
  }

  scrim.appendChild(card);
  if (opts.dismissable !== false) {
    scrim.addEventListener("click", (e) => { if (e.target === scrim) closeDrawer(); });
  }
  document.body.appendChild(scrim);
  void scrim.offsetWidth;
  scrim.classList.add("show");
  return { close: closeDrawer, card };
}

// A labelled segmented control. Returns the wrapper; reports the picked value
// through onChange and reflects it in `state[key]` style via the caller.
export function choiceField(label, options, selected, onChange, icon) {
  const wrap = document.createElement("div");
  wrap.className = "dwr-field";
  const l = document.createElement("label");
  l.innerHTML = `${icon ? `<span class="dwr-field-ic">${icon}</span>` : ""}${label}`;
  wrap.appendChild(l);
  const seg = document.createElement("div");
  seg.className = "dwr-seg";
  for (const opt of options) {
    const value = typeof opt === "object" ? opt.value : opt;
    const text = typeof opt === "object" ? opt.label : opt;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "dwr-opt" + (value === selected ? " sel" : "");
    b.innerHTML = typeof opt === "object" && opt.icon ? `<span class="dwr-opt-ic">${opt.icon}</span>${text}` : text;
    b.addEventListener("click", () => {
      seg.querySelectorAll(".dwr-opt").forEach((x) => x.classList.remove("sel"));
      b.classList.add("sel");
      onChange(value);
    });
    seg.appendChild(b);
  }
  wrap.appendChild(seg);
  return wrap;
}
