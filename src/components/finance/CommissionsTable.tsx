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

export function CommissionsTable({ data }: { data: Item[] }) {
  return (
    <section className="surface-card p-6">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-base font-semibold">Comissões do Mês</h2>
        <button className="text-xs text-primary hover:underline font-medium">Ver relatório</button>
      </div>
      <ul className="space-y-3">
        {data.map((d) => (
          <li key={d.id} className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-gradient-to-br from-violet-soft to-info-soft grid place-items-center text-[11px] font-semibold text-foreground/70">
              {initials(d.name)}
            </div>
            <span className="flex-1 text-sm font-medium truncate">{d.name}</span>
            <span className="text-sm tabular-nums font-semibold">{formatBRL(d.value)}</span>
            <span className="inline-flex items-center justify-center text-[11px] font-medium px-2 py-0.5 rounded-full bg-violet-soft text-violet tabular-nums min-w-[40px]">
              {d.pct}%
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
