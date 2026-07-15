import { useEffect, useRef, useState } from "react";
import { EQUIPMENT, WEAPON_UPGRADES, WEAPONS, UNIT_WEAPONS } from "/shared/game-state.js";
import { UNIT_KINDS, kindOf, partNamesOf } from "/shared/unit-kinds.js";
import { weaponAccuracyAt } from "/shared/combat.js";
import { useRoomState } from "../../state/RoomStateContext";
import { useCommands } from "../../hooks/useCommands";
import { useBattleActions } from "../../state/BattleActionsContext";
import { useRoll } from "../../state/RollContext";
import { useUi } from "../../state/UiStateContext";
import type { Rig } from "../../state/types";

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
  arc: "Which of the target's facings you strike",
  range: "How far the target sits from you",
  cover: "Obstruction shielding the target",
  location: "Component to hit — an Aimed Shot takes −2 ACC",
};
const ARC_DESC: Record<string, string> = { front: "No STR bonus", side: "+2 STR", rear: "+3 STR" };
const COVER_DESC: Record<string, string> = { "0": "No cover", "1": "−1 ACC", "2": "−2 ACC" };
const LOC_DESC: Record<string, string> = {
  hull: "−2 actions at 0", arms: "Weapons at 0", legs: "Slows at 0", engine: "Heat at 0",
  tracks: "Slows at 0", turret: "Gun lost at 0", mount: "Gun lost at 0",
};

type IconMap = ((opt: string) => string) | Record<string, string> | undefined;

