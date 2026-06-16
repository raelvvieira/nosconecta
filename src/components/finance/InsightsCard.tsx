import { TrendingUp, AlertCircle, Sparkles, CalendarDays } from "lucide-react";
import type { Insight } from "@/lib/finance/queries.functions";
import { cn } from "@/lib/utils";

const iconMap = {
  trend: TrendingUp,
  alert: AlertCircle,
  tooth: Sparkles,
  calendar: CalendarDays,
};

const toneMap = {
  success: { bg: "bg-success-soft", text: "text-success" },
  warning: { bg: "bg-warning-soft", text: "text-warning" },
  violet: { bg: "bg-violet-soft", text: "text-violet" },
  info: { bg: "bg-info-soft", text: "text-info" },
};

export function InsightsCard({ insights }: { insights: Insight[] }) {
  return (
    <section className="surface-card p-6">
      <h2 className="text-base font-semibold mb-5">Insights Financeiros</h2>
      <ul className="space-y-4">
        {insights.map((i) => {
          const Icon = iconMap[i.icon];
          const t = toneMap[i.tone];
          return (
            <li key={i.id} className="flex gap-3">
              <div className={cn("h-9 w-9 shrink-0 rounded-xl grid place-items-center", t.bg)}>
                <Icon className={cn("h-4 w-4", t.text)} />
              </div>
              <p className="text-sm text-foreground/85 leading-relaxed pt-1">{i.text}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
