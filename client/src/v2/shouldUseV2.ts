// V2 is opt-in via a `?v2` query flag so it can ship alongside V1 with zero
// impact on the default experience. Accepts `?v2`, `?v2=1`, or `v2` among others.
export function shouldUseV2(search: string): boolean {
  return new URLSearchParams(search).has("v2");
}
