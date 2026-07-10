// Kill whatever is listening on a TCP port before dev starts.
// Cross-platform (Windows/macOS/Linux). Usage: node scripts/free-port.js [port]
import { execSync } from "node:child_process";

const port = Number(process.argv[2] || process.env.PORT || 8000);

function pidsWindows() {
  const out = execSync(`netstat -ano -p tcp`, { encoding: "utf8" });
  const pids = new Set();
  for (const line of out.split(/\r?\n/)) {
    // Proto  Local Address        Foreign Address    State      PID
    const m = line.match(/^\s*TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)/i);
    if (m && Number(m[1]) === port) pids.add(m[2]);
  }
  return [...pids];
}

function pidsPosix() {
  try {
    const out = execSync(`lsof -ti tcp:${port} -sTCP:LISTEN`, { encoding: "utf8" });
    return out.split(/\s+/).filter(Boolean);
  } catch {
    return []; // lsof exits non-zero when nothing matches
  }
}

const isWin = process.platform === "win32";
const pids = isWin ? pidsWindows() : pidsPosix();

if (pids.length === 0) {
  console.log(`[free-port] nothing listening on ${port}`);
  process.exit(0);
}

for (const pid of pids) {
  try {
    if (isWin) execSync(`taskkill /PID ${pid} /F`, { stdio: "ignore" });
    else execSync(`kill -9 ${pid}`, { stdio: "ignore" });
    console.log(`[free-port] killed PID ${pid} on port ${port}`);
  } catch (err) {
    console.warn(`[free-port] could not kill PID ${pid}: ${err.message}`);
  }
}
