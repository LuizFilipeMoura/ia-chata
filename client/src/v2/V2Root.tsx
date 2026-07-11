import { V2Providers } from "./state/V2Providers";
import V2App from "./V2App";

// One lazy chunk for the whole V2 experience (providers + app). Because main.tsx
// lazy-imports this, default (no ?v2) users never download any V2 code or CSS.
export default function V2Root() {
  return (
    <V2Providers>
      <V2App />
    </V2Providers>
  );
}
