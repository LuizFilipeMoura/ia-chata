import {
  useState,
  useRef,
  useEffect,
  useImperativeHandle,
  forwardRef,
  type CSSProperties,
} from "react";
import type { Resolution, ResolutionBreakdown } from "../../state/types";

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

interface DieState {
  sides: number;
  value: number;
  label: string;
  settled: boolean;
  tone: string;
}

const rollTone = (roll: { sides: number; tone?: string }): string =>
  roll.tone || (roll.sides === 12 ? "cool" : "");

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
  // Raw entry.kind (lowercased) drives per-kind theming — the ember "engine
  // misfire" treatment on `overheat`, and `sev` escalates its klaxon.
  const [kindId, setKindId] = useState("");
  const [sev, setSev] = useState("");
  // The full-screen destruction cinematic — set when a rig is destroyed.
  const [kaboom, setKaboom] = useState<{ name: string; exploded: boolean } | null>(null);
  const [dice, setDice] = useState<DieState[]>([]);
  const [summary, setSummary] = useState("");
  const [breakdown, setBreakdown] = useState<ResolutionBreakdown | null>(null);
  const [effects, setEffects] = useState<EffectState[]>([]);
  const [reveal, setReveal] = useState<{ prep: string; icon: string; label: string } | null>(null);
  const [formHidden, setFormHidden] = useState(true);
  const [formSpecs, setFormSpecs] = useState<DiceSpec[]>([]);
  const [okHidden, setOkHidden] = useState(true);

  const hideTimer = useRef<number | null>(null);
  const revealTimer = useRef<number | null>(null);
  const flickerTimer = useRef<number | null>(null);
  const kaboomTimer = useRef<number | null>(null);
  const resolveKaboom = useRef<(() => void) | null>(null);
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

  // ── Destruction cinematic ────────────────────────────────────────────────
  const dismissKaboom = () => {
    if (kaboomTimer.current != null) {
      clearTimeout(kaboomTimer.current);
      kaboomTimer.current = null;
    }
    setKaboom(null);
    const done = resolveKaboom.current;
    resolveKaboom.current = null;
    done?.();
  };

  const playKaboom = (name: string, exploded: boolean): Promise<void> => {
    // Clear the dice console out of the way — the explosion owns the screen.
    clearFlicker();
    closeRoll();
    setKaboom({ name, exploded });
    return new Promise((resolve) => {
      resolveKaboom.current = resolve;
      const dwell = reduced ? 900 : exploded ? 2800 : 2100;
      if (kaboomTimer.current != null) clearTimeout(kaboomTimer.current);
      kaboomTimer.current = window.setTimeout(dismissKaboom, dwell);
    });
  };

  const playResolution = (entry: Resolution): Promise<void> => {
    setKind((entry.kind || "resolution").toUpperCase());
    setKindId((entry.kind || "").toLowerCase());
    setSev(entry.kind === "overheat" ? entry.sev || "" : "");
    if (entry.kind === "destruction") {
      const name =
        entry.rigName ||
        (entry.summary || "").split(" destroyed")[0] ||
        "A rig";
      const exploded = entry.exploded ?? /erupt/i.test(entry.summary || "");
      return playKaboom(name, exploded);
    }
    if (entry.kind === "reaction") {
      const prep = (entry as { prep?: string }).prep || "brace";
      const face = prep === "evasive"
        ? { icon: "💨", label: "Evasive", tone: "evasive" }
        : prep === "return"
          ? { icon: "↩️", label: "Return Fire", tone: "return" }
          : { icon: "🛡️", label: "Brace", tone: "brace" };
      setDice([]);
      setReveal({ prep: face.tone, icon: face.icon, label: face.label });
      setSummary("");
      setBreakdown(null);
      setEffects([]);
      open();
      window.setTimeout(() => {
        setSummary(entry.summary || "");
        setEffects((entry.effects || []).map((text, i) => ({ text, delay: 0.4 + i * 0.12 })));
        showOkAfterDelay();
      }, reduced ? 0 : 480);
      return Promise.resolve();
    }
    setReveal(null);
    setSummary("");
    setBreakdown(null);
    setEffects([]);
    setFormHidden(true);
    setFormSpecs([]);

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

    const finishEffects = () => {
      setSummary(entry.summary || "");
      setBreakdown(entry.breakdown || null);
      setEffects(
        (entry.effects || []).map((text, i) => ({ text, delay: 0.5 + i * 0.12 })),
      );
      showOkAfterDelay();
    };

    const settleAll = () => {
      setDice(
        rolls.map((roll) => ({
          sides: roll.sides,
          value: roll.value,
          label: roll.label || `D${roll.sides}`,
          settled: true,
          tone: rollTone(roll),
        })),
      );
      finishEffects();
    };

    if (reduced || rolls.length === 0) {
      settleAll();
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const started = performance.now();
      const settleAt = rolls.map((_, i) => 550 + i * 240);
      const settledFlags = rolls.map(() => false);
      clearFlicker();
      flickerTimer.current = window.setInterval(() => {
        const elapsed = performance.now() - started;
        let allSettled = true;
        rolls.forEach((roll, i) => {
          if (settledFlags[i]) return;
          if (elapsed >= settleAt[i]) {
            settledFlags[i] = true;
            setDice((prev) => {
              const next = prev.slice();
              next[i] = {
                sides: roll.sides,
                value: roll.value,
                label: roll.label || `D${roll.sides}`,
                settled: true,
                tone: rollTone(roll),
              };
              return next;
            });
            return;
          }
          allSettled = false;
          const el = dieEls.current[i];
          if (el) el.textContent = String(1 + Math.floor(Math.random() * roll.sides));
        });
        if (allSettled) {
          clearFlicker();
          finishEffects();
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
    setBreakdown(null);
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
      if (kaboomTimer.current != null) clearTimeout(kaboomTimer.current);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  useImperativeHandle(ref, () => ({ playResolution, promptDice, closeRoll }));

  const rolling = dice.length > 0 && dice.some((d) => !d.settled);
  const misfire = kindId === "overheat" && !!sev && sev !== "safe";

  const sparkStyle = (i: number): CSSProperties =>
    ({ "--ang": `${i * 36}deg`, animationDelay: `${(i % 4) * 0.05}s` } as unknown as CSSProperties);

  return (
    <>
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
        className={"roll-console" + (misfire ? " misfire" : "")}
        data-kind={kindId || undefined}
        data-sev={misfire ? sev : undefined}
        role="dialog"
        aria-modal="true"
        aria-label="Dice resolution"
      >
        {misfire ? (
          <div className="oh-klaxon" data-sev={sev} role="status">
            <span className="oh-bar" aria-hidden="true" />
            <span className="oh-text">⚠ ENGINE MISFIRE</span>
            <span className="oh-bar" aria-hidden="true" />
          </div>
        ) : null}
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
        {reveal ? (
          <div className="rx-reveal">
            <div className="rx-token flip" data-tone={reveal.prep} aria-label={reveal.label}>
              <span className="rx-token-face rx-token-back" aria-hidden="true">⟡</span>
              <span className="rx-token-face rx-token-front" aria-hidden="true">{reveal.icon}</span>
            </div>
            <span className="die-label">{reveal.label}</span>
          </div>
        ) : null}
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
                {d.settled ? String(d.value) : String(1 + Math.floor(Math.random() * d.sides))}
              </div>
              <span className="die-label">{d.label}</span>
            </div>
          ))}
        </div>
        {rolling && <div className="roll-rolling">Rolling…</div>}
        {breakdown ? (
          <div id="rollSummary" className="rx-break" aria-label={summary}>
            {(breakdown.actor || breakdown.weapon || breakdown.target) && (
              <div className="rx-break-head">
                {breakdown.actor && <span className="rx-actor">{breakdown.actor}</span>}
                {breakdown.weapon && <span className="rx-weapon">{breakdown.weapon}</span>}
                {breakdown.target && <span className="rx-target">→ {breakdown.target}</span>}
              </div>
            )}
            <div className="rx-break-eq">
              {(breakdown.terms || []).map((t, i) => (
                <span className="rx-term-group" key={i}>
                  {t.op ? <span className="rx-op">{t.op}</span> : null}
                  <span className="rx-term" data-tone={t.tone}>
                    <b>{t.value}</b>
                    <em>{t.label}</em>
                  </span>
                </span>
              ))}
            </div>
            <div className="rx-break-out">
              {breakdown.total != null && (
                <span className="rx-total">
                  <span className="rx-op">=</span>
                  {breakdown.total}
                </span>
              )}
              {breakdown.tier && (
                <span className="rx-tier" data-tier={breakdown.tier}>
                  {breakdown.tier}
                </span>
              )}
              <span className="rx-sp">
                <b>{breakdown.sp}</b>
                <em>{breakdown.location ? `SP → ${breakdown.location}` : "SP"}</em>
              </span>
            </div>
          </div>
        ) : (
          <div id="rollSummary" className="roll-summary">
            {summary}
          </div>
        )}
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
    {kaboom ? (
      <div
        className={"kaboom" + (kaboom.exploded ? " erupt" : "")}
        role="alertdialog"
        aria-label={`${kaboom.name} destroyed${kaboom.exploded ? " — munitions cook off" : ""}`}
        onClick={dismissKaboom}
      >
        <div className="kaboom-flash" aria-hidden="true" />
        <div className="kaboom-shock" aria-hidden="true" />
        <div className="kaboom-shock kaboom-shock-2" aria-hidden="true" />
        <div className="kaboom-core">
          <div className="kaboom-sparks" aria-hidden="true">
            {Array.from({ length: 10 }).map((_, i) => (
              <span key={i} style={sparkStyle(i)} />
            ))}
          </div>
          <div className="kaboom-skull" aria-hidden="true">☠</div>
          <div className="kaboom-title">RIG DESTROYED</div>
          <div className="kaboom-name">{kaboom.name}</div>
          {kaboom.exploded ? (
            <div className="kaboom-erupt">☢ MUNITIONS COOK OFF · 12&quot; BLAST</div>
          ) : null}
          <div className="kaboom-hint">tap to continue</div>
        </div>
      </div>
    ) : null}
    </>
  );
});

export default RollConsole;
