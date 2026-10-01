import { cn } from "cn";

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-4 flex flex-col gap-3 min-[860px]:flex-row min-[860px]:items-end min-[860px]:justify-between", className)}>
      <div className="min-w-0">
        <h1 className="text-lg font-semibold tracking-tight min-[860px]:text-xl">{title}</h1>
        {description ? <p className="mt-1 text-[13px] leading-5 text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2 self-start min-[860px]:self-auto">{actions}</div> : null}
    </div>
  );
}
