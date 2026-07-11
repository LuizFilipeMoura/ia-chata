import "../styles/overlay.css";

export type ChoiceOption = { value: string; label: string; icon?: string } | string;

interface ChoiceFieldProps {
  label: string;
  icon?: string;
  options: ChoiceOption[];
  value: string;
  onChange: (v: string) => void;
}

// Native V2 port of V1's ChoiceField — a segmented option row. Retagged with
// `v2-dwr-*` classes so the V2 overlay stylesheet owns it.
export default function ChoiceField({ label, icon, options, value, onChange }: ChoiceFieldProps) {
  return (
    <div className="v2-dwr-field">
      <label>
        {icon ? <span className="v2-dwr-field-ic">{icon}</span> : null}
        {label}
      </label>
      <div className="v2-dwr-seg">
        {options.map((opt, i) => {
          const optValue = typeof opt === "object" ? opt.value : opt;
          const text = typeof opt === "object" ? opt.label : opt;
          const optIcon = typeof opt === "object" ? opt.icon : undefined;
          return (
            <button
              key={i}
              type="button"
              className={"v2-dwr-opt" + (optValue === value ? " sel" : "")}
              onClick={() => onChange(optValue)}
            >
              {optIcon ? <span className="v2-dwr-opt-ic">{optIcon}</span> : null}
              {text}
            </button>
          );
        })}
      </div>
    </div>
  );
}
