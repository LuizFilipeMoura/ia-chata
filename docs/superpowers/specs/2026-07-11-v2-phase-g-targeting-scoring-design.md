# V2 Phase G — Targeting & Scoring Wizards (Attack + VP)

**Date:** 2026-07-11 · **Status:** Approved · **Depends on:** Phase E (Drawer/Roll). See overview.

## Goal

Native V2 versions of the two remaining wizards: the **AttackWizard** (fire control) and the
**VpWizard** (objective scoring), plus the V2 wizard provider that hosts them. Wire the mockup's Fire
Control overlay (lines 419–451) to the real attack flow.

## Replaces

`components/wizards/AttackWizard.tsx` (570 lines), `components/wizards/VpWizard.tsx`,
`state/WizardContext.tsx` (openAttack/openScore) — for V2. (Commission is already native, Phase B.)

## Architecture / components

```
client/src/v2/
  state/V2WizardContext.tsx    useV2Wizard() → { openAttack(rig, mode, opts?), openScore(), close() };
                               portals V2AttackWizard / V2VpWizard. Slots into V2Providers (place reserved in E).
  overlays/AttackWizard.tsx    V2 fire control: modes "fire" | "aimed" | "lock"; fields Target, Weapon
                               (LR/Melee/unit), Arc (front/side/rear → +0/+2/+4 STR), Range slider (live
                               accuracy tier sweet/good/poor/out + sweet-spot/falloff readout), Cover
                               (0/1/2 → 0/−1/−2), Location (aimed only, −2 ACC), dice preview, effective-
                               range gate, spent-ranged 2-action rushed-reload cost, manual-dice mode
                               (hit d6×ROF + location d12 via useV2Roll.promptDice), return-fire (react)
                               mode, lock (missile paint) mode. Sends `action`/`react`/`lock` exactly as V1.
  overlays/VpWizard.tsx        V2 objective scoring: Centre 2VP / corners 1VP toggles, live "You'll score
                               N VP", disputed markers flagged, prefill from existing claim; sends `vp {side, claims}`.
  styles/wizards.css           .v2-root-scoped fire-control + scoring styles (port mockup 419–451 + a V2 scoring sheet)
```

- Behavior source is the V1 `AttackWizard.tsx`/`VpWizard.tsx`; replicate the accuracy/tier math,
  arc/cover modifiers, effective-range gating, and the three attack modes. Reuse all shared weapon/range
  logic from `/shared/*.js` (no new mechanics).
- `openAttack` guards "no enemies → don't open" (same as V1). Return-fire mode pins the target to the
  attacker and sends `react {attack}`.

## Behavior

- ActionConsole's Attack group → `useV2Wizard().openAttack(rig, "fire"|"aimed"|"lock")`.
- TurnBanner's score CTA → `useV2Wizard().openScore()`.
- Phase F's Return-Fire watcher reopens `openAttack(rig, "fire", { react:true, target })`.

## Testing

- AttackWizard: selecting Arc rear raises the shown STR by +4; moving the range slider past effective
  range disables Open Fire; "Open Fire" sends `action {name, action:"fire", …}` with the chosen
  target/weapon/arc/cover; lock mode sends `lock`; react mode sends `react`.
- Manual dice mode calls `promptDice` for hit + location dice.
- VpWizard: toggling markers updates the live VP total; submit sends `vp {side, claims}`; a disputed
  marker is flagged.

## Done when

No V2 code imports `AttackWizard`/`VpWizard`/`WizardContext` from V1 (the `AttackMode` type is
redeclared in `v2/overlays/AttackWizard.tsx`); targeting + scoring run on the V2 wizard provider.
