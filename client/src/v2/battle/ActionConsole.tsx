import { useState, useRef, useLayoutEffect, useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { availableActions, actionBudget } from "/shared/battle-view.js";
import { UNIT_KINDS, kindOf } from "/shared/unit-kinds.js";
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
// (ember for Attack, gunmetal for Move/Support).
const GROUPS: { id: string; label: string; tone: string; keys: string[] }[] = [
  { id: "attack", label: "Attack", tone: "ember", keys: ["fire", "aimed", "reload"] },
  { id: "move", label: "Move", tone: "steel", keys: ["move", "sprint"] },
  { id: "support", label: "Support", tone: "steel", keys: [] }, // catch-all
];

const heatText = (heat: number) =>
  heat > 0 ? `+${heat} heat` : heat < 0 ? `${heat} heat` : "free";

// The popover is portaled to <body> so it escapes the rig terminal's overflow.
// Its contents are wrapped in `.v2-root` so the scoped V2 styles apply even
// though it mounts outside the app's root. Position is measured off the anchor
// button, opening above it and clamped to the viewport (mirrors V1).
function AcPopover({
  anchor,
  onClose,
  children,
}: {
  anchor: HTMLElement | null;
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
    <div className="v2-root">
      <div className="v2-ac-pop-scrim" onClick={onClose} />
      <div
        className="v2-ac-pop"
        role="menu"
        ref={ref}
        style={
          pos
            ? { left: pos.left, top: pos.top, ["--arrow-x" as string]: `${pos.arrow}px` }
            : { visibility: "hidden" }
        }
      >
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
  const { openMove, openRepair, endActivation, openPrepare } = useV2BattleActions();
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
    sendCommand("action", { name: r.name, action: key });
  };

  const b = actionBudget(rig, t);
  const actions = availableActions(rig, t, game?.round) as Action[];
  // Cold kinds (Tank / Walker) don't track heat — suppress per-action heat tags.
  const cold = !UNIT_KINDS[kindOf(rig)].hasHeat;

  const claimed = new Set(GROUPS.flatMap((g) => g.keys));
  const childrenFor = (g: (typeof GROUPS)[number]) =>
    g.id === "support"
      ? actions.filter((a) => !claimed.has(a.key))
      : actions.filter((a) => g.keys.includes(a.key));

  // Surface the "why" behind constrained actions as inline hints, deduplicated.
  const notes = [...new Set(actions.map((a) => a.note).filter(Boolean))] as string[];

  return (
    <div className="v2-ac">
      <div className="v2-ac-budget">
        <span className="v2-ac-budget-label">
          Actions {b.left}/{b.max}
          {b.reduced ? (
            <>
              {" · "}
              <span className="v2-ac-reduced">Hull damage −2</span>
            </>
          ) : null}
        </span>
        <div className="v2-ac-pips">
          {Array.from({ length: Math.max(3, b.max) }, (_, i) => (
            <span
              key={i}
              className={"v2-ac-pip" + (i < b.used ? " spent" : i >= b.max ? " locked" : "")}
            />
          ))}
        </div>
      </div>

      <div className="v2-ac-grid">
        {GROUPS.map((g) => {
          const kids = childrenFor(g);
          if (kids.length === 0) return null;
          const enabledKids = kids.filter((a) => a.enabled);
          const groupEnabled = enabledKids.length > 0;
          const open = openGroup === g.id;

          const onGroup = () => {
            if (!groupEnabled) return;
            if (enabledKids.length === 1) onAction(rig, enabledKids[0].key);
            else setOpenGroup(open ? null : g.id);
          };

          return (
            <div className="v2-ac-cell" key={g.id}>
              <button
                type="button"
                className={"v2-ac-tile" + (open ? " is-open" : "")}
                data-tone={g.tone}
                disabled={!groupEnabled}
                aria-haspopup={enabledKids.length > 1 || undefined}
                aria-expanded={enabledKids.length > 1 ? open : undefined}
                onClick={onGroup}
                ref={(el) => (cellRefs.current[g.id] = el)}
              >
                {g.tone === "ember" && <span className="v2-ac-tile-lamp" aria-hidden="true" />}
                <span className="v2-ac-tile-label">{g.label}</span>
                {enabledKids.length > 1 && <span className="v2-ac-tile-caret" aria-hidden="true">▾</span>}
              </button>

              {open && (
                <AcPopover anchor={cellRefs.current[g.id]} onClose={() => setOpenGroup(null)}>
                  {kids.map((a) => (
                    <button
                      key={a.key}
                      type="button"
                      role="menuitem"
                      className="v2-ac-pop-row"
                      disabled={!a.enabled}
                      title={a.note || undefined}
                      onClick={() => onAction(rig, a.key)}
                    >
                      <span className="v2-ac-pop-label">{a.label}</span>
                      {!cold && (
                        <span className="v2-ac-pop-heat" data-heat={a.heat}>{heatText(a.heat)}</span>
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

      <button className="v2-ac-end" type="button" onClick={() => endActivation(rig)}>
        End {rig.name}&apos;s turn
      </button>
    </div>
  );
}
