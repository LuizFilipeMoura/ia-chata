import type { PrepType } from "../../state/types";

const BASE_REACTIONS: { value: PrepType; icon: string; label: string; rule: string }[] = [
  { value: "brace", icon: "🛡️", label: "Brace for Incoming Fire",
    rule: "Front-arc attacks against this Rig take −2 Penetration on their Wound Rolls until next round." },
  { value: "evasive", icon: "💨", label: "Evasive Manoeuvre",
    rule: "Before the attack resolves, move up to ½ Speed. Break line of sight or range and the attack fails." },
  { value: "return", icon: "↩️", label: "Return Fire",
    rule: "After the enemy attacks, answer with one weapon against that enemy." },
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
}

// The shared reaction chooser used by both the Answer-token gate and the
// Prepare action. Presentational only — parents own the send.
export default function ReactionPicker({ value, onChange, allowShield = false }: Props) {
  const options = allowShield ? [...BASE_REACTIONS, SHIELD_REACTION] : BASE_REACTIONS;
  return (
    <div className="rx-picker">
      {options.map((r) => (
        <button
          key={r.value}
          type="button"
          className={"rx-choice" + (r.value === value ? " sel" : "")}
          onClick={() => onChange(r.value)}
        >
          <span className="rx-choice-ic" aria-hidden="true">{r.icon}</span>
          <span className="rx-choice-body">
            <span className="rx-choice-label">{r.label}</span>
            <span className="rx-choice-rule">{r.rule}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
