import { useEffect, useRef, useState, type CSSProperties } from "react";
import { EQUIPMENT, WEAPON_UPGRADES, WEAPONS, UNIT_WEAPONS } from "/shared/game-state.js";
import { UNIT_KINDS, kindOf, partNamesOf } from "/shared/unit-kinds.js";
import { weaponAccAt } from "/shared/combat.js";
import { WOUND_DIE } from "/shared/rules.js";
import { useRoomState } from "../../state/RoomStateContext";
import { useMySide } from "../../hooks/useMySide";
import { useV2Commands } from "../hooks/useV2Commands";
import { useV2BattleActions } from "../state/V2BattleActionsContext";
import { useV2Roll } from "../state/V2RollContext";
import { rigColor, CHASSIS_NAME, type RigColor } from "../lib/commissionData";
import type { DiceSpec } from "./RollConsole";
import type { Rig } from "../../state/types";
import "../styles/wizards.css";

// Chassis codenames are colours. Resolve a rig's colour from its chassis first,
// then its name (commissioned rigs are named the codename); null when neither
// maps to a colour.
function rigColorOf(rig: Rig): RigColor | null {
  const codename = rig.chassis ? CHASSIS_NAME[rig.chassis] : null;
  return (codename ? rigColor(codename) : null) ?? rigColor(rig.name);
}

// Tint a rig's callsign (e.g. "A1") in its chassis colour with a matching
// swatch chip; plain text when the rig has no colour.
function RigName({ rig }: { rig: Rig }) {
  const c = rigColorOf(rig);
  if (!c) return <>{rig.name}</>;
  return (
    <span className="v2-aw-rigname" style={{ color: c.text }}>
      <span className="v2-aw-rigname-swatch" style={{ background: c.swatch }} aria-hidden="true" />
      {rig.name}
    </span>
  );
}

export type AttackMode = "fire" | "aimed" | "lock";

// Small glyphs so each control reads at a glance (§ UI polish).
const FIELD_ICONS: Record<string, string> = {
  target: "🎯", weapon: "⚔️", arc: "🧭", range: "📏", cover: "🧱", location: "◎",
};
const ARC_ICONS: Record<string, string> = { front: "⬆️", side: "↔️", rear: "⬇️" };
const COVER_ICONS: Record<string, string> = { "0": "○", "1": "◐", "2": "●" };
const LOC_ICONS: Record<string, string> = {
  hull: "🛡️", arms: "🦾", legs: "🦿", engine: "🔩",
  tracks: "⚙️", turret: "🎯", mount: "🔭",
};
const FIELD_DESC: Record<string, string> = {
  target: "The enemy Rig you're attacking",
  weapon: "Ranged reloads between shots; melee strikes within 2\"",
  arc: "Which of the enemy's facings you strike",
  range: "How far the enemy sits from you",
  cover: "Obstruction shielding the enemy",
  location: "Component to hit — an Aimed Shot takes −2 ACC",
};
const ARC_DESC: Record<string, string> = { front: "No STR bonus", side: "+2 STR", rear: "+4 STR" };
const COVER_DESC: Record<string, string> = { "0": "No cover", "1": "−1 ACC", "2": "−2 ACC" };
const LOC_DESC: Record<string, string> = {
  hull: "−2 actions at 0", arms: "Weapons at 0", legs: "Slows at 0", engine: "Heat at 0",
  tracks: "Slows at 0", turret: "Gun lost at 0", mount: "Gun lost at 0",
};

type IconMap = ((opt: string) => string) | Record<string, string> | undefined;

