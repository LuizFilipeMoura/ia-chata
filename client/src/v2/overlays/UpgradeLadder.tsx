import { natureLabel, upgradePips, splitUpgradeTag, type UpgradeTier } from "../lib/commissionData";

interface UpgradeLadderProps {
  title: string;
  subtitle?: string;
  glyph?: string;
  tiers: UpgradeTier[];
  selected: string | null;
  onSelect: (id: string) => void;
  lockPrototype: boolean;
}

function pips(kind: "rwd" | "rsk", n: number) {
  return Array.from({ length: 3 }, (_, i) => (
    <span key={i} className={"v2-ul-pip" + (i < n ? " on-" + kind : "")} />
  ));
}

export function UpgradeLadder({ title, subtitle, glyph, tiers, selected, onSelect, lockPrototype }: UpgradeLadderProps) {
  const current = tiers.find((t) => t.id === selected) || tiers[0];
  const { payoff, catch: risk } = splitUpgradeTag(current);
  const { reward, risk: riskPips } = upgradePips(current.nature);
  const isProto = current.nature === "prototype";

  return (
    <div className="v2-ul">
      <div className="v2-ul-head">
        {glyph ? <span className="v2-ul-glyph">{glyph}</span> : null}
        <span className="v2-ul-title v2-title">{title}</span>
        {subtitle ? <small className="v2-ul-sub">{subtitle}</small> : null}
      </div>

      <div className="v2-ul-scale v2-eyebrow"><span>◂ safe</span><span>volatile ▸</span></div>
      <div className="v2-ul-seg" role="group">
        {tiers.map((t, i) => {
          const locked = t.nature === "prototype" && lockPrototype && t.id !== selected;
          const on = t.id === current.id;
          return (
            <button
              key={t.id}
              type="button"
              disabled={locked}
              data-nature={t.nature}
              className={"v2-ul-tab nat-" + t.nature + (on ? " on" : "") + (locked ? " locked" : "")}
              title={locked ? "A rig may run at most one Prototype upgrade" : t.tag}
              onClick={() => !locked && onSelect(t.id)}
            >
              <span className="v2-ul-tab-n">{["I", "II", "III"][i]}</span>
              <span className="v2-ul-tab-k">{locked ? "🔒 " + natureLabel(t.nature) : natureLabel(t.nature)}</span>
            </button>
          );
        })}
      </div>

      <div className={"v2-ul-panel nat-" + current.nature}>
        <div className="v2-ul-panel-hd">
          <b className="v2-title">{current.name}</b>
          {isProto ? <span className="v2-ul-gate v2-eyebrow">1 per rig</span> : null}
        </div>
        <div className="v2-ul-cols">
          <div className="v2-ul-col v2-ul-pay">
            <div className="v2-ul-col-hd v2-eyebrow">Payoff <span className="v2-ul-meter">{pips("rwd", reward)}</span></div>
            {payoff}
          </div>
          <div className="v2-ul-col v2-ul-catch">
            <div className="v2-ul-col-hd v2-eyebrow">Catch {risk ? <span className="v2-ul-meter">{pips("rsk", riskPips)}</span> : null}</div>
            {risk ? <span>⚠ {risk}</span> : <span className="v2-ul-none">None — dependable.</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
