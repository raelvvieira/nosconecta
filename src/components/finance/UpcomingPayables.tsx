import { formatBRL, formatDateBRFull } from "@/lib/finance/format";
import { cn } from "@/lib/utils";

const dueTone = (iso: string) => {
  const d = new Date(iso + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diff <= 3) return "warning" as const;
  if (diff <= 7) return "info" as const;
  return "neutral" as const;
};

export interface PayableItem {
  id: string;
  description: string;
  amount: number;
  due_date: string;
  category_name: string | null;
}

export function UpcomingPayables({ items }: { items: PayableItem[] }) {
  return (
    <section className="surface-card p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold">Próximos Pagamentos</h2>
        <button className="text-xs text-primary hover:underline font-medium">Ver todos</button>
      </div>

      <div className="grid grid-cols-[1.2fr_1.2fr_0.9fr_0.9fr] text-[11px] uppercase tracking-wider text-muted-foreground pb-2 border-b border-border/60">
        <span>Conta</span>
        <span>Categoria</span>
        <span className="text-right">Valor</span>
        <span className="text-right">Vencimento</span>
      </div>

      <ul>
        {items.map((t) => {
          const tone = dueTone(t.due_date);
          return (
            <li
              key={t.id}
              className="grid grid-cols-[1.2fr_1.2fr_0.9fr_0.9fr] items-center py-3 border-b border-border/40 last:border-0 text-sm"
            >
              <span className="truncate">{t.description}</span>
              <span className="text-muted-foreground truncate">{t.category_name ?? "—"}</span>
              <span className="text-right tabular-nums font-medium">{formatBRL(t.amount)}</span>
              <span className="text-right flex items-center justify-end gap-2">
                <span className="text-muted-foreground tabular-nums">{formatDateBRFull(t.due_date)}</span>
                <span
                  className={cn(
                    "h-2 w-2 rounded-full",
                    tone === "warning" && "bg-warning",
                    tone === "info" && "bg-info",
                    tone === "neutral" && "bg-muted-foreground/40",
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
