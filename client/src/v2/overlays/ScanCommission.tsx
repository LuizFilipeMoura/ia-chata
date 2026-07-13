import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { useCommands } from "../../hooks/useCommands";
import { useMySide } from "../../hooks/useMySide";
import { useRoomState } from "../../state/RoomStateContext";
import { resolveScan } from "../lib/qrCommission";

// Native detector where available (Chromium/Android); jsQR fallback otherwise.
type Detector = { detect: (src: CanvasImageSource) => Promise<Array<{ rawValue: string }>> };
const makeDetector = (): Detector | null => {
  const BD = (globalThis as unknown as { BarcodeDetector?: new (o: unknown) => Detector }).BarcodeDetector;
  return BD ? new BD({ formats: ["qr_code"] }) : null;
};

export function ScanCommission({ onClose }: { onClose: () => void }) {
  const { rigs, game } = useRoomState();
  const sendCommand = useCommands();
  const mySide = useMySide();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  const stateRef = useRef({ rigs, game, mySide, sendCommand, onClose });
  stateRef.current = { rigs, game, mySide, sendCommand, onClose };

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let done = false;
    const detector = makeDetector();
    const canvas = document.createElement("canvas");

    const handle = (text: string) => {
      if (done) return;
      const { rigs, game, mySide, sendCommand, onClose } = stateRef.current;
      // Rig.chassis is `string | null | undefined` in room state; resolveScan's
      // minimal view only reads it as `string | undefined`, so normalize null.
      const scanRigs = rigs.map((r) => ({ ...r, chassis: r.chassis ?? undefined }));
      const r = resolveScan({ rigs: scanRigs, game }, text, mySide);
      if (!r.ok) { setError(r.error || "Unrecognized code"); return; } // keep scanning
      done = true;
      sendCommand("add", r.attrs!);
      onClose();
    };

    const tick = async () => {
      const v = videoRef.current;
      if (!done && v && v.readyState === v.HAVE_ENOUGH_DATA) {
        try {
          if (detector) {
            const hits = await detector.detect(v);
            if (done) return;
            if (hits[0]?.rawValue) handle(hits[0].rawValue);
          } else {
            canvas.width = v.videoWidth; canvas.height = v.videoHeight;
            const ctx = canvas.getContext("2d")!;
            ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(img.data, img.width, img.height);
            if (code?.data) handle(code.data);
          }
        } catch { /* transient decode error; keep polling */ }
      }
      if (!done) raf = requestAnimationFrame(tick);
    };

    navigator.mediaDevices?.getUserMedia({ video: { facingMode: "environment" } })
      .then((s) => {
        if (done) { s.getTracks().forEach((t) => t.stop()); return; }
        stream = s;
        if (videoRef.current) { videoRef.current.srcObject = s; videoRef.current.play(); }
        raf = requestAnimationFrame(tick);
      })
      .catch(() => setError("Camera unavailable — commission from the wizard instead."));

    return () => { done = true; cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="v2-fw-scrim v2-scrim v2-scrim--oil show"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="v2-fw-card v2-panel" role="dialog" aria-modal="true" aria-label="Scan a chassis code">
        <div className="v2-fw-head">
          <div className="v2-fw-order v2-eyebrow">Commission Order · Scan</div>
          <h2 className="v2-fw-title v2-title">◈ Scan a chassis code</h2>
        </div>
        <div className="v2-fw-body">
          <video ref={videoRef} playsInline muted style={{ width: "100%", borderRadius: 8 }} />
          {error && <div className="v2-fw-hint" role="alert">{error}</div>}
        </div>
        <div className="v2-fw-nav">
          <button type="button" className="v2-fw-btn ghost" onClick={onClose}>Close</button>
        </div>
      </section>
    </div>
  );
}
