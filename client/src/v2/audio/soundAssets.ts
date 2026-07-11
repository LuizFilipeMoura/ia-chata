// Eagerly import every clip in the shared assets folder as a bundled, hashed URL.
// Vite rewrites each to its final asset path; the key is the source path, which we
// reduce to a bare stem (filename without extension) for lookup.
const urls = import.meta.glob("../../assets/sounds/*.mp3", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

const byStem: Record<string, string> = {};
for (const [path, url] of Object.entries(urls)) {
  const stem = path.split("/").pop()!.replace(/\.mp3$/, "");
  byStem[stem] = url;
}

/** Map a bare stem ("fire_firing") to its bundled URL, or null if absent. */
export function soundUrl(stem: string): string | null {
  return byStem[stem] ?? null;
}
