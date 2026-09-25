// RTS minimap: the whole table in the corner, terrain, objectives, every rig
// (cyan / red, hollow once activated), and the camera's focus. Click to jump.
import { el } from "./dom.js";

export class Minimap {
  constructor(parent, world) {
    this.world = world;
    this.canvas = el("canvas", { class: "minimap", width: 216, height: 144, title: "Click to move the camera" });
    parent.append(this.canvas);
    this.canvas.addEventListener("click", (e) => {
      if (!this.field) return;
      const r = this.canvas.getBoundingClientRect();
      this.world.focus(((e.clientX - r.left) / r.width) * this.field.width, ((e.clientY - r.top) / r.height) * this.field.height);
    });
    this.tick = () => this.draw();
    world.tickers.add(this.tick);
  }

  // campaign (optional): publicState's state.campaign: exit zone + commander.
  set(field, objectives, rigs, activeId, campaign = null) { this.field = field; this.objectives = objectives || []; this.rigs = rigs || []; this.activeId = activeId; this.campaign = campaign; }

  draw() {
    const f = this.field; if (!f) return;
    const g = this.canvas.getContext("2d"); const W = this.canvas.width, H = this.canvas.height;
    const sx = W / f.width, sy = H / f.height;
    g.fillStyle = "#3a3226"; g.fillRect(0, 0, W, H);
    g.fillStyle = "#6b6356";
    for (const t of f.terrain || []) {
      g.save(); g.translate(t.x * sx, t.y * sy); g.rotate(((t.rot || 0) * Math.PI) / 180);
      if (t.shape === "rect") g.fillRect((-t.w / 2) * sx, (-t.h / 2) * sy, t.w * sx, t.h * sy);
      else if (t.shape === "ellipse") { g.beginPath(); g.ellipse(0, 0, t.rx * sx, t.ry * sy, 0, 0, 7); g.fill(); }
      else if (t.points) { g.beginPath(); t.points.forEach(([x, y], i) => (i ? g.lineTo(x * sx, y * sy) : g.moveTo(x * sx, y * sy))); g.fill(); }
      g.restore();
    }
    const ex = this.campaign?.exit;
    if (ex) {
      // Breakthrough exit: the zone around the enemy corner (the canvas clips it to a quarter).
      const pulse = 0.22 + 0.12 * Math.sin(performance.now() / 300);
      g.fillStyle = `rgba(79,255,200,${pulse})`; g.beginPath(); g.moveTo(ex.x * sx, ex.y * sy); g.arc(ex.x * sx, ex.y * sy, ex.r * sx, 0, 7); g.fill();
      g.strokeStyle = "#4fffc8"; g.lineWidth = 1.5; g.beginPath(); g.arc(ex.x * sx, ex.y * sy, ex.r * sx, 0, 7); g.stroke();
    }
    for (const o of this.objectives) {
      if (o.crate) { g.fillStyle = "#c98a3a"; g.strokeStyle = "#ffd35a"; g.lineWidth = 1; g.fillRect(o.x * sx - 3, o.y * sy - 3, 6, 6); g.strokeRect(o.x * sx - 3, o.y * sy - 3, 6, 6); continue; }
      g.strokeStyle = o.relay ? "#5fd3c0" : "#ffd35a"; g.lineWidth = 2; g.beginPath(); g.arc(o.x * sx, o.y * sy, 2 * sx, 0, 7); g.stroke();
    }
    // Live mech positions (animated) when the director has them.
    for (const r of this.rigs) {
      const m = this.world.mechRoots?.find((x) => x.userData.mechId === r.id);
      const x = m ? m.position.x : r.pos?.x, y = m ? m.position.z : r.pos?.y;
      if (x == null) continue;
      g.fillStyle = r.destroyed ? "#555" : r.owner === "a" ? "#5fd3c0" : "#e0533d";
      g.beginPath(); g.arc(x * sx, y * sy, 4, 0, 7);
      if (r.activated && !r.destroyed) { g.strokeStyle = g.fillStyle; g.lineWidth = 2; g.stroke(); } else g.fill();
      if (r.id === this.campaign?.commanderId && !r.destroyed) { g.strokeStyle = "#f0c05a"; g.lineWidth = 2; g.beginPath(); g.arc(x * sx, y * sy, 6, 0, 7); g.stroke(); }
      if (r.id === this.activeId) { g.strokeStyle = "#ffd35a"; g.lineWidth = 2; g.beginPath(); g.arc(x * sx, y * sy, 7, 0, 7); g.stroke(); }
    }
    const c = this.world.cam.target;
    g.strokeStyle = "rgba(255,255,255,.8)"; g.lineWidth = 1;
    const vw = this.world.cam.dist * 0.9 * sx, vh = this.world.cam.dist * 0.6 * sy;
    g.strokeRect(c.x * sx - vw / 2, c.z * sy - vh / 2, vw, vh);
  }

  destroy() { this.world.tickers.delete(this.tick); this.canvas.remove(); }
}
