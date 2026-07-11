import type { ReactNode } from "react";
import "../styles/overlay.css";

export interface DrawerAction {
  label: string;
  icon?: string;
  primary?: boolean;
  ghost?: boolean;
  onClick?: () => void;
  disabled?: boolean;
}

export interface DrawerConfig {
  title: string;
  tone?: "ember" | "oil" | "cool";
  render?: () => ReactNode;
  actions?: DrawerAction[];
  dismissable?: boolean;
}

interface DrawerProps {
  config: DrawerConfig;
  visible: boolean;
  onClose: () => void;
}

// Native V2 port of V1's bottom-sheet Drawer. Because the scrim is portaled to
// document.body (outside the app's V2 root), the card is wrapped in `.v2-root`
// so the scoped `--v2-*` tokens and `.v2-dwr-*` rules apply.
export default function Drawer({ config, visible, onClose }: DrawerProps) {
  const dismissable = config.dismissable !== false;

  const onScrimClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (dismissable && e.target === e.currentTarget) onClose();
  };

  return (
    <div className={"v2-dwr-scrim" + (visible ? " show" : "")} onClick={onScrimClick}>
      <div className="v2-root">
        <div className="v2-dwr-card">
          <div className="v2-dwr-title" data-tone={config.tone || "oil"}>
            {config.title}
          </div>
          {config.render?.()}
          {config.actions?.length ? (
            <div className="v2-dwr-actions">
              {config.actions.map((a, i) => (
                <button
                  key={i}
                  type="button"
                  className={
                    "v2-dwr-btn" + (a.primary ? " primary" : "") + (a.ghost ? " ghost" : "")
                  }
                  disabled={Boolean(a.disabled)}
                  onClick={() => a.onClick?.()}
                >
                  {a.icon ? <span className="v2-dwr-btn-ic">{a.icon}</span> : null}
                  <span>{a.label}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
