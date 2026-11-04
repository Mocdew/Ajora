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
        "flex flex-col gap-6 pb-10 lg:flex-row lg:items-end lg:justify-between",
        className,
      )}
    >
      <div className="min-w-0 space-y-4">
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1 className="text-hero text-3xl font-normal leading-[1.12] tracking-[-0.045em] sm:text-4xl lg:text-[46px]">
          {title.includes(". ") ? (
            <>
              {title.slice(0, title.indexOf(". ") + 1)}{" "}
              <span className="font-editorial">{title.slice(title.indexOf(". ") + 2)}</span>
            </>
          ) : title}
        </h1>
        {description ? (
          <p className="max-w-prose text-sm leading-relaxed text-muted-foreground md:text-base">
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
