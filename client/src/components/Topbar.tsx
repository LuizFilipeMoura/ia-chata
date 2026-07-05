import { useUi } from "../state/UiStateContext";

export function Topbar() {
  const { setGlossaryOpen } = useUi();
  return (
    <header className="topbar">
      <span className="brand-mark">⚙</span>
      <span className="brand-name">OIL <i>&amp;</i> IRON</span>
      <span className="brand-sub">RIG CONTROL TERMINAL</span>
      <button
        type="button"
        className="topbar-gloss"
        title="Glossary — what do SP, ROF, ACC mean?"
        onClick={() => setGlossaryOpen(true)}
      >
        ⓘ
      </button>
    </header>
  );
}
