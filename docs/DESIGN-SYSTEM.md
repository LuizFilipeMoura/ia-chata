# Oil & Iron — Design System & Guidance UX

**Status:** Proposal for review · **Scope:** consolidate the existing industrial look + build a reactive "always-know-your-next-move" layer on top of it.
**Guiding principle:** *At every moment the screen names the one thing to do next, and makes that one thing the biggest, brightest, most obvious target.*

This doc has two halves. Part A formalizes what already exists into a real design system (tokens + components) so nothing is styled ad-hoc anymore. Part B is the new work: the four-part **Guidance System** (next-action banner, onboarding/empty states, inline step hints, status clarity), including a phase-by-phase map of exactly what the app should tell the player to do.

---

## Part A — The Design System

### A1. Design principles

1. **One primary action per screen.** Every state has a single "hero" action. Everything else is quieter (ghost/secondary). If the player can't tell what to tap in under two seconds, the screen has failed.
2. **The device reacts, not just the HUD.** When it's the player's move, the whole frame responds (the existing `my-turn-glow` border) so a glance — not a read — tells them to act.
3. **Guidance is layered, not repeated.** Global "what now" lives in the top banner; step-level "how" lives inline next to the control. The same sentence should never appear twice.
4. **State is legible at a glance.** Phase, round, whose turn, and ready-state are always visible and always use the same vocabulary and color coding.
5. **Consistency over cleverness.** A warning is always ember, a healthy value is always green, a mono label is always uppercase-tracked. Reuse tokens; never hardcode a hex.

### A2. Color tokens (already in `tokens.css` — this formalizes their *roles*)

Surfaces (dark iron, back-to-front):

| Token | Hex | Role |
|---|---|---|
| `--iron-950` | `#0a0c0f` | App backdrop, deepest wells (inputs, readouts) |
| `--iron-900` | `#0e1116` | Device shell edges, banners at rest |
| `--iron-850` | `#14181f` | Panel bodies, cards |
| `--iron-800` | `#191e26` | Raised controls, ghost buttons |
| `--iron-780` / `--iron-750` | `#1d232c` / `#232a34` | Hover / pressed steps |
| `--line` / `--line-soft` | `#2b323d` / `#20262f` | Borders, dividers |
| `--rivet` | `#3a424e` | Decorative hardware, scrollbar, disabled borders |

Brand & intent:

| Token | Hex | Role |
|---|---|---|
| `--oil` / `--oil-hi` / `--oil-deep` | `#e79a3d` / `#ffbf6a` / `#c47a26` | **Primary brand + guidance accent.** Headings, active state, "your move" highlights |
| `--ember` / `--ember-hi` | `#e5533a` / `#ff6f52` | **Attack / danger / destructive.** Fire buttons, warnings, crit |
| `--txt` / `--txt-dim` / `--txt-faint` | `#e8ecf1` / `#9aa3b1` / `#616a76` | Primary / secondary / tertiary text |

Health ramp (structure-point bars, four stops):

| Stop | Tokens | Meaning |
|---|---|---|
| OK | `--hp-ok-a/b` (green) | ≥ ~66% SP |
| Warn | `--hp-warn-a/b` (yellow) | ~33–66% |
| Low | `--hp-low-a/b` (orange) | ~1–33% |
| Crit | `--hp-crit-a/b` (red) | at 0 / catastrophic |

**Semantic aliases to add** (so components stop reaching for raw stops). These are new `--` vars that point at existing values — no new colors invented:

```css
:root {
  --guide:        var(--oil);        /* the "do this next" color */
  --guide-hi:     var(--oil-hi);
  --guide-glow:   rgba(231,154,61,.32);
  --act:          var(--hp-ok-a);    /* "it's your turn / go" green  #6cc47f */
  --act-bg:       #142a1c;           /* used by .turn-banner.urgent today */
  --danger:       var(--ember);
  --danger-hi:    var(--ember-hi);
  --wait:         var(--txt-dim);    /* "waiting on opponent" neutral */
}
```

### A3. Type scale

Two families, already loaded: **Chakra Petch** (`--font-display`) for UI/headers, **JetBrains Mono** (`--font-mono`) for labels, tokens, readouts.