function Field({
  label, options, selected, onChange, icon, optIcon, desc, optDesc, hidden, optDisabled, optColor,
}: {
  label: string;
  options: string[];
  selected: string;
  onChange: (v: string) => void;
  icon?: string;
  optIcon?: IconMap;
  desc?: string;
  optDesc?: IconMap;
  hidden?: boolean;
  optDisabled?: (opt: string) => boolean;
  // Per-option colour (target Rigs are tinted by chassis) — adds a swatch and
  // tints the label. Return null for options with no colour.
  optColor?: (opt: string) => RigColor | null;
}) {
  const iconFor = (opt: string) =>
    (typeof optIcon === "function" ? optIcon(opt) : optIcon?.[opt]) || "";
  const descFor = (opt: string) =>
    (typeof optDesc === "function" ? optDesc(opt) : optDesc?.[opt]) || "";
  return (
    <div className="v2-aw-field v2-field" hidden={hidden}>
      <label className="v2-eyebrow">
        {icon ? <span className="v2-aw-field-ic">{icon}</span> : null}
        {label}
      </label>
      {desc ? <p className="v2-aw-field-desc">{desc}</p> : null}
      <div
        className="v2-aw-seg v2-field-seg"
        style={{ "--v2-seg-cols": options.length > 4 ? Math.ceil(options.length / 2) : options.length } as CSSProperties}
      >
        {options.map((opt) => {
          const ic = iconFor(opt);
          const od = descFor(opt);
          const isDisabled = optDisabled?.(opt) ?? false;
          const col = optColor?.(opt) ?? null;
          const isSel = opt === selected;
          // Selected target: recolour the oil selection chrome to the rig's
          // chassis colour (inline beats the shared .is-sel rule). col is only
          // set on the target field, so no other field is affected.
          const selStyle: CSSProperties | undefined =
            col && isSel
              ? { color: col.text, borderColor: col.text, boxShadow: `inset 0 0 0 1px ${col.text}, 0 0 16px ${col.text}40` }
              : undefined;
          return (
            <button
              key={opt}
              type="button"
              disabled={isDisabled}
              className={"v2-aw-opt v2-opt" + (isSel ? " is-sel" : "") + (isDisabled ? " is-disabled" : "")}
              style={selStyle}
              onClick={() => { if (!isDisabled) onChange(opt); }}
            >
              {ic ? <span className="v2-aw-opt-ic v2-title" aria-hidden="true">{ic}</span> : null}
              <span className="v2-aw-opt-label" style={col ? { color: col.text } : undefined}>
                {col ? <span className="v2-aw-rigname-swatch" style={{ background: col.swatch }} aria-hidden="true" /> : null}
                {opt}
              </span>
              {od ? <span className="v2-aw-opt-desc">{od}</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

type WeaponSlot = "longRange" | "melee" | "unit";
interface AwState {
  target: string;
  weapon: WeaponSlot;
  arc: string;
  range: string;
  /** Measured distance to target in inches — drives the range band. */
  inches: number;
  cover: number;
  loc: string;
}

// ROF for manual dice, keyed by weapon NAME (attack-wizard.js:165).
const ROF_BY_NAME: Record<string, number> = {
  "Mini Gun": 8, "Double MG": 8, "Autocannon": 4, "Arc Gun": 2, "Mortar": 3,
  "Sniper Cannon": 1, Sword: 2, "Circular Saw": 3, Chainsaw: 3, Claw: 2,
  Lance: 1, "Wrecking Ball": 1,
};

interface WeaponUpgradeNotice {
  id: string;
  name: string;
  tag?: string;
}

// Per-rig recall of the last shot: whom this Rig fired on and the measured
// distance. Survives drawer close (the wizard remounts on each open) so the
// next attack opens pre-aimed at the same foe and range. Keyed by rig id.
const LAST_SHOT = new Map<number, { target?: string; inches?: number }>();

const ordinal = (n: number) => {
  const teen = n % 100;
  if (teen >= 11 && teen <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] || "th"}`;
};

// The dice a manual-play volley needs, in resolution order: ROF hit d6s, the
// location d12 (an aimed shot picks its part instead), then ROF wound d10s.
//
// Wound dice are asked for up front, one per POTENTIAL hit, rather than in a
// second prompt once the hits are known — the same bargain the hit dice already
// strike, where all ROF are entered regardless of how many land. The engine
// (combat.js rollWounds) loops `for (let i = 0; i < opts.hits; i++)` reading
// `wounds[i]`, so it consumes them from the front and ignores the surplus off
// the end. That indexing is by LANDED-hit order, not by which hit die landed:
// faces [1, 6, 6] land two hits and take wounds[0] and wounds[1] — the first two
// wound dice, not the 2nd and 3rd.
//
// Hence the labels. "Wound die 1" sitting under "Hit die 1" would claim a
// pairing the engine does not honour; each wound die names the landed hit it
// answers for instead, which is exactly how it will be consumed.
const attackDiceSpecs = (rof: number, withLocation: boolean): DiceSpec[] => {
  const specs: DiceSpec[] = [];
  for (let i = 0; i < rof; i++) specs.push({ key: `h${i}`, label: `Hit die ${i + 1}`, sides: 6 });
  if (withLocation) specs.push({ key: "loc", label: "Location", sides: 12 });
  for (let i = 0; i < rof; i++) {
    specs.push({ key: `w${i}`, label: `Wound · ${ordinal(i + 1)} hit that lands`, sides: WOUND_DIE });
  }
  return specs;
};

// Fold the entered faces into the wire shape the engine reads. `wounds` replaces
// the old `impacts: toHit.map(() => undefined)` — an array of holes that told the
// server to roll the wound dice itself, unseen, which is how a physical-dice
// player ended up never rolling the die that decided their own damage.
const attackDice = (rof: number, d: Record<string, number>): Record<string, unknown> => {
  const toHit: number[] = [];
  const wounds: number[] = [];
  for (let i = 0; i < rof; i++) toHit.push(d[`h${i}`]);
  for (let i = 0; i < rof; i++) wounds.push(d[`w${i}`]);
  const dice: Record<string, unknown> = { toHit, wounds };
  if (d.loc) dice.location = d.loc;
  return dice;
};

function selectedUpgrade(
  rig: Rig,
  slot: "longRange" | "melee",
  weaponName: string,
): WeaponUpgradeNotice | null {
  const upgrades = (WEAPON_UPGRADES[weaponName] || []) as WeaponUpgradeNotice[];
  if (!upgrades.length) return null;
  const selected = rig.weaponUpgrades?.[slot];
  return upgrades.find((u) => u.id === selected) || upgrades[0];
}

export function AttackWizard({
  rig, mode, onClose, target, react,
}: {
  rig: Rig;
  mode: AttackMode;
  onClose: () => void;
  // Return-Fire counter-attack: pin the target to the original attacker and send
  // the shot as a `react` command instead of a normal `action fire`.
  target?: string;
  react?: boolean;
}) {
  const { rigs, game } = useRoomState();
  const mySide = useMySide();
  const sendCommand = useV2Commands();
  const { sendReact } = useV2BattleActions();
  const { promptDice } = useV2Roll();

  // The `rig` prop is a snapshot from open time. Derive the live rig so a reload
  // echo (loaded flips true) is reflected; `justReloaded` gives instant feedback
  // before the server round-trip lands.
  const liveRig = rigs.find((r) => r.id === rig.id) ?? rig;
  const [justReloaded, setJustReloaded] = useState(false);
  const heatKind = !!UNIT_KINDS[kindOf(rig)]?.hasHeat;

  // Aimed Shot is a toggle inside the drawer (fire ↔ aimed); the `mode` prop only
  // seeds the initial state. Lock keeps its own minimal flow further below.
  const [aimed, setAimed] = useState(mode === "aimed");
  const effMode: AttackMode = mode === "lock" ? "lock" : aimed ? "aimed" : "fire";

  const enemies = rigs.filter(
    (r) => (r.owner || "a") !== (rig.owner || "a") && !r.destroyed,
  );

  // Cold kinds (Tank / Walker) carry a single flat-pick "unit" weapon instead of
  // the Rig's longRange + melee pair.
  const flat = UNIT_KINDS[kindOf(rig)]?.weaponMode === "flat-pick";

  // Snapshot the recall once (stable across renders). A remembered target is
  // only honored while that foe is still a live enemy.
  const recall = useRef(LAST_SHOT.get(rig.id)).current;
  const recalledTarget =
    recall?.target && enemies.some((e) => e.name === recall.target) ? recall.target : undefined;

  const [state, setState] = useState<AwState>(() => ({
    target: target ?? recalledTarget ?? enemies[0]?.name ?? "",
    // A spent ranged weapon opens on the melee weapon (the only one live).
    weapon: flat
      ? "unit"
      : rig.loaded?.longRange === false && rig.weapons?.melee
        ? "melee"
        : "longRange",
    arc: "front",
    range: "near",
    inches: recall?.inches ?? 3,
    cover: 0,
    loc: "hull",
  }));

  const [show, setShow] = useState(false);
  const closing = useRef(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShow(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Attack telegraph: 500ms after opening on an enemy, broadcast a `threat` so
  // the defender's ThreatOverlay lights up. Re-declare when the target switches;
  // clear on unmount (close or after Fire). Skipped for return-fire (react).
  useEffect(() => {
    if (react || !state.target) return;
    const weaponName = weapons[flat ? "unit" : state.weapon] || "";
    const id = window.setTimeout(() => {
      sendCommand("threat", {
        action: "declare", target: state.target, mode: effMode, weapon: weaponName, side: mySide,
      });
    }, 500);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.target, state.weapon, react, aimed]);

  useEffect(() => {
    if (react) return;
    return () => { sendCommand("threat", { action: "clear", side: mySide }); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // No opposing, non-destroyed Rigs — there is nothing to attack (attack-wizard.js:45).
  const noEnemies = enemies.length === 0;
  useEffect(() => {
    if (noEnemies) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noEnemies]);

  const close = () => {
    if (closing.current) return;
    closing.current = true;
    setShow(false);
    setTimeout(onClose, 250);
  };

  const patch = (p: Partial<AwState>) => setState((s) => ({ ...s, ...p }));

  const weapons = (rig.weapons ?? {}) as Partial<Record<WeaponSlot, string>>;

  const actionsLeft = () => {
    const t = game?.turn;
    return t ? Math.max(0, t.actionsMax - t.actionsUsed) : 0;
  };

  // Spent on whichever ranged slot the kind uses: a Rig clears loaded.longRange
  // when it fires (combat.js), a flat-pick cold kind clears loaded.unit. Each
  // kind only ever writes its own flag, so this OR is exact. Disabled in the
  // picker until reloaded.
  const rangedSpent = (liveRig.loaded?.longRange === false || liveRig.loaded?.unit === false) && !justReloaded;
  const rangedWeaponName = flat ? weapons.unit : weapons.longRange;
  const hasMelee = !flat && !!weapons.melee
    && !(rig.weaponsDestroyed || []).includes(weapons.melee as string);
  // With no live melee, the drawer has nothing to fire — Reload becomes the CTA.
  const reloadIsPrimary = rangedSpent && !hasMelee;
  const reloadEnabled = heatKind ? true : actionsLeft() > 0;
  const reloadLabel = heatKind
    ? "⟳ Reload · +1–2 heat"
    : reloadEnabled ? "⟳ Reload · 1 action" : "⟳ Reload · Need 1 action";

  const doReload = async () => {
    const attrs: Record<string, unknown> = { name: rig.name, action: "reload" };
    if (heatKind && game?.autoResolve === false) {
      const d = await promptDice([{ key: "reload", label: "Reload heat", sides: 6 }], "Reload heat");
      attrs.dice = { reload: d.reload };
    }
    sendCommand("action", attrs);
    setJustReloaded(true);
    patch({ weapon: flat ? "unit" : "longRange" }); // arm + auto-select the ranged weapon
  };

  const cap = (s?: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");
  const targetDesc = (name: string) => {
    const e = enemies.find((x) => x.name === name);
    if (!e) return "";
    // Cold kinds have no weightClass — label them by their kind instead.
    return e.weightClass ? cap(e.weightClass) : (UNIT_KINDS[kindOf(e)]?.label || "");
  };

  // Resolve a slot's weapon profile from the right catalogue: the shared unit
  // list for the flat-pick "unit" slot, the Rig catalogue otherwise.
  const profileOf = (slot: WeaponSlot) => {
    const name = weapons[slot];
    if (!name) return null;
    if (slot === "unit") return (UNIT_WEAPONS as any)[name] || null;
    return (WEAPONS as any)[slot]?.[name] || null;
  };
  const weaponDesc = (opt: string) => {
    const slot: WeaponSlot = flat ? "unit" : opt === weapons.melee ? "melee" : "longRange";
    const p = flat ? (UNIT_WEAPONS as any)[opt] : (WEAPONS as any)[slot]?.[opt];
    if (!p) return "";
    return p.melee
      ? `Reach ${p.rng[0]}" · ROF ${p.rof}`
      : `Sweet ${p.sweet}" · usable ${p.minRange}"–${p.maxRange}" · ROF ${p.rof}`;
  };

  // Melee is a structural property of the weapon (the `melee` flag), not the
  // slot — so a flat-pick melee unit weapon (Dozer Blade) hides arc/range like a
  // Rig's melee.
  const isMelee = !!profileOf(state.weapon)?.melee;
  useEffect(() => {
    if (isMelee && state.range === "out") patch({ range: "near" });
    // Aimed Shot is ranged-only — a melee weapon forces the shot back to Fire.
    if (isMelee && aimed) setAimed(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMelee]);

  // Aimed Shot hits a component of the TARGET, so its locations follow the
  // target's kind (Tank: hull/tracks/turret/engine; Walker: hull/legs/mount/engine).
  const targetRig = enemies.find((x) => x.name === state.target);
  const targetLocs = partNamesOf(kindOf(targetRig || rig));
  useEffect(() => {
    if (!targetLocs.includes(state.loc)) patch({ loc: targetLocs[0] || "hull" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.target]);

  // Accuracy is a continuous function of the measured distance: it peaks at the
  // weapon's `sweet` and falls off by `dropoff` per inch. minRange/maxRange gate
  // "out". Melee has a fixed reach and no falloff.
  const rangeProfile = profileOf(state.weapon) as
    | { sweet?: number; peak?: number; dropoff?: number; minRange?: number; maxRange?: number; rng?: number[] }
    | null;
  const sweet = rangeProfile?.sweet ?? 8;
  const peak = rangeProfile?.peak ?? 0;
  const minRange = rangeProfile?.minRange ?? 0;
  const maxRange = rangeProfile?.maxRange ?? 12;
  const sliderMax = maxRange + 4; // headroom so the player can drag into "out"
  const accHere = rangeProfile ? weaponAccAt(rangeProfile as never, state.inches) : 0;
  const penalty = peak - accHere;
  const inRange = state.inches >= minRange && state.inches <= maxRange;
  const accTier = !inRange ? "out" : penalty <= 0 ? "sweet" : penalty <= 2 ? "good" : "poor";

  // Seed the slider to the weapon's sweet spot whenever the selected weapon
  // changes (melee seeds to its reach). Keeps "open at the best range" intent.
  // On the first mount we keep a recalled ranged distance instead of re-seeding,
  // so reopening the drawer holds the last measured range.
  const skipRangedSeed = useRef(recall?.inches != null);
  useEffect(() => {
    if (isMelee) {
      const reach = rangeProfile?.rng?.[0] ?? 2;
      patch({ inches: reach });
    } else if (skipRangedSeed.current) {
      skipRangedSeed.current = false; // honor the recalled distance once
    } else {
      patch({ inches: sweet });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.weapon, isMelee]);

  const submit = async () => {
    // Return-Fire counter: send a `react` with an `attack` payload rather than a
    // normal `action`. The server resolves it as a plain fire on the attacker, so
    // aimed doesn't apply here — collect weapon/arc/range/cover (+ manual dice).
    // The server resolves the weapon slot itself (flat kinds always fire "unit"),
    // but we send the right slot and size the manual-dice prompt from the profile.
    const slotSel: WeaponSlot = flat ? "unit" : state.weapon;
    const weaponName = weapons[slotSel] || "";
    const rof = profileOf(slotSel)?.rof || ROF_BY_NAME[weaponName] || 1;

    if (react) {
      const attack: Record<string, unknown> = {
        weapon: slotSel, arc: state.arc, range: state.range, distance: state.inches, cover: state.cover,
      };
      if (game?.autoResolve === false) {
        // Return Fire is never aimed, so it always rolls its own location die.
        const d = await promptDice(attackDiceSpecs(rof, true), `${weaponName} dice`);
        attack.dice = attackDice(rof, d);
      }
      // Return Fire keeps the pinned target; still recall the distance.
      LAST_SHOT.set(rig.id, { ...LAST_SHOT.get(rig.id), inches: state.inches });
      sendReact({ attack });
      close();
      return;
    }

    const attrs: Record<string, unknown> = {
      name: rig.name, action: effMode, target: state.target,
      weapon: slotSel, weaponName, arc: state.arc, range: state.range, distance: state.inches, cover: state.cover,
    };
    if (aimed) attrs.loc = state.loc;
    if (game?.autoResolve === false) {
      // An aimed shot names its location, so it rolls no d12 — the wound dice
      // still ride, since the T they test against comes from the chosen part.
      const d = await promptDice(attackDiceSpecs(rof, !aimed), `${weaponName} dice`);
      attrs.dice = attackDice(rof, d);
    }
    LAST_SHOT.set(rig.id, { target: state.target, inches: state.inches });
    sendCommand("action", attrs);
    close();
  };

  // Effective-range readout + go button. The spent ranged weapon can't be the
  // selected slot (it's disabled in the picker), so this only ever describes a
  // live weapon — except the no-melee case, where the CTA becomes Reload.
  let rangeHtml: React.ReactNode = null;
  let rangeState = "ok";
  let goText = "Fire";
  let goDisabled = false;
  let goIsReload = false;

  const modeLabel = aimed ? "Aimed Shot" : "Fire";
  let dicePreview = "";

  {
    const slot = state.weapon;
    const profile = profileOf(slot);
    const cost = 1;
    const left = actionsLeft();
    const outOfRange = !isMelee && !inRange;
    const rof = profile?.rof || ROF_BY_NAME[weapons[slot] || ""] || 1;
    // A reloaded long-range shot is the activation's SECOND ranged shot, so it
    // runs the barrel hot (+1 heat) — surfaced honestly on the dice line.
    const firedRanged = (game?.turn?.longRangeShots || 0) >= 1;
    const secondShot = !isMelee && firedRanged;

    // The wound dice are named here too: this line is what a manual player reads
    // to know which dice to pick up, and the d10 that decides the damage was the
    // one it used to leave out.
    dicePreview =
      `🎲 Rolls ${rof} hit ${rof === 1 ? "die" : "dice"} (d6)` +
      (!aimed ? " + 1 location die (d12)" : "") +
      ` + up to ${rof} wound ${rof === 1 ? "die" : "dice"} (d10, one per hit that lands)` +
      (aimed ? " · −2 to hit (pick location)" : "") +
      (secondShot ? " · +1 heat (second shot)" : "");

    if (isMelee) {
      const reach = profile?.rng?.[0] ?? 2;
      rangeHtml = (
        <>
          <span className="v2-aw-range-ic">📏</span>Reach <b>{reach}"</b> · melee never needs reloading
        </>
      );
      rangeState = outOfRange ? "bad" : "ok";
    } else if (profile) {
      const accLabel =
        penalty <= 0 ? `Sweet spot +${peak}` : `${accHere >= 0 ? "+" : ""}${accHere} · falloff`;
      const gate =
        state.inches < minRange
          ? <span className="v2-aw-range-warn">Too close — out of range</span>
          : state.inches > maxRange
            ? <span className="v2-aw-range-warn">Target is out of range — this shot will fail</span>
            : null;
      rangeHtml = (
        <>
          <span className="v2-aw-range-ic">📏</span>
          Sweet spot <b>{sweet}"</b> · usable <b>{minRange}"–{maxRange}"</b> · at {state.inches}": <b>{accLabel}</b>
          {gate}
        </>
      );
      rangeState = outOfRange ? "bad" : "ok";
    }

    const unaffordable = cost > left;
    if (reloadIsPrimary) {
      goIsReload = true;
      goText = reloadLabel;
      goDisabled = !reloadEnabled;
    } else {
      goDisabled = outOfRange || unaffordable;
      goText = outOfRange
        ? "Out of range"
        : unaffordable
          ? `Need ${cost} action${cost === 1 ? "" : "s"} · ${left} left`
          : modeLabel;
    }
  }

  const title = aimed ? "◎ Aimed Shot" : "🎯 Fire Weapon";

  const attackNotice = (() => {
    const equipment = rig.equipment ? EQUIPMENT[rig.equipment] : null;
    const equipmentLine = equipment ? `${equipment.label} passive remains active.` : "";
    const weaponName = weapons[state.weapon] || "";
    // Cold kinds carry no weapon upgrades — just name the weapon.
    if (flat) {
      return { main: `Firing ${weaponName} (flat STR — no weight-class scaling).`, equipment: equipmentLine };
    }
    const upgrade = selectedUpgrade(rig, state.weapon as "longRange" | "melee", weaponName);
    return {
      main: upgrade
        ? `${upgrade.name} activates on ${weaponName}: ${upgrade.tag || "selected upgrade effect applies"}.`
        : `${weaponName} has no selected weapon upgrade.`,
      equipment: equipmentLine,
    };
  })();

  if (noEnemies) return null;

  // Fire Control Lock (§13, Missile Barrage) — a minimal flow: pick the enemy
  // to paint, dispatch, done. No weapon/arc/range/cover/location and no dice
  // (the server-side `lock` verb never rolls — see game-state.js act==="lock").
  if (mode === "lock") {
    return (
      <div className="v2-root">
        <div
          className={"v2-aw-scrim v2-scrim v2-scrim--ember" + (show ? " show" : "")}
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div className="v2-aw-card v2-panel" role="dialog" aria-modal="true" aria-label={`Fire control lock — ${rig.name}`}>
            <div className="v2-aw-handle v2-hazard" style={{ "--v2-hazard-w": "11px" } as CSSProperties} />
            <div className="v2-aw-title-row">
              <div className="v2-aw-title v2-title">🔒 Fire Control Lock — <RigName rig={rig} /></div>
              <button type="button" className="v2-aw-close v2-close" aria-label="Close" onClick={close}>✕</button>
            </div>

            <Field
              label="Target"
              options={enemies.map((e) => e.name)}
              selected={state.target}
              onChange={(v) => patch({ target: v })}
              icon={FIELD_ICONS.target}
              optIcon={() => "🤖"}
              desc={FIELD_DESC.target}
              optDesc={targetDesc}
              optColor={(name) => {
                const e = enemies.find((x) => x.name === name);
                return e ? rigColorOf(e) : null;
              }}
            />

            <button
              className="v2-aw-go v2-cta v2-cta--ember"
              disabled={!state.target}
              onClick={() => {
                sendCommand("action", { name: rig.name, action: "lock", target: state.target });
                close();
              }}
            >
              Lock Target
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="v2-root">
      <div
        className={"v2-aw-scrim v2-scrim v2-scrim--ember" + (show ? " show" : "")}
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
      >
        <div className="v2-aw-card v2-panel" role="dialog" aria-modal="true" aria-label={`${title} — ${rig.name}`}>
          <div className="v2-aw-handle v2-hazard" style={{ "--v2-hazard-w": "11px" } as CSSProperties} />
          <div className="v2-aw-title-row">
            <div className="v2-aw-title v2-title">{title} — <RigName rig={rig} /></div>
            <button type="button" className="v2-aw-close v2-close" aria-label="Close" onClick={close}>✕</button>
          </div>

          {!react && !isMelee && (
            <button
              type="button"
              role="switch"
              aria-checked={aimed}
              className={"v2-aw-aim" + (aimed ? " is-on" : "")}
              onClick={() => setAimed((a) => !a)}
            >
              <span className="v2-aw-aim-glyph" aria-hidden="true">◎</span>
              <span className="v2-aw-aim-text">
                <span className="v2-aw-aim-label">Aimed Shot</span>
                <span className="v2-aw-aim-hint">Hit a chosen part · −2 to hit</span>
              </span>
              <span className="v2-aw-aim-switch" aria-hidden="true" />
            </button>
          )}

          <Field
            label="Target"
            options={enemies.map((e) => e.name)}
            selected={state.target}
            onChange={(v) => patch({ target: v })}
            icon={FIELD_ICONS.target}
            optIcon={() => "🤖"}
            desc={FIELD_DESC.target}
            optDesc={targetDesc}
            optColor={(name) => {
              const e = enemies.find((x) => x.name === name);
              return e ? rigColorOf(e) : null;
            }}
            hidden={react}
          />

          {(
            <>
              <Field
                label="Weapon"
                options={flat ? [weapons.unit || ""] : [weapons.longRange || "", weapons.melee || ""]}
                selected={
                  flat ? (weapons.unit || "") : state.weapon === "melee" ? (weapons.melee || "") : (weapons.longRange || "")
                }
                onChange={(v) => {
                  if (flat) return; // single flat-pick weapon — nothing to switch
                  patch({ weapon: v === weapons.melee ? "melee" : "longRange" });
                }}
                icon={FIELD_ICONS.weapon}
                optIcon={(opt) => (isMelee || opt === weapons.melee ? "🗡️" : "🎯")}
                desc={flat ? "One flat-pick weapon — no weight-class STR scaling." : FIELD_DESC.weapon}
                optDisabled={(opt) => rangedSpent && opt === rangedWeaponName}
                optDesc={(opt) => (rangedSpent && opt === rangedWeaponName ? "Spent · reload" : weaponDesc(opt))}
              />
              {rangedSpent && hasMelee && (
                <div className="v2-aw-reload" role="status">
                  <div className="v2-aw-reload-text">
                    <b>Ranged weapon spent.</b> Reload is mandatory before it can fire again.
                  </div>
                  <button
                    type="button"
                    className="v2-aw-reload-btn"
                    disabled={!reloadEnabled}
                    onClick={doReload}
                  >
                    {reloadLabel}
                  </button>
                </div>
              )}
              <Field
                label="Arc"
                options={["front", "side", "rear"]}
                selected={state.arc}
                onChange={(v) => patch({ arc: v })}
                icon={FIELD_ICONS.arc}
                optIcon={ARC_ICONS}
                desc={FIELD_DESC.arc}
                optDesc={ARC_DESC}
                hidden={isMelee}
              />
              {!isMelee && (
                <div className="v2-aw-field v2-field">
                  <label className="v2-eyebrow">
                    <span className="v2-aw-field-ic">{FIELD_ICONS.range}</span>
                    Range
                  </label>
                  <p className="v2-aw-field-desc">Drag to the measured distance to your foe.</p>
                  <div className="v2-aw-range-slider" data-band={accTier}>
                    <input
                      type="range"
                      min={0}
                      max={sliderMax}
                      step={1}
                      value={state.inches}
                      aria-label="Distance to target in inches"
                      onChange={(e) => patch({ inches: Number(e.target.value) })}
                    />
                    <div className="v2-aw-range-readout">
                      <b className="v2-aw-range-inches">{state.inches}"</b>
                      <span className="v2-aw-range-band" data-band={accTier}>
                        {accTier === "sweet" ? "🎯 sweet spot"
                          : accTier === "out" ? "🚫 out of range"
                          : `${accHere >= 0 ? "+" : ""}${accHere} falloff`}
                      </span>
                    </div>
                    <div className="v2-aw-range-ticks">
                      Sweet {sweet}" · usable {minRange}"–{maxRange}"
                    </div>
                  </div>
                </div>
              )}
              <Field
                label="Cover"
                options={["0", "1", "2"]}
                selected={String(state.cover)}
                onChange={(v) => patch({ cover: Number(v) })}
                icon={FIELD_ICONS.cover}
                optIcon={COVER_ICONS}
                desc={FIELD_DESC.cover}
                optDesc={COVER_DESC}
              />
              {aimed && (
                <Field
                  label="Location"
                  options={targetLocs}
                  selected={state.loc}
                  onChange={(v) => patch({ loc: v })}
                  icon={FIELD_ICONS.location}
                  optIcon={LOC_ICONS}
                  desc={FIELD_DESC.location}
                  optDesc={LOC_DESC}
                />
              )}
              <div className="v2-aw-range" data-state={rangeState}>{rangeHtml}</div>
            </>
          )}

          <div className="v2-aw-dice-preview">{dicePreview}</div>

          <div className="v2-aw-attack-notice" aria-live="polite">
            <span className="v2-aw-attack-notice-kicker">Before you attack</span>
            <span>{attackNotice.main}</span>
            {attackNotice.equipment ? <span>{attackNotice.equipment}</span> : null}
          </div>

          <button
            className="v2-aw-go v2-cta v2-cta--ember"
            disabled={goDisabled}
            onClick={goIsReload ? doReload : submit}
          >
            {goText}
          </button>
        </div>
      </div>
    </div>
  );
}
