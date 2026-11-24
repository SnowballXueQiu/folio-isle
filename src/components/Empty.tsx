export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="panel border-dashed px-6 py-12 text-center">
      <div className="font-medium">{title}</div>
      {children && <div className="muted text-sm mt-1.5">{children}</div>}
    </div>
  );
}