| Role | Family | Size | Weight | Tracking | Transform |
|---|---|---|---|---|---|
| Screen title (`.stage-head h1`) | display | `.92rem` | 700 | `.18em` | UPPER |
| Banner text | display | `.8rem` | 700 | `.05em` | UPPER |
| Body / card text | display | `.74–.82rem` | 400–600 | normal | none |
| Micro-label (field labels, phase) | mono | `.52–.6rem` | 700 | `.12–.24em` | UPPER |
| Readout / dice / SP numbers | mono | `.58–.7rem` | 500–700 | `.04em` | none |

Rule of thumb: **mono + uppercase + wide tracking = "this is a label/status, not content."** Never body copy in mono.

### A4. Spacing, radius, motion (formalize the de-facto values)

Add these tokens so components stop using magic numbers:

```css
:root {
  --space-1:.25rem; --space-2:.4rem; --space-3:.55rem;
  --space-4:.8rem;  --space-5:1.05rem; --space-6:1.4rem;
  --radius-sm:6px; --radius-md:10px; --radius-lg:16px; --radius-pill:999px;
  --ease-out:cubic-bezier(.2,.85,.25,1);   /* the springy one already used */
  --dur-fast:.14s; --dur-med:.22s; --dur-slow:.3s;
}
```

Motion rules: hovers/press feedback `--dur-fast`; panels/drawers slide `--dur-slow` with `--ease-out`; banner height changes `.15s`; **guidance changes get a one-shot flash** (see B). Respect `prefers-reduced-motion` — disable the brand-mark spin, pulse, and banner flash.

### A5. Component inventory

These already exist and stay; the doc's job is to lock their contract. **Bold = touched by the guidance work.**

- **Device shell** `.term` — max-width 468px, noise overlay, LAN-phone framing.
- **Top brand strip** `.topbar` — non-interactive identity.
- **`.turn-banner`** — the fixed top "what to do next" bar. *This becomes the backbone of the guidance system.*
- **`.battle-hud`** (`.bh-phase`, `.bh-round`, `.bh-turn`, `.bh-tokens`, `.bh-prompt`) — status cluster + inline prompt button. *Status-clarity target.*
- **Rig list / accordion** `.rig-item`, **`.rig-add-card`** — squadron deck + commission entry. *Empty-state + hint target.*
- **Battle setup bar** `.battle-setup` (`.ready-battle`, `.dice-mode`, `.battle-ready-status`). *Onboarding target.*
- **Action console** (per-rig actions, injected). *Inline-hint target.*
- **Attack wizard** `.aw-*` — bottom-sheet with `.aw-opt` segmented cards, `.aw-range` readout.
- **Rig wizard** `.rw-*`, **roll console** `.roll-*`, **glossary tip** `.glossary-tip`, **chat panel** `.chat-*`.
- **`.outcome-banner`** — end-of-battle result.
- **Join gate** `.join-*`.

### A6. Button hierarchy (make it a real ladder)

Standardize three levels so "the primary action" is unmistakable everywhere:

| Level | Look | Use |
|---|---|---|
| **Primary / hero** | Oil gradient fill, dark ink text, `--radius-md`, subtle glow | The one next action. Max **one** visible per screen |
| **Danger / attack** | Ember gradient (existing `.aw-go`) | Fire, ram, destroy, confirm-irreversible |
| **Ghost / secondary** | `--iron-780` fill, `--line` border, `--txt` | Everything else, and disabled states drop to `--txt-faint` |

The current `.ready-battle`, `.rig-add-btn`, `.bh-btn`, `.aw-go` map onto these — the change is making them share one set of primary/ghost classes rather than each defining its own fill.

---

## Part B — The Guidance System (the new work)

Four coordinated layers. Each answers a different question the player has:

| Layer | Question it answers | Where it lives |
|---|---|---|
| 1. Next-action banner | "What do I do *right now*?" | Fixed top bar (`.turn-banner`) |
| 2. Onboarding / empty states | "I just got here — how do I start?" | Center of stage, inside empty containers |
| 3. Inline step hints | "*How* do I do this specific thing?" | Directly under the relevant control |
| 4. Status clarity | "Where are we in the game?" | HUD cluster (`.bh-*`) |

### B1. Next-action banner — the coach line

There is already `computeFocus()` in `battle.js` producing `{ text, urgent }` and painting `.turn-banner` + the `my-turn-glow` frame. The proposal **keeps this engine and upgrades it** into a full coach:

