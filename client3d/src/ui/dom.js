// Minimal DOM helpers, the HUD is plain DOM over the canvas.
export function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") e.className = v;
    else if (k === "style" && typeof v === "object") Object.assign(e.style, v);
    else if (k.startsWith("on")) e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "html") e.innerHTML = v;
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids.flat(Infinity)) if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(String(k)));
  return e;
}

export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }

// Replace a node's children, flattening arrays and dropping null/false (native
// append would stringify them).
export function fill(node, ...kids) {
  clear(node);
  for (const k of kids.flat(Infinity)) if (k != null && k !== false) node.append(k.nodeType ? k : String(k));
  return node;
}

export function toast(msg, tone = "info", ms = 2600) {
  let host = document.getElementById("toasts");
  if (!host) { host = el("div", { id: "toasts" }); document.body.append(host); }
  const t = el("div", { class: `toast ${tone}` }, msg);
  host.append(t);
  setTimeout(() => t.classList.add("out"), ms);
  setTimeout(() => t.remove(), ms + 400);
}

export function modal({ title, body, actions = [], dismissable = true, cls = "" }) {
  const back = el("div", { class: "modal-back" });
  const close = () => back.remove();
  const box = el("div", { class: `modal ${cls}` },
    title ? el("h2", {}, title) : null,
    body,
    actions.length ? el("div", { class: "modal-actions" }, actions.map((a) => el("button", {
      class: `btn ${a.primary ? "primary" : ""} ${a.ghost ? "ghost" : ""}`, disabled: a.disabled,
      onClick: () => { if (a.keepOpen !== true) close(); a.onClick?.(); },
    }, a.label))) : null);
  back.append(box);
  if (dismissable) back.addEventListener("click", (e) => { if (e.target === back) close(); });
  document.body.append(back);
  return { close, box };
}
