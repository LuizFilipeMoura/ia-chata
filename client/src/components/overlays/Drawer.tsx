import type { ReactNode } from "react";

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

export default function Drawer({ config, visible, onClose }: DrawerProps) {
  const dismissable = config.dismissable !== false;

  const onScrimClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (dismissable && e.target === e.currentTarget) onClose();
  };

  return (
    <div className={"dwr-scrim" + (visible ? " show" : "")} onClick={onScrimClick}>
      <div className="dwr-card">
        <div className="dwr-title" data-tone={config.tone || "oil"}>
          {config.title}
        </div>
        {config.render?.()}
        {config.actions?.length ? (
          <div className="dwr-actions">
            {config.actions.map((a, i) => (
              <button
                key={i}
                type="button"
                className={"dwr-btn" + (a.primary ? " primary" : "") + (a.ghost ? " ghost" : "")}
                disabled={Boolean(a.disabled)}
                onClick={() => a.onClick?.()}
              >
                {a.icon ? <span className="dwr-btn-ic">{a.icon}</span> : null}
                <span>{a.label}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
