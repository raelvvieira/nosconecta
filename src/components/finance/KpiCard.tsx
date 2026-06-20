import type { LucideIcon } from "lucide-react";
import { ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "success" | "danger" | "violet" | "warning";

const toneStyles: Record<Tone, { iconBg: string; iconText: string; chip: string }> = {
  success: { iconBg: "bg-success-soft", iconText: "text-success", chip: "bg-success-soft text-success" },
  danger: { iconBg: "bg-danger-soft", iconText: "text-danger", chip: "bg-danger-soft text-danger" },
  violet: { iconBg: "bg-violet-soft", iconText: "text-violet", chip: "bg-violet-soft text-violet" },
  warning: { iconBg: "bg-warning-soft", iconText: "text-warning", chip: "bg-warning-soft text-warning" },
};

export function KpiCard({
  label,
  value,
  icon: Icon,
  tone,
  deltaPct,
  footer,
  highlight,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  tone: Tone;
  deltaPct?: number;
  footer?: React.ReactNode;
  highlight?: boolean;
}) {
  const styles = toneStyles[tone];
  const positive = deltaPct !== undefined && deltaPct >= 0;

  return (
    <div
      className={cn(
        "surface-card p-4 md:p-6 flex flex-col gap-3 md:gap-5 transition-shadow hover:shadow-lg",
        highlight && "ring-1 ring-primary/20 bg-gradient-to-br from-card to-violet-soft/30",
      )}
    >
      {/* Mobile: icon + label row; Desktop: icon + (label + value column) */}
      <div className="flex items-start gap-3 md:gap-4">
        <div className={cn("h-9 w-9 md:h-12 md:w-12 rounded-xl md:rounded-2xl grid place-items-center shrink-0", styles.iconBg)}>
          <Icon className={cn("h-4 w-4 md:h-5 md:w-5", styles.iconText)} strokeWidth={2} />
        </div>
        {/* Desktop only: label + value stacked next to icon */}
        <div className="hidden md:flex flex-1 min-w-0 flex-col">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold tracking-tight tabular-nums mt-1">{value}</p>
        </div>
        {/* Mobile only: label next to icon */}
        <p className="md:hidden text-[11px] leading-tight text-muted-foreground pt-0.5 flex-1 min-w-0">{label}</p>
      </div>

      {/* Mobile only: value full width */}
      <p className="md:hidden text-[17px] font-semibold tracking-tight tabular-nums leading-none">{value}</p>

      <div className="flex items-center justify-between text-xs">
        {deltaPct !== undefined ? (
          <div
            className={cn(
              "inline-flex items-center gap-1 px-2 py-1 rounded-full font-medium",
              positive ? "bg-success-soft text-success" : "bg-danger-soft text-danger",
            )}
          >
            {positive ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
            {Math.abs(deltaPct).toFixed(0)}%
          </div>
        ) : (
          <span />
        )}
        {footer}
      </div>
    </div>
  );
}
