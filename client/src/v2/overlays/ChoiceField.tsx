import "../styles/overlay.css";

export type ChoiceOption = { value: string; label: string; icon?: string } | string;

interface ChoiceFieldProps {
  label: string;
  icon?: string;
  options: ChoiceOption[];
  value: string;
  onChange: (v: string) => void;
}

// Native V2 port of V1's ChoiceField — a segmented option row. Built on the
// shared `.v2-field`/`.v2-field-seg`/`.v2-opt` primitives (primitives.css), so
// the V2 overlay stylesheet only carries this field's unique padding/typography.
export default function ChoiceField({ label, icon, options, value, onChange }: ChoiceFieldProps) {
  return (
    <div className="v2-field">
      <label className="v2-eyebrow">
        {icon ? <span className="v2-field-ic">{icon}</span> : null}
        {label}
      </label>
      <div className="v2-field-seg">
        {options.map((opt, i) => {
          const optValue = typeof opt === "object" ? opt.value : opt;
          const text = typeof opt === "object" ? opt.label : opt;
          const optIcon = typeof opt === "object" ? opt.icon : undefined;
          return (
            <button
              key={i}
              type="button"
              className={"v2-opt" + (optValue === value ? " is-sel" : "")}
              onClick={() => onChange(optValue)}
            >
              {optIcon ? <span className="v2-opt-ic">{optIcon}</span> : null}
              {text}
            </button>
          );
        })}
      </div>
    </div>
  );
}
