import { formatBRL } from "@/lib/finance/format";

interface Item {
  id: string;
  name: string;
  value: number;
  pct: number;
}

const initials = (name: string) =>
  name
    .replace(/^Dra?\.\s/, "")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("");

export function RevenueByDentist({ data }: { data: Item[] }) {
  return (
    <section className="surface-card p-6">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-base font-semibold">Faturamento por Dentista</h2>
        <button className="text-xs text-primary hover:underline font-medium">Ver relatório</button>
      </div>
      <ul className="space-y-4">
        {data.map((d) => (
          <li key={d.id} className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-gradient-to-br from-violet-soft to-info-soft grid place-items-center text-[11px] font-semibold text-foreground/70">
              {initials(d.name)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{d.name}</p>
              <div className="mt-1.5 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-primary to-violet"
                  style={{ width: `${Math.max(4, d.pct)}%` }}
                />
              </div>
            </div>
            <span className="text-sm font-semibold tabular-nums shrink-0">{formatBRL(d.value)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
