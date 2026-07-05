export type ChoiceOption = { value: string; label: string; icon?: string } | string;

interface ChoiceFieldProps {
  label: string;
  icon?: string;
  options: ChoiceOption[];
  value: string;
  onChange: (v: string) => void;
}

export default function ChoiceField({ label, icon, options, value, onChange }: ChoiceFieldProps) {
  return (
    <div className="dwr-field">
      <label>
        {icon ? <span className="dwr-field-ic">{icon}</span> : null}
        {label}
      </label>
      <div className="dwr-seg">
        {options.map((opt, i) => {
          const optValue = typeof opt === "object" ? opt.value : opt;
          const text = typeof opt === "object" ? opt.label : opt;
          const optIcon = typeof opt === "object" ? opt.icon : undefined;
          return (
            <button
              key={i}
              type="button"
              className={"dwr-opt" + (optValue === value ? " sel" : "")}
              onClick={() => onChange(optValue)}
            >
              {optIcon ? <span className="dwr-opt-ic">{optIcon}</span> : null}
              {text}
            </button>
          );
        })}
      </div>
    </div>
  );
}
