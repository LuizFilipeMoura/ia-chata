import {
  useState,
  useRef,
  useEffect,
  useId,
  useImperativeHandle,
  forwardRef,
} from "react";
import type { Resolution, ResolutionBreakdown, ResolutionStep } from "../../state/types";
import "../styles/overlay.css";

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

// Per-die verdict word shown under a settled die, alongside the tone color.
//
// The word is keyed off the DIE, not just its tone: the chain rolls d6 to hit
// and d10 to wound, and both use tone "ok"/"miss". Keying on tone alone made a
// successful wound die announce "HIT!" — to-hit vocabulary on a roll that
// decided damage, which is precisely the confusion this panel exists to end.
// Location (d12, tone "cool") and untoned dice get no word.
const verdictLabel = (sides: number, tone: string): string | null => {
  if (sides === WOUND_DIE) {
    if (tone === "crit") return "CRIT!";
    if (tone === "ok") return "WOUND!";
    if (tone === "miss") return "NO WOUND";
    return null;
  }
  if (tone === "crit") return "CRIT!";
  if (tone === "ok") return "HIT!";
  if (tone === "miss") return "FAILED!";
  return null;
};

// The wound die's sides. Mirrors WOUND_DIE in shared/rules.js — the client
// reads resolutions off the wire, so it cannot import the engine constant.
const WOUND_DIE = 10;

// Eyebrow word per ledger step. Each stage names ITSELF; the panel never
// borrows one stage's vocabulary for another.
const STEP_LABEL: Record<ResolutionStep["kind"], string> = {
  hit: "Hit",
  location: "Location",
  wound: "Wound",
  damage: "Damage",
};

// The dice a step is answerable for, normalised to one shape. The location step
// carries a single `die` rather than a `dice[]` because a d12 has no pass/fail
// verdict — it picks a part. `ok: null` renders it neutral rather than lying
// about a success it never adjudicated.
const stepDice = (
  step: ResolutionStep,
): Array<{ value: number; ok: boolean | null }> => {
  if (step.kind === "location") {
    return step.die != null ? [{ value: step.die, ok: null }] : [];
  }
  return step.dice || [];
};

interface EffectState {
  text: string;
  delay: number;
}

