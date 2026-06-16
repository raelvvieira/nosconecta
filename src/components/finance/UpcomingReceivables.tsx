import { getUpcomingReceivables, TODAY_REF } from "@/lib/finance/selectors";
import { TODAY_REF as TODAY } from "@/lib/finance/mock-data";
import { formatBRL, formatDateBRFull } from "@/lib/finance/format";
import { cn } from "@/lib/utils";

const initials = (name: string) =>
  name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

const dueLabel = (iso: string) => {
  const d = new Date(iso);
  const today = new Date(TODAY);
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return { text: "Hoje", tone: "warning" as const };
  if (diff === 1) return { text: "Amanhã", tone: "success" as const };
  if (diff <= 3) return { text: formatDateBRFull(iso), tone: "warning" as const };
  return { text: formatDateBRFull(iso), tone: "neutral" as const };
};

export function UpcomingReceivables() {
  const items = getUpcomingReceivables(5);
  return (
    <section className="surface-card p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold">Próximos Recebimentos</h2>
        <button className="text-xs text-primary hover:underline font-medium">Ver todos</button>
      </div>

      <div className="grid grid-cols-[1.4fr_1.4fr_0.9fr_0.9fr] text-[11px] uppercase tracking-wider text-muted-foreground pb-2 border-b border-border/60">
        <span>Paciente</span>
        <span>Procedimento</span>
        <span className="text-right">Valor</span>
        <span className="text-right">Vencimento</span>
      </div>

      <ul>
        {items.map((t) => {
          const d = dueLabel(t.due_date);
          return (
            <li
              key={t.id}
              className="grid grid-cols-[1.4fr_1.4fr_0.9fr_0.9fr] items-center py-3 border-b border-border/40 last:border-0 text-sm"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="h-7 w-7 rounded-full bg-gradient-to-br from-violet-soft to-info-soft grid place-items-center text-[10px] font-semibold text-foreground/70">
                  {initials(t.patient?.name ?? "?")}
                </div>
                <span className="truncate">{t.patient?.name}</span>
              </div>
              <span className="text-muted-foreground truncate">{t.description}</span>
              <span className="text-right tabular-nums font-medium">{formatBRL(t.amount)}</span>
              <span className="text-right flex items-center justify-end gap-2">
                <span className="text-muted-foreground">{d.text}</span>
                <span
                  className={cn(
                    "h-2 w-2 rounded-full",
                    d.tone === "success" && "bg-success",
                    d.tone === "warning" && "bg-warning",
                    d.tone === "neutral" && "bg-muted-foreground/40",
                  )}
                />
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
