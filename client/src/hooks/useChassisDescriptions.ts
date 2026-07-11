import { useEffect, useState } from "react";

// The authored per-prebuilt descriptions (content/prebuilts.json), keyed by
// prebuilt id. Fetched once and shared across every caller via a module-level
// cache so a roster of rigs doesn't hit /api/prebuilts once per card.
let cache: Record<string, string> | null = null;
let inflight: Promise<Record<string, string>> | null = null;

function load(): Promise<Record<string, string>> {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    inflight = fetch("/api/prebuilts")
      .then((r) => (r.ok ? r.json() : { prebuilts: [] }))
      .then((data) => {
        const map: Record<string, string> = {};
        for (const p of data?.prebuilts || []) if (p?.description) map[p.id] = p.description;
        cache = map;
        return map;
      })
      .catch(() => ({}));
  }
  return inflight;
}

/** Map of prebuilt id → flavor description. Empty until the one-time fetch lands. */
export function usePrebuiltDescriptions(): Record<string, string> {
  const [map, setMap] = useState<Record<string, string>>(cache || {});
  useEffect(() => {
    if (cache) return;
    let live = true;
    load().then((m) => { if (live) setMap(m); });
    return () => { live = false; };
  }, []);
  return map;
}
