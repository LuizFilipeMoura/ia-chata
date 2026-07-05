import { useEffect, useRef, useState } from "react";
import { WEAPONS } from "/shared/game-state.js";
import { useRoomState } from "../../state/RoomStateContext";
import { useCommands } from "../../hooks/useCommands";
import { useRoll } from "../../state/RollContext";
import type { Rig } from "../../state/types";

export type AttackMode = "fire" | "aimed" | "ram";

// Small glyphs so each control reads at a glance (§ UI polish).
const FIELD_ICONS: Record<string, string> = {
  target: "🎯", weapon: "⚔️", arc: "🧭", range: "📏", cover: "🧱", location: "◎",
};
const ARC_ICONS: Record<string, string> = { front: "⬆️", side: "↔️", rear: "⬇️" };
const RANGE_ICONS: Record<string, string> = { near: "📍", far: "🔭", out: "🚫" };
const COVER_ICONS: Record<string, string> = { "0": "○", "1": "◐", "2": "●" };
const LOC_ICONS: Record<string, string> = { hull: "🛡️", arms: "🦾", legs: "🦿", engine: "🔩" };
const FIELD_DESC: Record<string, string> = {
  target: "The enemy Rig you're attacking",
  weapon: "Ranged reloads between shots; melee strikes within 1.5\"",
  arc: "Which of the target's facings you strike",
  range: "How far the target sits from you",
  cover: "Obstruction shielding the target",
  location: "Component to hit — an Aimed Shot takes −2 ACC",
};
const ARC_DESC: Record<string, string> = { front: "No STR bonus", side: "+2 STR", rear: "+4 STR" };
const RANGE_DESC: Record<string, string> = { near: "Close band", far: "Far band", out: "Out of range" };
const COVER_DESC: Record<string, string> = { "0": "No cover", "1": "−1 ACC", "2": "−2 ACC" };
const LOC_DESC: Record<string, string> = {
  hull: "−2 actions at 0", arms: "Weapons at 0", legs: "Slows at 0", engine: "Heat at 0",
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

interface AwState {
  target: string;
  weapon: "longRange" | "melee";
  arc: string;
  range: string;
  cover: number;
  loc: string;
}

// ROF for manual dice, keyed by weapon NAME (attack-wizard.js:165).
const ROF_BY_NAME: Record<string, number> = {
  "Mini Gun": 8, "Double MG": 8, "Autocannon": 4, "Arc Gun": 2, "Mortar": 3,
  "Sniper Cannon": 1, Sword: 2, "Circular Saw": 3, Chainsaw: 3, Claw: 2,
  Lance: 1, "Wrecking Ball": 1,
};

export function AttackWizard({
  rig, mode, onClose,
}: {
  rig: Rig;
  mode: AttackMode;
  onClose: () => void;
}) {
  const { rigs, game } = useRoomState();
  const sendCommand = useCommands();
  const { promptDice } = useRoll();

  const enemies = rigs.filter(
    (r) => (r.owner || "a") !== (rig.owner || "a") && !r.destroyed,
  );

  const [state, setState] = useState<AwState>(() => ({
    target: enemies[0]?.name ?? "",
    weapon: "longRange",
    arc: "front",
    range: "near",
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

  const weapons = rig.weapons ?? { longRange: "", melee: "" };

  const targetDesc = (name: string) => {
    const e = enemies.find((x) => x.name === name);
    return e ? e.weightClass.charAt(0).toUpperCase() + e.weightClass.slice(1) : "";
  };
  const weaponDesc = (opt: string) => {
    const slot = opt === weapons.melee ? "melee" : "longRange";
    const p = (WEAPONS as any)[slot]?.[opt];
    if (!p) return "";
    return slot === "melee"
      ? `Reach ${p.rng[0]}" · ROF ${p.rof}`
      : `RNG ${p.rng[0]}–${p.rng[1]}" · ROF ${p.rof}`;
  };

  const profileOf = (slot: "longRange" | "melee") => {
    const name = weapons[slot];
    return (WEAPONS as any)[slot]?.[name] || null;
  };
  const actionsLeft = () => {
    const t = game?.turn;
    return t ? Math.max(0, t.actionsMax - t.actionsUsed) : 0;
  };

  const isMelee = state.weapon === "melee";
  // Melee strikes within reach — arc facings and range bands don't apply, so we
  // hide those controls (and force a valid in-reach range) when melee is chosen.
  useEffect(() => {
    if (isMelee && state.range === "out") patch({ range: "near" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMelee]);

  const submit = async () => {
    const attrs: Record<string, unknown> = { name: rig.name, action: mode, target: state.target };
    if (mode !== "ram") {
      Object.assign(attrs, {
        weapon: state.weapon, arc: state.arc, range: state.range, cover: state.cover,
      });
      if (mode === "aimed") attrs.loc = state.loc;
    }
    if (game?.autoResolve === false) {
      if (mode === "ram") {
        const d = await promptDice(
          [
            { key: "sl", label: "Self location", sides: 12 },
            { key: "si", label: "Self impact", sides: 6 },
            { key: "tl", label: "Target location", sides: 12 },
            { key: "ti", label: "Target impact", sides: 6 },
          ],
          "Ram dice",
        );
        attrs.dice = {
          self: { location: d.sl, impact: d.si },
          target: { location: d.tl, impact: d.ti },
        };
      } else {
        const profile = weapons[state.weapon === "melee" ? "melee" : "longRange"];
        const rof = ROF_BY_NAME[profile] || 1;
        const specs: { key: string; label: string; sides: number }[] = [];
        for (let i = 0; i < rof; i++) specs.push({ key: `h${i}`, label: `Hit die ${i + 1}`, sides: 6 });
        if (mode !== "aimed") specs.push({ key: "loc", label: "Location", sides: 12 });
        const d = await promptDice(specs, `${profile} dice`);
        const toHit: number[] = [];
        for (let i = 0; i < rof; i++) toHit.push(d[`h${i}`]);
        const dice: Record<string, unknown> = { toHit };
        if (d.loc) dice.location = d.loc;
        // Impact dice are entered on demand only when hits land; for manual play
        // we supply a generous impacts array using the hit-dice count as an upper bound.
        dice.impacts = toHit.map(() => undefined);
        attrs.dice = dice;
      }
    }
    sendCommand("action", attrs);
    close();
  };

  // Effective-range readout + go button — mirrors update() in attack-wizard.js.
  let rangeHtml: React.ReactNode = null;
  let rangeState = "ok";
  let goText = "Ram";
  let goDisabled = false;

  if (mode !== "ram") {
    const slot = state.weapon;
    const profile = profileOf(slot);
    const spent = slot === "longRange" && rig.loaded?.longRange === false;
    const cost = spent ? 2 : 1;
    const left = actionsLeft();
    const outOfRange = state.range === "out";

    if (isMelee) {
      const reach = profile?.rng?.[0] ?? 1.5;
      rangeHtml = (
        <>
          <span className="aw-range-ic">📏</span>Reach <b>{reach}"</b> · melee never needs reloading
        </>
      );
      rangeState = outOfRange ? "bad" : "ok";
    } else if (profile) {
      const [near, far] = profile.rng;
      rangeHtml = (
        <>
          <span className="aw-range-ic">📏</span>Effective range — Near <b>≤{near}"</b> · Far <b>≤{far}"</b> · beyond {far}" is out
          {outOfRange ? (
            <span className="aw-range-warn">Target is out of range — this shot will fail</span>
          ) : spent ? (
            <span className="aw-range-note">Weapon spent — a rushed reload folds into this shot (2 actions)</span>
          ) : null}
        </>
      );
      rangeState = outOfRange ? "bad" : spent ? "warn" : "ok";
    }

    const unaffordable = cost > left;
    goDisabled = outOfRange || unaffordable;
    const costTag = cost === 2 ? " · 2 actions" : "";
    goText = outOfRange
      ? "Out of range"
      : unaffordable
        ? `Need ${cost} actions (${left} left)`
        : `Fire${costTag}`;
  }

  const title =
    mode === "ram" ? "💥 Ram" : mode === "aimed" ? "◎ Aimed Shot" : "🎯 Fire Weapon";

  if (noEnemies) return null;

  return (
    <div
      className={"aw-scrim" + (show ? " show" : "")}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="aw-card">
        <div className="aw-title">{title} — {rig.name}</div>

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

        {mode !== "ram" && (
          <>
            <Field
              label="Weapon"
              options={[weapons.longRange, weapons.melee]}
              selected={state.weapon === "melee" ? weapons.melee : weapons.longRange}
              onChange={(v) => patch({ weapon: v === weapons.melee ? "melee" : "longRange" })}
              icon={FIELD_ICONS.weapon}
              optIcon={(opt) => (opt === weapons.melee ? "🗡️" : "🎯")}
              desc={FIELD_DESC.weapon}
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
            <Field
              label="Range"
              options={["near", "far", "out"]}
              selected={state.range}
              onChange={(v) => patch({ range: v })}
              icon={FIELD_ICONS.range}
              optIcon={RANGE_ICONS}
              desc={FIELD_DESC.range}
              optDesc={RANGE_DESC}
              hidden={isMelee}
            />
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
                options={["hull", "arms", "legs", "engine"]}
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

        <button className="aw-go" disabled={goDisabled} onClick={submit}>
          {goText}
        </button>
      </div>
    </div>
  );
}
