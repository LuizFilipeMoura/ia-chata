import { useState, useRef, useLayoutEffect, useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { availableActions, actionBudget } from "/shared/battle-view.js";
import { UNIT_KINDS, kindOf } from "/shared/unit-kinds.js";
import { HEAT_CAPACITY } from "/shared/game-state.js";
import { useRoomState } from "../../state/RoomStateContext";
import { useV2Commands } from "../hooks/useV2Commands";
import { useV2BattleActions } from "../state/V2BattleActionsContext";
import { useV2Wizard } from "../state/V2WizardContext";
import type { AttackMode } from "../overlays/AttackWizard";
import type { Rig } from "../../state/types";

interface Props {
  rig: Rig;
}

interface Action {
  key: string;
  label: string;
  heat: number;
  enabled: boolean;
  cost: number;
  note: string;
}

// Three tactile groups collapse the full action list into one row (exactly as
// V1's ActionConsole). Each button opens a popover of its enabled sub-actions
// (unless only one, which fires straight through). `tone` picks the V2 accent
// (ember for Attack, gunmetal for Move/Support); `glyph` is the tile's stencil
// mark, echoing the design-reference console (▶ fire / ⇢ move / ⚙ support).
//
// Disengage lives in the Move group on purpose: a rig locked in melee can't Move
// until it Disengages, so the two occupy the same slot interchangeably — when
// engaged only Disengage is live (and the tile relabels to it); otherwise it's
// hidden (see HIDE_WHEN_DISABLED) so Move/Sprint own the slot cleanly.
const GROUPS: { id: string; label: string; tone: string; glyph: string; keys: string[] }[] = [
  { id: "attack", label: "Attack", tone: "ember", glyph: "▶", keys: ["fire", "aimed"] },
  { id: "move", label: "Move", tone: "steel", glyph: "⇢", keys: ["move", "sprint", "disengage"] },
  { id: "support", label: "Support", tone: "steel", glyph: "⚙", keys: [] }, // catch-all
];

// When a group collapses to a single live action, the tile borrows that action's
// mark so its face matches what tapping it actually fires (Move → Disengage).
const ACTION_GLYPH: Record<string, string> = {
  move: "⇢", sprint: "⇉", disengage: "⇲", fire: "▶", aimed: "◎",
  fieldweld: "🔧", vent: "❄️", paint: "🎯",
};

const heatText = (heat: number) =>
  heat > 0 ? `+${heat} heat` : heat < 0 ? `${heat} heat` : "free";
// Sign bucket drives the heat chip's colour (cost vs cooling vs free).
const heatBucket = (heat: number) => (heat > 0 ? "pos" : heat < 0 ? "neg" : "zero");

// The popover is portaled to <body> so it escapes the rig terminal's overflow.
// Its contents are wrapped in `.v2-root` so the scoped V2 styles apply even
// though it mounts outside the app's root. Position is measured off the anchor
// button, opening above it and clamped to the viewport (mirrors V1). It reads as
// a stamped iron selector module: a tone-keyed header strip, a downward pointer
// aimed back at the tile, and rows that stagger in once placed. `tone`/`title`
// tie it to the group that spawned it (ember Attack vs steel Move/Support).
function AcPopover({
  anchor,
  tone,
  title,
  onClose,
  children,
}: {
  anchor: HTMLElement | null;
  tone: string;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; arrow: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !anchor) return;
    const place = () => {
      const r = anchor.getBoundingClientRect();
      const margin = 8;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      let left = r.left + r.width / 2 - w / 2;
      left = Math.max(margin, Math.min(left, window.innerWidth - w - margin));
      const top = Math.max(margin, r.top - h - 8);
      const arrow = Math.max(14, Math.min(r.left + r.width / 2 - left, w - 14));
      setPos({ left, top, arrow });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchor]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    // `v2-portal` keeps the scoped-token context (--v2-* + `.v2-root …` selectors)
    // WITHOUT the full-screen shell box: tokens.css makes a bare `.v2-root` a
    // fixed, opaque, inset:0 layer — fine for full overlays, but on this small
    // floating popover it would black out the whole app behind it.
    <div className="v2-root v2-portal">
      <div className="v2-ac-pop-scrim" onClick={onClose} />
      <div
        className={"v2-ac-pop" + (pos ? " is-placed" : "")}
        data-tone={tone}
        role="menu"
        ref={ref}
        style={
          pos
            ? { left: pos.left, top: pos.top, ["--arrow-x" as string]: `${pos.arrow}px` }
            : { visibility: "hidden" }
        }
      >
        <div className="v2-ac-pop-head">
          <span className="v2-ac-pop-head-tick" aria-hidden="true" />
          <span className="v2-ac-pop-head-text v2-title">{title}</span>
          <span className="v2-ac-pop-head-sub v2-eyebrow">select</span>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

// The V2 action console injected into the active rig's terminal. Port of V1's
// ActionConsole with plain V2 buttons in place of the PNG-asset IronActionTile.
export function ActionConsole({ rig }: Props) {
  const { game } = useRoomState();
  const sendCommand = useV2Commands();
  const { openMove, openRepair, endActivation, openPrepare, openSupport } = useV2BattleActions();
  const { openAttack } = useV2Wizard();
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const cellRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const t = game?.turn;
  // Render nothing unless this rig is the active one in the activation phase.
  if (!t || t.activeRigId !== rig.id || game?.phase !== "activation") {
    return <div className="v2-ac" />;
  }

  const onAction = (r: Rig, key: string) => {
    setOpenGroup(null);
    if (key === "fire" || key === "aimed" || key === "lock") {
      openAttack(r, key as AttackMode);
      return;
    }
    if (key === "move" || key === "sprint") {
      openMove(r, key);
      return;
    }
    if (key === "repair") {
      openRepair(r, "repair");
      return;
    }
    if (key === "emergencypatch") {
      openRepair(r, "emergencypatch");
      return;
    }
    if (key === "prepare") {
      openPrepare(r);
      return;
    }
    if (key === "paint" || key === "fieldweld" || key === "vent") {
      openSupport(r, key);
      return;
    }
    sendCommand("action", { name: r.name, action: key });
  };

  const b = actionBudget(rig, t);
  const actions = availableActions(rig, t, game?.round) as Action[];
  // Cold kinds (Tank / Walker) don't track heat — suppress per-action heat tags.
  const cold = !UNIT_KINDS[kindOf(rig)].hasHeat;
  // Overheated (heat past capacity) — Shut Down is worth flagging, not forcing.
  const hot = !cold && rig.engine.heat > (HEAT_CAPACITY[rig.weightClass] ?? 5);

  const claimed = new Set(GROUPS.flatMap((g) => g.keys));
  // Disengage and Douse are situational: they only apply when engaged / on fire.
  // Rather than greying them as a "why you can't" cue, drop them entirely when
  // disabled so the console shows only actions that are actually live.
  const HIDE_WHEN_DISABLED = new Set(["disengage", "douse"]);
  // Shut Down is promoted to the full-width button below the grid, so drop it
  // from the Support catch-all to avoid offering it twice.
  const childrenFor = (g: (typeof GROUPS)[number]) =>
    (g.id === "support"
      ? actions.filter((a) => !claimed.has(a.key) && a.key !== "shutdown")
      : g.id === "attack"
        // Aimed is now a toggle inside the Fire drawer, not its own tile — so the
        // Attack group collapses to a lone Fire action. `aimed` stays in the group's
        // keys (claimed above) so it never leaks into the Support catch-all.
        ? actions.filter((a) => a.key === "fire")
        // Sprint isn't its own tile anymore — the drag overlay's outer ring reaches
        // sprint range, so the Move tile arms the drag session. But when an equipment
        // makes Sprint cost ≤ Move, battle-view drops `move` from the action list
        // (Sprint-heat-floor) and expects the tile to solo on Sprint — so only strip
        // Sprint while a live Move is present. `sprint` stays in GROUPS keys (claimed)
        // so it never leaks into the Support catch-all either way.
        : actions.filter(
            (a) =>
              g.keys.includes(a.key) &&
              !(a.key === "sprint" && actions.some((m) => m.key === "move" && m.enabled)),
          )
    ).filter((a) => a.enabled || !HIDE_WHEN_DISABLED.has(a.key));

  // Surface the "why" behind constrained actions as inline hints, deduplicated.
  const notes = [...new Set(actions.map((a) => a.note).filter(Boolean))] as string[];

  return (
    <div className="v2-ac">
      <div className="v2-ac-head">
        <span className="v2-ac-lamp" aria-hidden="true" />
        <div className="v2-ac-head-text">
          <span className="v2-ac-title">Choose an Action</span>
          <span className="v2-ac-budget-line">
            {b.left}/{b.max} actions left
            {b.reduced ? <span className="v2-ac-reduced"> · Hull damage −2</span> : null}
          </span>
        </div>
        <div
          className="v2-ac-pips"
          role="img"
          aria-label={`${b.left} of ${b.max} actions remaining`}
        >
          {Array.from({ length: Math.max(3, b.max) }, (_, i) => (
            <span
              key={i}
              className={"v2-ac-pip" + (i < b.used ? " spent" : i >= b.max ? " locked" : "")}
            />
          ))}
        </div>
      </div>

      <div className="v2-ac-grid v2-grid-3">
        {GROUPS.map((g) => {
          const kids = childrenFor(g);
          if (kids.length === 0) return null;
          const enabledKids = kids.filter((a) => a.enabled);
          const groupEnabled = enabledKids.length > 0;
          const open = openGroup === g.id;
          // Collapsed to one live action → the tile wears that action's face so
          // its label matches the straight-through fire (Move ⇢ becomes Disengage ⇲).
          // Shut Down never solos: it's always live (0-slot), so once the budget is
          // spent it would be the lone Support survivor and hijack the tile, reading
          // as an obligatory shutdown. Keep it a menu choice instead.
          const solo =
            enabledKids.length === 1 && enabledKids[0].key !== "shutdown"
              ? enabledKids[0]
              : null;
          const opensMenu = groupEnabled && !solo;
          // Flag (don't force) Shut Down: warm the Support tile when overheated.
          const hotTile = hot && g.id === "support";
          const tileGlyph = solo ? ACTION_GLYPH[solo.key] ?? g.glyph : g.glyph;
          const tileLabel = solo ? solo.label : g.label;

          const onGroup = () => {
            if (!groupEnabled) return;
            if (solo) onAction(rig, solo.key);
            else setOpenGroup(open ? null : g.id);
          };

          return (
            <div className="v2-ac-cell" key={g.id}>
              <button
                type="button"
                className={"v2-ac-tile" + (open ? " is-open" : "") + (hotTile ? " is-hot" : "")}
                data-tone={g.tone}
                disabled={!groupEnabled}
                aria-haspopup={opensMenu || undefined}
                aria-expanded={opensMenu ? open : undefined}
                onClick={onGroup}
                ref={(el) => (cellRefs.current[g.id] = el)}
              >
                <span className="v2-ac-tile-glyph" aria-hidden="true">{tileGlyph}</span>
                <span className="v2-ac-tile-label">{tileLabel}</span>
                {opensMenu && <span className="v2-ac-tile-caret" aria-hidden="true">▾</span>}
              </button>

              {open && (
                <AcPopover
                  anchor={cellRefs.current[g.id]}
                  tone={g.tone}
                  title={g.label}
                  onClose={() => setOpenGroup(null)}
                >
                  {kids.map((a, i) => (
                    <button
                      key={a.key}
                      type="button"
                      role="menuitem"
                      className={"v2-ac-pop-row" + (hot && a.key === "shutdown" ? " is-hot" : "")}
                      style={{ ["--i" as string]: i }}
                      disabled={!a.enabled}
                      onClick={() => onAction(rig, a.key)}
                    >
                      <span className="v2-ac-pop-main">
                        <span className="v2-ac-pop-label">{a.label}</span>
                        {a.note ? (
                          <span className="v2-ac-pop-note">{a.note}</span>
                        ) : hot && a.key === "shutdown" ? (
                          <span className="v2-ac-pop-note">Cools 2 per slot left (max 5) — ends activation</span>
                        ) : null}
                      </span>
                      {!cold && (
                        <span className="v2-ac-pop-heat" data-heat={heatBucket(a.heat)}>
                          {heatText(a.heat)}
                        </span>
                      )}
                    </button>
                  ))}
                </AcPopover>
              )}
            </div>
          );
        })}
      </div>

      {notes.slice(0, 2).map((note, i) => (
        <p
          key={i}
          className={"v2-ac-hint" + (/spent|no\s|already|can'?t|locked/i.test(note) ? " is-warn" : "")}
        >
          {note}
        </p>
      ))}

      {/* The full-width control ends the activation. A heat unit ends it as a
          Shut Down (cools 2 per unspent slot, max 5); a cold unit (Tank/Walker)
          has no Shut Down, so it ends plainly. When the budget runs out the
          activation auto-ends (useV2BattleWatchers), so this is the early-out. */}
      {!cold ? (
        <button className="v2-ac-shutdown" type="button" onClick={() => onAction(rig, "shutdown")}>
          <span className="v2-ac-shutdown-glyph" aria-hidden="true">⏻</span>
          <span className="v2-ac-shutdown-text">
            <span className="v2-ac-shutdown-label">Shut Down</span>
            <span className="v2-ac-shutdown-note">
              {b.left > 0
                ? `Cools ${Math.min(5, 2 * b.left)} heat · ends activation`
                : "Ends activation"}
            </span>
          </span>
        </button>
      ) : (
        <button className="v2-ac-shutdown" type="button" onClick={() => endActivation(rig)}>
          <span className="v2-ac-shutdown-glyph" aria-hidden="true">⏻</span>
          <span className="v2-ac-shutdown-text">
            <span className="v2-ac-shutdown-label">End Turn</span>
            <span className="v2-ac-shutdown-note">Ends {rig.name}&apos;s activation</span>
          </span>
        </button>
      )}
    </div>
  );
}
