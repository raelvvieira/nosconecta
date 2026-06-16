import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { formatBRL } from "@/lib/finance/format";

const COLORS = [
  "oklch(0.6 0.17 270)",
  "oklch(0.7 0.13 195)",
  "oklch(0.72 0.13 155)",
  "oklch(0.74 0.15 70)",
];

interface Item {
  id: string;
  name: string;
  value: number;
  pct: number;
}

export function RevenueByProcedure({ data }: { data: Item[] }) {
  return (
    <section className="surface-card p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold">Faturamento por Procedimento</h2>
        <button className="text-xs text-primary hover:underline font-medium">Ver relatório</button>
      </div>

      <div className="flex items-center gap-6">
        <div className="w-[150px] h-[150px] shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                innerRadius={45}
                outerRadius={70}
                paddingAngle={2}
                stroke="none"
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>

        <ul className="flex-1 space-y-2.5">
          {data.map((d, i) => (
            <li key={d.id} className="grid grid-cols-[1fr_auto_36px] items-center gap-3 text-sm">
              <span className="flex items-center gap-2 min-w-0">
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ background: COLORS[i % COLORS.length] }}
                />
                <span className="text-muted-foreground truncate">{d.name}</span>
              </span>
              <span className="tabular-nums font-medium">{formatBRL(d.value)}</span>
              <span className="text-xs text-muted-foreground tabular-nums text-right">{d.pct.toFixed(0)}%</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