// Native V2 port of V1's RollConsole (the dice theater). Same imperative handle
// (playResolution / promptDice / closeRoll), same flicker→settle animation,
// reaction-token flip, damage-equation breakdown, effect lines, and manual
// dice-entry form — retagged with `v2-roll-*` classes. Portaled to <body> by
// the provider, so its root markup is wrapped in `.v2-root`.
const RollConsole = forwardRef<RollConsoleHandle>(function RollConsole(_props, ref) {
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const formId = useId();

  const [hidden, setHidden] = useState(true);
  const [visible, setVisible] = useState(false);
  const [kind, setKind] = useState("Resolution");
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
      // Current cadence is the floor; each die rolls for a random 1x–4x of it.
      const settleAt = rolls.map((_, i) => (550 + i * 240) * (1 + Math.random() * 3));
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
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  useImperativeHandle(ref, () => ({ playResolution, promptDice, closeRoll }));

  const rolling = dice.length > 0 && dice.some((d) => !d.settled);
  const showAction = (!formHidden && formSpecs.length > 0) || !okHidden;

  return (
    <div className="v2-root v2-portal-bare">
      <div
        className={"v2-roll-scrim v2-scrim v2-scrim--oil" + (visible ? " show" : "")}
        hidden={hidden}
        onClick={(e) => {
          if (e.target === e.currentTarget) closeRoll();
        }}
      >
        <div
          className="v2-roll-console v2-panel v2-panel--sharp"
          role="dialog"
          aria-modal="true"
          aria-label="Dice resolution"
        >
          <span className="v2-roll-rivet l" aria-hidden="true" />
          <span className="v2-roll-rivet r" aria-hidden="true" />
          <div className="v2-roll-head">
            <div className="v2-roll-head-id">
              <span className="v2-roll-tag v2-eyebrow" aria-hidden="true">▚ dice cast</span>
              <span className="v2-roll-kind v2-title">{kind}</span>
            </div>
            <button
              className="v2-roll-close v2-close"
              type="button"
              aria-label="Dismiss"
              onClick={closeRoll}
            >
              ✕
            </button>
          </div>

          {reveal ? (
            <div className="v2-roll-zone">
              <div className="v2-roll-zone-label">Reaction</div>
              <div className="v2-rx-reveal">
                <div className="v2-rx-token flip" data-tone={reveal.prep} aria-label={reveal.label}>
                  <span className="v2-rx-token-face v2-rx-token-back" aria-hidden="true">⟡</span>
                  <span className="v2-rx-token-face v2-rx-token-front" aria-hidden="true">{reveal.icon}</span>
                </div>
                <span className="v2-die-label v2-eyebrow">{reveal.label}</span>
              </div>
            </div>
          ) : null}

          {dice.length > 0 ? (
            <div className="v2-roll-zone">
              <div className="v2-roll-zone-label">Dice</div>
              <div className="v2-roll-dice">
                {dice.map((d, i) => (
                  <div className="v2-die-wrap" key={i}>
                    <div
                      className={
                        "v2-die " +
                        (d.sides === 12 ? "d12" : "d6") +
                        (d.settled ? " settled" : " rolling")
                      }
                      data-tone={d.settled ? d.tone : undefined}
                      ref={(el) => {
                        dieEls.current[i] = el;
                      }}
                    >
                      {/* A rolling die's face is owned by the flicker interval, which
                          writes el.textContent directly (see `clearFlicker`'s timer).
                          React must render "" here — NOT a random face.

                          If React rendered a face, its vdom would hold a value it does
                          not control. On settle, React diffs its OWN previous text
                          against the real value and skips the DOM write whenever the two
                          happen to match — stranding the flicker's last face on screen.
                          That showed the player a number the engine never rolled (~1 in
                          `sides` per die, so a 6-die volley lied more often than not).

                          With "" here, React's text always differs from the settled
                          value, so the write always lands. Do not "restore" the random
                          face: the panel lying about its dice is the exact bug class
                          this console exists to prevent. */}
                      {d.settled ? String(d.value) : ""}
                    </div>
                    {d.settled && verdictLabel(d.sides, d.tone) ? (
                      <span className="v2-die-verdict v2-eyebrow" data-tone={d.tone}>
                        {verdictLabel(d.sides, d.tone)}
                      </span>
                    ) : null}
                    <span className="v2-die-label v2-eyebrow">{d.label}</span>
                  </div>
                ))}
              </div>
              {rolling && <div className="v2-roll-rolling v2-eyebrow">Rolling…</div>}
            </div>
          ) : null}

          {breakdown ? (
            <div className="v2-roll-zone v2-roll-zone--ledger">
              <div className="v2-roll-zone-label">Resolution</div>
              <div className="v2-rx-break" aria-label={summary}>
                {(breakdown.actor || breakdown.weapon || breakdown.target) && (
                  <div className="v2-rx-break-head">
                    {breakdown.actor && <span className="v2-rx-actor">{breakdown.actor}</span>}
                    {breakdown.weapon && <span className="v2-rx-weapon">{breakdown.weapon}</span>}
                    {breakdown.target && <span className="v2-rx-target">→ {breakdown.target}</span>}
                  </div>
                )}
                {/* The ledger. Steps stagger in in resolution order so the panel
                    NARRATES the rule rather than dumping it; reduced-motion
                    lands them all at once (see overlay.css). They are in the
                    DOM from the first frame either way. */}
                <ol className="v2-rx-steps">
                  {(breakdown.steps || []).map((s, i) => (
                    <li
                      className="v2-rx-step"
                      key={i}
                      data-kind={s.kind}
                      data-testid="v2-roll-step"
                      style={{ animationDelay: reduced ? undefined : `${i * 0.18}s` }}
                    >
                      <div className="v2-rx-step-in" data-testid={`v2-roll-step-${s.kind}`}>
                        <div className="v2-rx-step-hd">
                          <span className="v2-rx-step-kind v2-eyebrow">{STEP_LABEL[s.kind]}</span>
                          {/* The money shot. "STR 4 vs T5 → 7+" is the single
                              line that answers "why 0 damage?". */}
                          {s.kind === "wound" && s.pen != null && s.toughness != null ? (
                            <span className="v2-rx-step-math">
                              <span className="v2-rx-step-pair">STR&nbsp;<b>{s.pen}</b></span>
                              <i>vs</i>
                              <span className="v2-rx-step-pair">T<b>{s.toughness}</b></span>
                              <i>→</i>
                              <span className="v2-rx-step-tn">{s.target}+</span>
                            </span>
                          ) : s.target != null ? (
                            <span className="v2-rx-step-tn">{s.target}+</span>
                          ) : null}
                        </div>
                        {stepDice(s).length > 0 && (
                          <div className="v2-rx-step-dice">
                            {stepDice(s).map((d, j) => (
                              <span
                                className="v2-rx-pip"
                                key={j}
                                data-ok={d.ok == null ? undefined : String(d.ok)}
                              >
                                {d.value}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="v2-rx-step-out">{s.out}</div>
                        {(s.terms || []).length > 0 && (
                          <div className="v2-rx-step-terms">
                            {/* Zeros are NOT filtered: a 0 term is a canceller
                                explaining why something cost nothing. */}
                            {(s.terms || []).map((t, j) => (
                              <span
                                className="v2-rx-chip"
                                key={j}
                                data-sign={
                                  typeof t.value === "number" && t.value !== 0
                                    ? t.value > 0 ? "pos" : "neg"
                                    : "zero"
                                }
                              >
                                <b>{typeof t.value === "number" && t.value > 0 ? `+${t.value}` : t.value}</b>
                                <em>{t.label}</em>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
                <div className="v2-rx-break-out">
                  <span className="v2-rx-sp">
                    <b>{breakdown.sp}</b>
                    <em>{breakdown.location ? `SP → ${breakdown.location}` : "SP"}</em>
                  </span>
                </div>
              </div>
            </div>
          ) : summary ? (
            <div className="v2-roll-zone">
              <div className="v2-roll-zone-label">Result</div>
              <div className="v2-roll-strip">
                <div className="v2-roll-summary">{summary}</div>
              </div>
            </div>
          ) : null}

          {effects.length > 0 ? (
            <div className="v2-roll-zone">
              <div className="v2-roll-zone-label">Effects</div>
              <div className="v2-roll-effects">
                {effects.map((e, i) => (
                  <div
                    className="v2-roll-effect"
                    key={i}
                    style={{ animationDelay: `${e.delay}s` }}
                  >
                    {e.text}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {!formHidden ? (
            <div className="v2-roll-zone">
              <div className="v2-roll-zone-label">Enter dice</div>
              <div className="v2-roll-form">
                {formSpecs.map((spec, i) => (
                  <div className="v2-roll-form-row" key={i}>
                    <label className="v2-eyebrow" htmlFor={`${formId}-${i}`}>{`${spec.label} (D${spec.sides})`}</label>
                    <input
                      className="v2-well"
                      id={`${formId}-${i}`}
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
              </div>
            </div>
          ) : null}

          {showAction ? (
            <div className="v2-roll-action">
              {!formHidden && formSpecs.length ? (
                <button className="v2-roll-form-go v2-cta" type="button" onClick={onFormGo}>
                  Confirm roll
                </button>
              ) : null}
              {!okHidden ? (
                <button className="v2-roll-ok v2-cta" type="button" onClick={closeRoll}>
                  OK
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
});

export default RollConsole;