**Structure.** Banner becomes three slots instead of one string:

```
[◈ icon]  PRIMARY LINE (what to do)          [→ inline CTA button]
          secondary line (why / how, dim)
```

- **Primary line**: imperative, ≤ 5 words. "Activate a Rig." "Choose your action." "Roll initiative."
- **Secondary line** (optional, dim, mono): the one-clause *why/how*. "You have 2 answer tokens." "Ranged weapon is spent."
- **Inline CTA**: when the next action is a single tap (roll, score VP, resolve blast), the banner hosts the button itself so the player never has to hunt for it. This merges today's `.bh-prompt` button *into* the banner so guidance and control are the same object.

**Three tones** (drive color + whether the frame glows):

| Tone | When | Color | Frame glow |
|---|---|---|---|
| `act` (your move) | it's the player's turn / a required roll | `--act` green, `--act-bg` | yes (`my-turn-glow`) |
| `guide` (setup / optional) | pre-battle steps, optional prompts | `--guide` oil | no |
| `wait` (opponent) | waiting on the other side | `--wait` dim, muted | no |

**Reactivity — the "flash on change".** Whenever the primary line *changes*, the banner plays a one-shot pulse (scale 1→1.02, brief brightened border) so a change of duty is felt, not just displayed. New CSS class `.turn-banner.changed`, added for `--dur-slow` then removed. Gated by `prefers-reduced-motion`.

