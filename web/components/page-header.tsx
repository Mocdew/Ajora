import { cn } from "@/lib/utils";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 pb-8 sm:flex-row sm:items-start sm:justify-between",
        className,
      )}
    >
      <div className="space-y-2.5">
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1 className="font-display text-3xl font-bold leading-[1.05] tracking-tight text-foreground md:text-[2.75rem]">
          {title}
        </h1>
        {description ? (
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-base">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
