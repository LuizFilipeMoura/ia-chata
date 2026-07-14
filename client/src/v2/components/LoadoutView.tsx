import "../styles/rig-terminal.css";
import { weaponGlyph, natureLabel } from "../lib/commissionData";
import type { Loadout, LoadoutWeapon } from "../../lib/loadout";
import { MODULES } from "/shared/unit-kinds.js";
import { InfoTerm } from "./InfoTerm";
import { matchGlossary } from "../../lib/glossaryTerms";

// One base stat term, with an optional green "+N" upgrade mark beside it.
function Stat({ label, base, delta }: { label: string; base: number | string; delta: number }) {
  return (
    <span className="v2-rt-lo-stat">
      <InfoTerm as="em" id={label.toLowerCase()} className="v2-eyebrow">{label}</InfoTerm> {base}
      {delta ? <span className="v2-rt-delta">+{delta}</span> : null}
    </span>
  );
}

function WeaponBlock({ w, isSidearm }: { w: LoadoutWeapon; isSidearm?: boolean }) {
  return (
    <div className="v2-rt-lo-weapon">
      <div className="v2-rt-lo-weapon-head">
        <span className="v2-rt-lo-glyph" aria-hidden="true">{weaponGlyph(w.name)}</span>
        <span className="v2-rt-lo-name v2-title">{w.name}</span>
        {isSidearm && <span className="v2-eyebrow">(Sidearm)</span>}
      </div>
      <div className="v2-rt-lo-stats">
        <Stat label="ROF" base={w.rof.base} delta={w.rof.delta} />
        <Stat label="STR" base={w.str.base} delta={w.str.delta} />
        <span className="v2-rt-lo-stat">
          <InfoTerm as="em" id="rng" className="v2-eyebrow">{w.melee ? "RNG" : "RANGE"}</InfoTerm>{" "}
          {w.range.text.replace(/^RNG /, "")}
          {w.range.delta ? <span className="v2-rt-delta">+{w.range.delta}</span> : null}
        </span>
      </div>
      {(w.perks.length > 0 || w.addedPerks.length > 0) && (
        <div className="v2-rt-lo-perks">
          {w.perks.map((p) => <InfoTerm key={p} id={matchGlossary(p)} className="v2-rt-lo-perk">{p}</InfoTerm>)}
          {w.addedPerks.map((p) => <InfoTerm key={p} id={matchGlossary(p)} className="v2-rt-lo-perk is-added">{p}</InfoTerm>)}
        </div>
      )}
      {w.upName && (
        <div className="v2-rt-lo-up">
          <span className="v2-rt-lo-up-name">⬡ {w.upName}</span>
          {w.upNature && <span className="v2-rt-lo-up-nature v2-eyebrow">{natureLabel(w.upNature)}</span>}
          {w.upTag && <span className="v2-rt-lo-up-tag">{w.upTag}</span>}
        </div>
      )}
    </div>
  );
}

export function LoadoutView({ loadout }: { loadout: Loadout }) {
  const eq = loadout.equipment;
  return (
    <div className="v2-rt-lo">
      {loadout.flat
        ? loadout.unit && <WeaponBlock w={loadout.unit} isSidearm={loadout.isSidearm} />
        : (
          <>
            {loadout.lr && <WeaponBlock w={loadout.lr} />}
            {loadout.melee && <WeaponBlock w={loadout.melee} />}
          </>
        )}
      {loadout.modules && loadout.modules.length > 0 && (
        <div className="v2-rt-lo-equip">
          <div className="v2-rt-lo-equip-head">
            <span aria-hidden="true">⬢</span>
            <span className="v2-rt-lo-name v2-title">Modules</span>
          </div>
          <div className="v2-rt-lo-perks">
            {loadout.modules.map((m) => (
              <InfoTerm key={m} id={`module-${m}`} className="v2-rt-lo-perk">{MODULES[m]?.label || m}</InfoTerm>
            ))}
          </div>
        </div>
      )}
      {eq && (
        <div className="v2-rt-lo-equip">
          <div className="v2-rt-lo-equip-head">
            <span aria-hidden="true">🛠</span>
            <span className="v2-rt-lo-name v2-title">{eq.label}</span>
            <span className="v2-rt-lo-equip-family v2-eyebrow">{eq.family}</span>
          </div>
          <div className="v2-rt-lo-equip-line">Passive — {eq.passive}</div>
          <div className="v2-rt-lo-equip-line">
            Active — {eq.activeLabel} ({eq.activeHeat >= 0 ? "+" : ""}{eq.activeHeat} heat): {eq.activeText}
          </div>
          {eq.upName && (
            <div className="v2-rt-lo-up">
              <span className="v2-rt-lo-up-name">⬡ {eq.upName}</span>
              {eq.upNature && <span className="v2-rt-lo-up-nature v2-eyebrow">{natureLabel(eq.upNature)}</span>}
              {eq.upTag && <span className="v2-rt-lo-up-tag">{eq.upTag}</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
