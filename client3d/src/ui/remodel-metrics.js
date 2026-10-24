export function frameSummary(samples) {
  if (!samples.length) return null;
  const ordered = [...samples].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return {
    median: ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2,
    p95: ordered[Math.max(0, Math.ceil(ordered.length * 0.95) - 1)],
  };
}

// Geometry submissions for this object only, excluding shadow/post passes.
export function modelCost(root) {
  let draws = 0, triangles = 0;
  root.traverseVisible((o) => {
    if (!o.isMesh) return;
    const g = o.geometry;
    const n = g.index?.count ?? g.attributes.position?.count ?? 0;
    const instances = o.isInstancedMesh ? o.count : 1;
    triangles += n / 3 * instances;
    draws += Array.isArray(o.material) ? g.groups.length : 1;
  });
  return { draws, triangles: Math.round(triangles) };
}
