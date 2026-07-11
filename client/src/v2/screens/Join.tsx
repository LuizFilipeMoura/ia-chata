interface Props { onJoin: (room: string, name: string, side: string) => void; error: string }
export function Join(_props: Props) {
  return (
    <div className="v2-root">
      <div className="v2-mono">ENLIST · COMMISSION · DEPLOY</div>
    </div>
  );
}
