import type { PrepType } from "../../state/types";
import "../styles/overlay.css";

const BASE_REACTIONS: { value: PrepType; icon: string; label: string; rule: string }[] = [
  { value: "brace", icon: "🛡️", label: "Brace for Incoming Fire",
    rule: "Front-arc attacks against this Rig take −2 to their Impact Rolls until next round." },
  { value: "evasive", icon: "💨", label: "Evasive Manoeuvre",
    rule: "Before the attack resolves, move up to ½ Speed. Break line of sight or range and the attack fails." },
  { value: "return", icon: "↩️", label: "Return Fire",
    rule: "After the enemy attacks, answer with one weapon against that enemy." },
];

const ANSWER_COUNTERS: { value: PrepType; icon: string; label: string; rule: string }[] = [
  { value: "riposte", icon: "⚔️", label: "Riposte",
    rule: "When an enemy melees this Rig, make one free melee attack back." },
  { value: "sidestep", icon: "🌀", label: "Sidestep the Shooter",
    rule: "When shot, slip ½ Speed before it resolves; if you reach the shooter you may engage it." },
  { value: "exploit", icon: "🎯", label: "Exploit Opening",
    rule: "When an overcommitted enemy attacks, pivot and land a free Aimed counter-shot — no aim penalty." },
];

const SHIELD_REACTION: { value: PrepType; icon: string; label: string; rule: string } = {
  value: "raise-shield", icon: "🛡", label: "Raise Shield",
  rule: "Negates the next front-arc attack; side/rear impacts take −4 (Tower Shield also negates the side).",
};

// Exported for call sites / tests that need the base list.
export const REACTIONS = BASE_REACTIONS;

interface Props {
  value: PrepType;
  onChange: (v: PrepType) => void;
  allowShield?: boolean; // true when the acting Rig carries a Bulwark Shield
  answerMode?: boolean;  // true in the Answer-token gate — unlocks the three counters
  // When set, the confirm control renders inline as an expansion beneath the
  // selected reaction (instead of a footer button on the drawer).
  onConfirm?: () => void;
  confirmLabel?: string;
  confirmIcon?: string;
}

// Native V2 port of V1's ReactionPicker. The shared reaction chooser used by both
// the Answer-token gate and the Prepare action. Presentational only — parents own
// the send. Retagged with `v2-rx-*` classes so the V2 stylesheet owns it.
// The three Answer counters (Riposte / Sidestep / Exploit Opening) are
// Answer-exclusive and only render when `answerMode` is set.
export default function ReactionPicker({
  value, onChange, allowShield = false, answerMode = false,
  onConfirm, confirmLabel = "Set reaction", confirmIcon,
}: Props) {
  const options = [
    ...BASE_REACTIONS,
    ...(answerMode ? ANSWER_COUNTERS : []),
    ...(allowShield ? [SHIELD_REACTION] : []),
  ];
  return (
    <div className="v2-rx-picker">
      {options.map((r) => {
        const selected = r.value === value;
        return (
          <div key={r.value} className={"v2-rx-item" + (selected ? " is-open" : "")}>
            <button
              type="button"
              className={"v2-rx-choice" + (selected ? " is-sel" : "")}
              onClick={() => onChange(r.value)}
            >
              <span className="v2-rx-choice-ic" aria-hidden="true">{r.icon}</span>
              <span className="v2-rx-choice-body">
                <span className="v2-rx-choice-label">{r.label}</span>
                <span className="v2-rx-choice-rule">{r.rule}</span>
              </span>
            </button>
            {selected && onConfirm ? (
              <div className="v2-rx-confirm">
                <button type="button" className="v2-rx-confirm-btn" onClick={onConfirm}>
                  {confirmIcon ? (
                    <span className="v2-rx-confirm-ic" aria-hidden="true">{confirmIcon}</span>
                  ) : null}
                  <span>{confirmLabel}</span>
                </button>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
