import { cn } from "cn";

export function Panel({
  title,
  actions,
  children,
  className,
  bodyClassName,
  dense,
}: {
  title?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  dense?: boolean;
}) {
  const hasHeader = title !== undefined || actions !== undefined;
  return (
    <section className={cn("flex flex-col overflow-hidden rounded-md border bg-card", className)}>
      {hasHeader ? (
        <header className="flex h-10 shrink-0 items-center justify-between gap-2 border-b bg-muted/40 px-3">
          <h2 className="truncate text-[13px] font-semibold">{title}</h2>
          {actions ? <div className="flex shrink-0 items-center gap-1.5">{actions}</div> : null}
        </header>
      ) : null}
      <div className={cn(dense ? "p-2" : "p-3", "flex-1", bodyClassName)}>{children}</div>
    </section>
  );
}
