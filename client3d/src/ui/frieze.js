// Turn-order frieze logic: who still has to act this round, alternating from
// the side on the floor (a side that runs out lets the other finish), then
// the rigs that already acted.
export function activationOrder(rigs, first = "a") {
  const second = first === "a" ? "b" : "a";
  const live = (s) => rigs.filter((r) => (r.owner || "a") === s && !r.destroyed);
  const wait = { [first]: live(first).filter((r) => !r.activated), [second]: live(second).filter((r) => !r.activated) };
  const done = [...live("a"), ...live("b")].filter((r) => r.activated);
  const seq = [];
  for (let i = 0; wait[first].length || wait[second].length; i++) {
    const s = i % 2 ? second : first;
    const r = wait[s].shift() || wait[s === first ? second : first].shift();
    if (r) seq.push(r);
  }
  return { seq, done };
}
