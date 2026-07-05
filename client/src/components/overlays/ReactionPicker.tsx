import type { PrepType } from "../../state/types";

export const REACTIONS: { value: PrepType; icon: string; label: string; rule: string }[] = [
  { value: "brace", icon: "🛡️", label: "Brace for Incoming Fire",
    rule: "Front-arc attacks against this Rig take −2 to their Impact Rolls until next round." },
  { value: "evasive", icon: "💨", label: "Evasive Manoeuvre",
    rule: "Before the attack resolves, move up to ½ Speed. Break line of sight or range and the attack fails." },
  { value: "return", icon: "↩️", label: "Return Fire",
    rule: "After the enemy attacks, answer with one weapon against that enemy." },
];

interface Props {
  value: PrepType;
  onChange: (v: PrepType) => void;
}

// The shared reaction chooser used by both the Answer-token gate and the
// Prepare action. Presentational only — parents own the send.
export default function ReactionPicker({ value, onChange }: Props) {
  return (
    <div className="rx-picker">
      {REACTIONS.map((r) => (
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
