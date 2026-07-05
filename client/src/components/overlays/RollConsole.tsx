import {
  useState,
  useRef,
  useEffect,
  useImperativeHandle,
  forwardRef,
} from "react";
import type { Resolution } from "../../state/types";

export interface DiceSpec {
  key: string;
  label: string;
  sides: number;
}

export interface RollConsoleHandle {
  playResolution: (entry: Resolution) => Promise<void>;
  promptDice: (specs: DiceSpec[], title?: string) => Promise<Record<string, number>>;
  closeRoll: () => void;
}

const OK_REVEAL_MS = 900;

const KIND_TONE: Record<string, string> = {
  overheat: "crit",
  attack: "crit",
  ram: "crit",
  destruction: "crit",
  blast: "crit",
  repair: "cool",
  initiative: "oil",
  perk: "crit",
  skip: "warn",
};

interface DieState {
  sides: number;
  value: number;
  label: string;
  settled: boolean;
  tone: string;
}

interface EffectState {
  text: string;
  delay: number;
}

const RollConsole = forwardRef<RollConsoleHandle>(function RollConsole(_props, ref) {
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const [hidden, setHidden] = useState(true);
  const [visible, setVisible] = useState(false);
  const [kind, setKind] = useState("Resolution");
  const [dice, setDice] = useState<DieState[]>([]);
  const [summary, setSummary] = useState("");
  const [effects, setEffects] = useState<EffectState[]>([]);
  const [formHidden, setFormHidden] = useState(true);
  const [formSpecs, setFormSpecs] = useState<DiceSpec[]>([]);
  const [okHidden, setOkHidden] = useState(true);

  const hideTimer = useRef<number | null>(null);
  const revealTimer = useRef<number | null>(null);
  const flickerTimer = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  // Live refs to each die element so the flicker can mutate text directly
  // (mirrors roll-dialog.js which sets die.textContent every 60ms).
  const dieEls = useRef<Array<HTMLDivElement | null>>([]);
  const inputEls = useRef<Array<HTMLInputElement | null>>([]);
  const resolveForm = useRef<((out: Record<string, number>) => void) | null>(null);

  const clearFlicker = () => {
    if (flickerTimer.current != null) {
      clearInterval(flickerTimer.current);
      flickerTimer.current = null;
    }
  };

  const hideOk = () => {
    if (revealTimer.current != null) {
      clearTimeout(revealTimer.current);
      revealTimer.current = null;
    }
    setOkHidden(true);
  };

  const open = () => {
    if (hideTimer.current != null) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    hideOk();
    setHidden(false);
    setVisible(false);
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => setVisible(true));
  };

  const closeRoll = () => {
    hideOk();
    clearFlicker();
    setVisible(false);
    if (hideTimer.current != null) clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setHidden(true), 220);
  };

  const showOkAfterDelay = () => {
    if (revealTimer.current != null) clearTimeout(revealTimer.current);
    revealTimer.current = window.setTimeout(
      () => setOkHidden(false),
      reduced ? 0 : OK_REVEAL_MS,
    );
  };

  const playResolution = (entry: Resolution): Promise<void> => {
    setKind((entry.kind || "resolution").toUpperCase());
    setSummary("");
    setEffects([]);
    setFormHidden(true);
    setFormSpecs([]);
    const tone = KIND_TONE[entry.kind ?? ""] || "oil";

    const rolls = (entry.rolls || []).filter((r) => r.sides);
    dieEls.current = [];
    const initial: DieState[] = rolls.map((roll) => ({
      sides: roll.sides,
      value: roll.value,
      label: roll.label || `D${roll.sides}`,
      settled: false,
      tone: "",
    }));
    setDice(initial);
    open();

    const finish = () => {
      setDice(
        rolls.map((roll) => ({
          sides: roll.sides,
          value: roll.value,
          label: roll.label || `D${roll.sides}`,
          settled: true,
          tone:
            tone === "cool"
              ? "cool"
              : roll.sides === 12 || tone === "crit"
                ? "crit"
                : "",
        })),
      );
      setSummary(entry.summary || "");
      setEffects(
        (entry.effects || []).map((text, i) => ({ text, delay: 0.5 + i * 0.12 })),
      );
      showOkAfterDelay();
    };

    if (reduced || rolls.length === 0) {
      finish();
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const started = performance.now();
      clearFlicker();
      flickerTimer.current = window.setInterval(() => {
        rolls.forEach((roll, i) => {
          const el = dieEls.current[i];
          if (el) el.textContent = String(Math.floor(Math.random() * roll.sides) + 1);
        });
        if (performance.now() - started > 650) {
          clearFlicker();
          finish();
          resolve();
        }
      }, 60);
    });
  };

  const promptDice = (
    specs: DiceSpec[],
    title = "Enter dice",
  ): Promise<Record<string, number>> => {
    setKind(title.toUpperCase());
    setDice([]);
    setSummary("");
    setEffects([]);
    inputEls.current = [];
    setFormSpecs(specs);
    setFormHidden(false);
    open();

    return new Promise((resolve) => {
      resolveForm.current = resolve;
    });
  };

  const onFormGo = () => {
    const out: Record<string, number> = {};
    for (let i = 0; i < formSpecs.length; i++) {
      const spec = formSpecs[i];
      const input = inputEls.current[i];
      const v = parseInt(input?.value ?? "", 10);
      if (!Number.isFinite(v) || v < 1 || v > spec.sides) {
        input?.focus();
        return;
      }
      out[spec.key] = v;
    }
    setFormHidden(true);
    closeRoll();
    resolveForm.current?.(out);
    resolveForm.current = null;
  };

  // Focus the first input once the form is rendered.
  useEffect(() => {
    if (!formHidden && formSpecs.length) {
      inputEls.current[0]?.focus();
    }
  }, [formHidden, formSpecs]);

  useEffect(() => {
    return () => {
      if (hideTimer.current != null) clearTimeout(hideTimer.current);
      if (revealTimer.current != null) clearTimeout(revealTimer.current);
      if (flickerTimer.current != null) clearInterval(flickerTimer.current);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  useImperativeHandle(ref, () => ({ playResolution, promptDice, closeRoll }));

  return (
    <div
      id="rollScrim"
      className={"roll-scrim" + (visible ? " show" : "")}
      hidden={hidden}
      onClick={(e) => {
        if (e.target === e.currentTarget) closeRoll();
      }}
    >
      <div
        id="rollConsole"
        className="roll-console"
        role="dialog"
        aria-modal="true"
        aria-label="Dice resolution"
      >
        <div className="roll-head">
          <span className="roll-kind" id="rollKind">
            {kind}
          </span>
          <button
            id="rollClose"
            className="roll-close"
            type="button"
            aria-label="Dismiss"
            onClick={closeRoll}
          >
            ✕
          </button>
        </div>
        <div id="rollDice" className="roll-dice">
          {dice.map((d, i) => (
            <div className="die-wrap" key={i}>
              <div
                className={
                  "die " +
                  (d.sides === 12 ? "d12" : "d6") +
                  (d.settled ? " settled" : " rolling")
                }
                data-tone={d.settled ? d.tone : undefined}
                ref={(el) => {
                  dieEls.current[i] = el;
                }}
              >
                {d.settled ? String(d.value) : "?"}
              </div>
              <span className="die-label">{d.label}</span>
            </div>
          ))}
        </div>
        <div id="rollSummary" className="roll-summary">
          {summary}
        </div>
        <div id="rollEffects" className="roll-effects">
          {effects.map((e, i) => (
            <div
              className="roll-effect"
              key={i}
              style={{ animationDelay: `${e.delay}s` }}
            >
              {e.text}
            </div>
          ))}
        </div>
        <div id="rollForm" className="roll-form" hidden={formHidden}>
          {formSpecs.map((spec, i) => (
            <div className="roll-form-row" key={i}>
              <label>{`${spec.label} (D${spec.sides})`}</label>
              <input
                type="number"
                min="1"
                max={String(spec.sides)}
                inputMode="numeric"
                ref={(el) => {
                  inputEls.current[i] = el;
                }}
              />
            </div>
          ))}
          {formSpecs.length ? (
            <button className="roll-form-go" type="button" onClick={onFormGo}>
              Confirm roll
            </button>
          ) : null}
        </div>
        <button id="rollOk" className="roll-ok" type="button" hidden={okHidden} onClick={closeRoll}>
          OK
        </button>
      </div>
    </div>
  );
});

export default RollConsole;
