import { actionBudget } from "/shared/battle-view.js";
import type { GameState, Rig } from "../state/types";

export type FocusCtaKind = "commission" | "ready" | "initiative" | "blast" | "score" | "endTurn";

export interface Focus {
  tone: string;
  icon: string;
  primary: string;
  secondary?: string;
  cta?: { label: string; kind: FocusCtaKind };
}

const MIN_RIGS_TO_READY = 3;

// Single source of truth for guidance copy (mirrors battle.js:200-266). Pure:
// all state comes in via `game`, `rigs`, `mySide`. CTAs carry a `kind` string
// instead of an inline handler so the caller can bind behaviour.
export function computeFocus(
  game: GameState | null | undefined,
  rigs: Rig[],
  mySide: string,
): Focus | null {
  if (!game) return null;
  const g = game;
  const mine = mySide;
  const enemy = mine === "a" ? "b" : "a";

  const sideNameOf = (id: string | null | undefined) =>
    g.sides?.find((s) => s.id === id)?.name || (id === "a" ? "Side A" : "Side B");
  const sideReadyOf = (id: string) => Boolean(g.sides?.find((s) => s.id === id)?.ready);
  const rigCountOf = (id: string) => rigs.filter((r) => (r.owner || "a") === id).length;

  // ---- Pre-battle setup ----
  if (!g.started) {
    const myCount = rigCountOf(mine);
    if (myCount === 0) {
      return {
        tone: "guide", icon: "◈", primary: "Commission your first Rig",
        secondary: "Every squadron needs at least one.",
        cta: { label: "Commission", kind: "commission" },
      };
    }
    if (myCount < MIN_RIGS_TO_READY) {
      const need = MIN_RIGS_TO_READY - myCount;
      return {
        tone: "guide", icon: "◈", primary: `Commission ${need} more Rig${need === 1 ? "" : "s"}`,
        secondary: `${myCount} of ${MIN_RIGS_TO_READY} ready to deploy.`,
        cta: { label: "Commission", kind: "commission" },
      };
    }
    if (!sideReadyOf(mine)) {
      return {
        tone: "guide", icon: "✔", primary: "Mark ready when set",
        secondary: "Tap Ready once your squadron is built.",
        cta: { label: "Ready", kind: "ready" },
      };
    }
    return { tone: "wait", icon: "⏳", primary: `Waiting for ${sideNameOf(enemy)} to ready…` };
  }

  // ---- In battle ----
  if (g.phase === "finished") return null;

  if (g.phase === "initiative" && g.round >= 2) {
    return {
      tone: "act", icon: "🎲", primary: "Roll initiative",
      secondary: `Round ${g.round} — decide who moves first.`,
      cta: { label: "Roll", kind: "initiative" },
    };
  }

  if (g.pendingBlast) {
    return {
      tone: "act", icon: "💥", primary: "Resolve blast",
      secondary: 'Mark rigs within 12".',
      cta: { label: "Resolve", kind: "blast" },
    };
  }

  if (g.phase === "recovery") {
    const conflict = g.recoveryConflict && g.recoveryConflict.length ? g.recoveryConflict : null;
    const submitted = Array.isArray(g.recoveryClaims?.[mine]);
    if (conflict) {
      return {
        tone: "act", icon: "⚠️", primary: "Objectives disputed",
        secondary: "You both claimed the same marker — re-check who holds it.",
        cta: { label: "Re-check", kind: "score" },
      };
    }
    if (submitted) {
      return { tone: "wait", icon: "⏳", primary: "Waiting for opponent to score…" };
    }
    return {
      tone: "act", icon: "⟡", primary: "Score your objectives",
      secondary: "Mark which markers you control.",
      cta: { label: "Score VP", kind: "score" },
    };
  }

  if (g.phase === "activation") {
    const turn = g.turn;
    if (turn?.side !== mine) {
      return { tone: "wait", icon: "⏳", primary: `Waiting on ${sideNameOf(turn?.side)}…` };
    }
    if (turn.activeRigId) {
      const rig = rigs.find((r) => r.id === turn.activeRigId);
      const b = rig ? actionBudget(rig, turn) : null;
      if (rig && b && b.left === 0) {
        return {
          tone: "act", icon: "✔", primary: `End ${rig.name}'s turn`,
          secondary: "No actions left — pass to the next Rig.",
          cta: { label: "End turn", kind: "endTurn" },
        };
      }
      return {
        tone: "act", icon: "▶", primary: "Choose your next action",
        secondary: b ? `${b.left} action${b.left === 1 ? "" : "s"} left · Fire, Move or Reload` : "",
      };
    }
    return {
      tone: "act", icon: "▶", primary: "Activate one of your Rigs",
      secondary: "Tap a Rig to take its turn.",
    };
  }
  return null;
}
