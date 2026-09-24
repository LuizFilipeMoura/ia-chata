// Tiny fixed-size worker pool. run(job) → Promise<result>; jobs queue when all
// workers are busy. Size defaults to cores − 1 so the server thread keeps one.
import { Worker } from "node:worker_threads";
import os from "node:os";

export function createPool(size = Math.max(1, (os.availableParallelism?.() ?? os.cpus().length) - 1)) {
  const url = new URL("./worker.js", import.meta.url);
  const idle = [];
  const queue = [];
  const pending = new Map();
  let nextId = 1;
  const workers = [];
  const spawn = () => {
    const w = new Worker(url);
    w.on("message", ({ id, result, error }) => {
      const p = pending.get(id);
      pending.delete(id);
      if (p) (error ? p.reject(new Error(error)) : p.resolve(result));
      idle.push(w);
      drain();
    });
    w.on("error", (err) => {
      for (const [id, p] of pending) if (p.worker === w) { pending.delete(id); p.reject(err); }
      const i = workers.indexOf(w);
      if (i >= 0) workers.splice(i, 1, spawn());
    });
    workers.push(w);
    idle.push(w);
    return w;
  };
  function drain() {
    while (idle.length && queue.length) {
      const w = idle.pop();
      const { job, resolve, reject } = queue.shift();
      const id = nextId++;
      pending.set(id, { resolve, reject, worker: w });
      w.postMessage({ id, job });
    }
  }
  for (let i = 0; i < size; i++) spawn();
  return {
    size,
    run: (job) => new Promise((resolve, reject) => { queue.push({ job, resolve, reject }); drain(); }),
    close: () => Promise.all(workers.map((w) => w.terminate())),
  };
}
