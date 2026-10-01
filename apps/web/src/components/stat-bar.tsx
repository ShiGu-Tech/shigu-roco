import { cn } from "cn";

const TONE: Record<string, string> = {
  primary: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  destructive: "bg-destructive",
  info: "bg-info",
};

export function StatBar({
  label,
  value,
  max,
  tone = "primary",
  hint,
  className,
}: {
  label: React.ReactNode;
  value: number;
  max: number;
  tone?: keyof typeof TONE;
  hint?: React.ReactNode;
  className?: string;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex items-baseline justify-between gap-2 text-[12px]">
        <span className="text-muted-foreground">{label}</span>
        <span className="tnum font-medium">{hint ?? `${value} / ${max}`}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full transition-[width]", TONE[tone])} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