function Field({
  label, options, selected, onChange, icon, optIcon, desc, optDesc, hidden,
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
}) {
  const iconFor = (opt: string) =>
    (typeof optIcon === "function" ? optIcon(opt) : optIcon?.[opt]) || "";
  const descFor = (opt: string) =>
    (typeof optDesc === "function" ? optDesc(opt) : optDesc?.[opt]) || "";
  return (
    <div className="aw-field" hidden={hidden}>
      <label>
        {icon ? <span className="aw-field-ic">{icon}</span> : null}
        {label}
      </label>
      {desc ? <p className="aw-field-desc">{desc}</p> : null}
      <div className="aw-seg">
        {options.map((opt) => {
          const ic = iconFor(opt);
          const od = descFor(opt);
          return (
            <button
              key={opt}
              type="button"
              className={"aw-opt" + (opt === selected ? " sel" : "")}
              onClick={() => onChange(opt)}
            >
              {ic ? <span className="aw-opt-ic" aria-hidden="true">{ic}</span> : null}
              <span className="aw-opt-label">{opt}</span>
              {od ? <span className="aw-opt-desc">{od}</span> : null}
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
  const sendCommand = useCommands();
  const { sendReact } = useBattleActions();
  const { promptDice } = useRoll();
  const { setGlossaryOpen } = useUi();

  const enemies = rigs.filter(
    (r) => (r.owner || "a") !== (rig.owner || "a") && !r.destroyed,
  );

  // Cold kinds (Tank / Walker) carry a single flat-pick "unit" weapon instead of
  // the Rig's longRange + melee pair.
  const flat = UNIT_KINDS[kindOf(rig)]?.weaponMode === "flat-pick";

  const [state, setState] = useState<AwState>(() => ({
    target: target ?? enemies[0]?.name ?? "",
    weapon: flat ? "unit" : "longRange",
    arc: "front",
    range: "near",
    inches: 3,
    cover: 0,
    loc: "hull",
  }));

  const [show, setShow] = useState(false);
  const closing = useRef(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShow(true));
    return () => cancelAnimationFrame(id);
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

  const actionsLeft = () => {
    const t = game?.turn;
    return t ? Math.max(0, t.actionsMax - t.actionsUsed) : 0;
  };

  // Melee is a structural property of the weapon (the `melee` flag), not the
  // slot — so a flat-pick melee unit weapon (Dozer Blade) hides arc/range like a
  // Rig's melee.
  const isMelee = !!profileOf(state.weapon)?.melee;
  useEffect(() => {
    if (isMelee && state.range === "out") patch({ range: "near" });
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
  const accuracyHere = rangeProfile ? weaponAccuracyAt(rangeProfile as never, state.inches) : 0;
  const penalty = peak - accuracyHere;
  const inRange = state.inches >= minRange && state.inches <= maxRange;
  const accuracyTier = !inRange ? "out" : penalty <= 0 ? "sweet" : penalty <= 2 ? "good" : "poor";

  // Seed the slider to the weapon's sweet spot whenever the selected weapon
  // changes (melee seeds to its reach). Keeps "open at the best range" intent.
  useEffect(() => {
    if (isMelee) {
      const reach = rangeProfile?.rng?.[0] ?? 2;
      patch({ inches: reach });
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
        const specs: { key: string; label: string; sides: number }[] = [];
        for (let i = 0; i < rof; i++) specs.push({ key: `h${i}`, label: `Hit die ${i + 1}`, sides: 6 });
        specs.push({ key: "loc", label: "Location", sides: 12 });
        const d = await promptDice(specs, `${weaponName} dice`);
        const toHit: number[] = [];
        for (let i = 0; i < rof; i++) toHit.push(d[`h${i}`]);
        const dice: Record<string, unknown> = { toHit, impacts: toHit.map(() => undefined) };
        if (d.loc) dice.location = d.loc;
        attack.dice = dice;
      }
      sendReact({ attack });
      close();
      return;
    }

    const attrs: Record<string, unknown> = {
      name: rig.name, action: mode, target: state.target,
      weapon: slotSel, arc: state.arc, range: state.range, distance: state.inches, cover: state.cover,
    };
    if (mode === "aimed") attrs.loc = state.loc;
    if (game?.autoResolve === false) {
      const specs: { key: string; label: string; sides: number }[] = [];
      for (let i = 0; i < rof; i++) specs.push({ key: `h${i}`, label: `Hit die ${i + 1}`, sides: 6 });
      if (mode !== "aimed") specs.push({ key: "loc", label: "Location", sides: 12 });
      const d = await promptDice(specs, `${weaponName} dice`);
      const toHit: number[] = [];
      for (let i = 0; i < rof; i++) toHit.push(d[`h${i}`]);
      const dice: Record<string, unknown> = { toHit };
      if (d.loc) dice.location = d.loc;
      // Impact dice are entered on demand only when hits land; for manual play
      // we supply a generous impacts array using the hit-dice count as an upper bound.
      dice.impacts = toHit.map(() => undefined);
      attrs.dice = dice;
    }
    sendCommand("action", attrs);
    close();
  };

  // Effective-range readout + go button — mirrors update() in attack-wizard.js.
  let rangeHtml: React.ReactNode = null;
  let rangeState = "ok";
  let goText = "Fire";
  let goDisabled = false;

  const modeLabel = mode === "aimed" ? "Aimed Shot" : "Fire";
  let dicePreview = "";

  {
    const slot = state.weapon;
    const profile = profileOf(slot);
    // A spent ranged weapon (Rig longRange or cold-kind unit) can't fire: it must
    // Reload first (§7 — no rushed shot). Fire is blocked until it's reloaded.
    const spent = (slot === "longRange" && rig.loaded?.longRange === false)
      || (slot === "unit" && rig.loaded?.unit === false);
    const cost = 1;
    const left = actionsLeft();
    const outOfRange = !isMelee && !inRange;
    const rof = profile?.rof || ROF_BY_NAME[weapons[slot] || ""] || 1;

    dicePreview =
      `🎲 Rolls ${rof} hit ${rof === 1 ? "die" : "dice"} (d6)` +
      (mode === "fire" ? " + 1 location die (d12)" : "") +
      (mode === "aimed" ? " · +1 to hit" : "");

    if (isMelee) {
      const reach = profile?.rng?.[0] ?? 2;
      rangeHtml = (
        <>
          <span className="aw-range-ic">📏</span>Reach <b>{reach}"</b> · melee never needs reloading
        </>
      );
      rangeState = outOfRange ? "bad" : "ok";
    } else if (profile) {
      const accuracyLabel =
        penalty <= 0 ? `Sweet spot +${peak}` : `${accuracyHere >= 0 ? "+" : ""}${accuracyHere} · falloff`;
      const gate =
        state.inches < minRange
          ? <span className="aw-range-warn">Too close — out of range</span>
          : state.inches > maxRange
            ? <span className="aw-range-warn">Target is out of range — this shot will fail</span>
            : spent
              ? <span className="aw-range-warn">Weapon spent — Reload before it can fire again</span>
              : null;
      rangeHtml = (
        <>
          <span className="aw-range-ic">📏</span>
          Sweet spot <b>{sweet}"</b> · usable <b>{minRange}"–{maxRange}"</b> · at {state.inches}": <b>{accuracyLabel}</b>
          {gate}
        </>
      );
      rangeState = outOfRange || spent ? "bad" : "ok";
    }

    const unaffordable = cost > left;
    goDisabled = outOfRange || unaffordable || spent;
    goText = outOfRange
      ? "Out of range"
      : spent
        ? "Reload first"
        : unaffordable
          ? `Need ${cost} action${cost === 1 ? "" : "s"} · ${left} left`
          : modeLabel;
  }

  const title = mode === "aimed" ? "◎ Aimed Shot" : "🎯 Fire Weapon";

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
      <div
        className={"aw-scrim" + (show ? " show" : "")}
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
      >
        <div className="aw-card">
          <div className="aw-handle" />
          <div className="aw-title-row">
            <div className="aw-title">🔒 Fire Control Lock — {rig.name}</div>
            <button type="button" className="sheet-gloss-chip" onClick={() => setGlossaryOpen(true)}>
              ⓘ Glossary
            </button>
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
          />

          <button
            className="aw-go"
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
    );
  }

  return (
    <div
      className={"aw-scrim" + (show ? " show" : "")}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="aw-card">
        <div className="aw-handle" />
        <div className="aw-title-row">
          <div className="aw-title">{title} — {rig.name}</div>
          <button type="button" className="sheet-gloss-chip" onClick={() => setGlossaryOpen(true)}>
            ⓘ Glossary
          </button>
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
              optDesc={weaponDesc}
            />
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
              <div className="aw-field">
                <label>
                  <span className="aw-field-ic">{FIELD_ICONS.range}</span>
                  Range
                </label>
                <p className="aw-field-desc">Drag to the measured distance to the target.</p>
                <div className="aw-range-slider" data-band={accuracyTier}>
                  <input
                    type="range"
                    min={0}
                    max={sliderMax}
                    step={1}
                    value={state.inches}
                    aria-label="Distance to target in inches"
                    onChange={(e) => patch({ inches: Number(e.target.value) })}
                  />
                  <div className="aw-range-readout">
                    <b className="aw-range-inches">{state.inches}"</b>
                    <span className="aw-range-band" data-band={accuracyTier}>
                      {accuracyTier === "sweet" ? "🎯 sweet spot"
                        : accuracyTier === "out" ? "🚫 out of range"
                        : `${accuracyHere >= 0 ? "+" : ""}${accuracyHere} falloff`}
                    </span>
                  </div>
                  <div className="aw-range-ticks">
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
            {mode === "aimed" && (
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
            <div className="aw-range" data-state={rangeState}>{rangeHtml}</div>
          </>
        )}

        <div className="aw-dice-preview">{dicePreview}</div>

        <div className="aw-attack-notice" aria-live="polite">
          <span className="aw-attack-notice-kicker">Before you attack</span>
          <span>{attackNotice.main}</span>
          {attackNotice.equipment ? <span>{attackNotice.equipment}</span> : null}
        </div>

        <button className="aw-go" disabled={goDisabled} onClick={submit}>
          {goText}
        </button>
      </div>
    </div>
  );
}
