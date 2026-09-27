// Shared by the beacon experiment scripts: argv parsing and the rule variants
// ("arms") they compare.

// --key value pairs (values may themselves contain "--", e.g. temp paths).
export function parseArgs(argv = process.argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const v = argv[i + 1];
    args[a.slice(2)] = v != null && !v.startsWith("--") ? (i++, v) : true;
  }
  return args;
}

// Job fields per arm, spread into a playMatch job.
export const ARM_RULES = {
  legacy: { beaconRules: "classic" },
  ship: {},                                                     // the default: early plant, CYCLE_BEACON_VP
  cycle: { beaconTuning: { earlyPlant: false, vp: 3 } },
  early: { beaconTuning: { vp: 3 } },
  "early-vp5": { beaconTuning: { vp: 5 } },
  vp5: { beaconTuning: { earlyPlant: false, vp: 5 } },
};

export function armsFrom(args, fallback) {
  const arms = String(args.arms ?? fallback).split(",");
  for (const a of arms) if (!(a in ARM_RULES)) throw new Error(`unknown arm "${a}" (have: ${Object.keys(ARM_RULES).join(", ")})`);
  return arms;
}