**Full next-action map** (extends the current `computeFocus` cases; `mine` = this player's side):

| Game state | Primary line | Secondary | Inline CTA | Tone |
|---|---|---|---|---|
| No room joined | *(join gate covers this — see B2)* | — | — | — |
| In room, battle not started, **no rigs yet** | "Commission your first Rig" | "Every squadron needs at least one." | Commission | guide |
| Battle not started, rigs exist, **not ready** | "Mark ready when set" | "Tap Ready once your squadron is built." | Ready | guide |
| Not started, you ready, opponent not | "Waiting for opponent to ready…" | — | — | wait |
| `initiative`, round ≥ 2 | "Roll initiative" | — | Roll initiative | act |
| `activation`, your side, **no active rig** | "Activate one of your Rigs" | "Tap a Rig to take its turn." | — | act |
| `activation`, your side, **rig active** | "Choose your next action" | shows actions left, e.g. "2 actions left" | — | act |
| `activation`, opponent's side | "Waiting on {name}…" | — | — | wait |
| `pendingBlast` | "Resolve blast" | "Mark rigs within 12″." | Resolve blast | act |
| `recovery`, you haven't scored | "Score your objectives" | "Tally VP for this round." | Score VP | act |
| `recovery`, you scored | "Waiting for opponent to score…" | — | — | wait |
| `finished` | *(outcome banner takes over — B4)* | — | — | — |

This table is the single source of truth for guidance copy; `computeFocus` should return the whole row (tone, primary, secondary, cta) rather than today's `{text, urgent}`.

### B2. Onboarding & empty states — never a dead screen

Every empty container gets a purposeful empty state with **an icon, one line of what-this-is, and the hero action** — no blank areas.

- **Join gate** (`.join-gate`): already the front door. Tighten copy into a numbered feel — Room code → Name → pick a side → Enter — and disable **Enter** until all three are set, with a dim hint under the button naming the missing piece ("Pick a side to continue"). Side buttons show which is "You" vs "Enemy" more explicitly.
- **Empty squadron** (rig list with zero rigs): the `.rig-add-card` becomes a proper empty state — larger, centered, "Your squadron is empty · Commission a Rig to begin," with the Commission button as the hero. When rigs exist, it shrinks back to the compact add-card at the end of the list.
- **Pre-battle setup** (`.battle-setup`): `.battle-ready-status` always says a human sentence about the gate state ("2 of 2 sides ready — starting…", "Waiting for Enemy to ready"), never "Ready check offline" once in a room.
- **First-run coach marks** (optional, low priority): a one-time dismissible tip on the first rig ("Tap a component's − / + to adjust SP") stored in `localStorage`. Keep to at most two, ever.

### B3. Inline step hints — how, right where you act

Hints answer *how* and sit next to the control, in dim mono, one clause. The codebase already has the pattern (`.rw-hint`, `.dwr-hint`, `.rig-add-hint`, `heat-locked-hint`); the work is making them consistent and complete, not inventing a mechanism.

Standardize one class, `.hint` (`--txt-dim`, `.66rem` display, `line-height 1.4`), plus `.hint--warn` (ember) for blocking notes. Apply at the decision points:

- **Commission wizard** — one hint per step: name it → pick weight class ("sets starting SP for each component") → choose weapons ("one Long Range, one Melee") → pick equipment. The wizard should feel like a guided form, each step's hint already partly present (`rig-wizard.js`).
- **Action console** — each action already carries a `note` from `availableActions()` (e.g. "Ranged weapon spent — rushed reload costs 2 actions", "Weapons already loaded"). Surface every `note` as a `.hint` under its button, and render disabled actions as visibly disabled with the reason, rather than just inert.
- **Attack wizard** — keep the `.aw-range` readout (already state-colored ok/warn/bad); ensure the confirm button is disabled with a hint when out of range or unaffordable.
- **Heat controls** — keep "Set this Rig active to run its engine" as the canonical locked-hint.

Hint discipline: **at most one hint visible per control**, and never restate the banner. If the banner says "Choose your next action," the console doesn't repeat it — its hints only explain individual actions.

### B4. Status clarity — the HUD at a glance

The `.battle-hud` cluster is the persistent "where are we." Lock its layout and vocabulary:

- **Phase chip** (`.bh-phase-label`): the five phases, always the same words — **Setup · Initiative · Activation · Recovery · Battle over** (matches `PHASE_LABELS`). Color it with tone: oil for your active phases, dim otherwise.
- **Round** (`.bh-round`): `R{n}` pill, unchanged.
- **Turn line** (`.bh-turn`): "Turn: **{side}** — {active rig}". Bold the side that is *yours* in green, opponent in dim, so ownership is a color not a read.
- **Answer tokens** (`.bh-tokens`): "⟡ {n} Answer" — only your own count, keep teal.
- **Active-rig affordance:** the rig currently activated gets a clear "ACTIVE" ribbon and a subtle border pulse; its action budget (used/max) shows as pips so "how many actions left" is countable at a glance (feeds the banner's secondary line).
- **Outcome** (`.outcome-banner`): on `finished`, it fully takes over as the hero — win/lose/draw sentence from `outcomeText()`, large, with a single "New battle" ghost action. The next-action banner hides here (no competing guidance).

### B5. How the layers coordinate (no double-talk)

Priority when multiple could speak:

1. **Modal moments win** (blast, VP, dice) — banner shows them and hosts the CTA; HUD prompt defers.
2. **Banner owns "what next"; HUD owns "where we are."** They never say the same sentence.
3. **Hints own "how"** and only appear on the control in question.
4. **Empty states own first-run**; once content exists they collapse to compact affordances.

---

## Part C — Implementation plan (if approved)

Ordered, low-risk, each step shippable on its own:

1. **Tokens** — add semantic aliases (A2), spacing/radius/motion tokens (A4) to `tokens.css`. Pure additions, no visual change yet.
2. **Button ladder** — extract `.btn`, `.btn--primary`, `.btn--danger`, `.btn--ghost`; point existing buttons at them. Visual consistency, no behavior change.
3. **Banner upgrade** — evolve `computeFocus()` to return the full row (tone/primary/secondary/cta) per the B1 map; restructure `.turn-banner` markup + CSS into three slots with the change-flash. Fold `.bh-prompt` CTAs into the banner.
4. **Status clarity** — HUD vocabulary + color-by-ownership + active-rig ribbon and action pips (B4).
5. **Empty states + onboarding** — join gate gating, empty-squadron state, human ready-status copy (B2).
6. **Inline hints** — unify `.hint`, surface every action `note`, disabled-with-reason (B3).
7. **Motion polish + reduced-motion** — banner flash, respect `prefers-reduced-motion` across spin/pulse/flash.
8. **Verify** — run existing `ui-static.test.js` / `battle-view.test.js`; add coverage for the next-action map; visual check on a 468px phone frame.

**Non-goals for this pass:** no new game rules, no layout rework of the wizards' internals, no color palette change (only semantic aliasing), no new dependencies.
