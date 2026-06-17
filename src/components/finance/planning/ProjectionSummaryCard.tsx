import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { formatBRL } from "@/lib/finance/format";
import {
  FORECAST_RECEIVABLES, FORECAST_PAYABLES, FORECAST_NET,
} from "./planning-mock";

const COLORS = ["hsl(150 65% 45%)", "hsl(0 75% 60%)", "oklch(0.58 0.20 290)"];

export function ProjectionSummaryCard() {
  const total = FORECAST_RECEIVABLES + FORECAST_PAYABLES + Math.max(0, FORECAST_NET);
  const data = [
    { name: "Recebimentos", value: FORECAST_RECEIVABLES },
    { name: "Pagamentos", value: FORECAST_PAYABLES },
    { name: "Saldo líquido", value: Math.max(0, FORECAST_NET) },
  ];
  const pct = (v: number) => Math.round((v / total) * 100);

  return (
    <div className="surface-card p-5">
      <h3 className="font-medium mb-4">Resumo da Projeção (90 dias)</h3>

      <ul className="space-y-3 text-sm">
        <li className="flex items-center justify-between">
          <span className="text-muted-foreground">Recebimentos previstos</span>
          <span className="tabular-nums font-medium text-success">{formatBRL(FORECAST_RECEIVABLES)}</span>
        </li>
        <li className="flex items-center justify-between">
          <span className="text-muted-foreground">Pagamentos previstos</span>
          <span className="tabular-nums font-medium text-danger">{formatBRL(FORECAST_PAYABLES)}</span>
        </li>
        <li className="flex items-center justify-between pt-2 border-t border-border/60">
          <span className="text-muted-foreground">Saldo líquido projetado</span>
          <span className="tabular-nums font-semibold text-violet">{formatBRL(FORECAST_NET)}</span>
        </li>
      </ul>

      <div className="mt-5 flex items-center gap-4">
        <div className="relative h-32 w-32 shrink-0">
          <ResponsiveContainer>
            <PieChart>
              <Pie data={data} dataKey="value" innerRadius={40} outerRadius={60} stroke="none" startAngle={90} endAngle={-270}>
                {data.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 grid place-items-center text-center pointer-events-none">
            <div>
              <p className="text-lg font-semibold tracking-tight tabular-nums">R$ {(FORECAST_NET / 1000).toFixed(0)}k</p>
              <p className="text-[10px] text-muted-foreground">Saldo líquido</p>
            </div>
          </div>
        </div>

        <ul className="flex-1 min-w-0 space-y-2 text-sm">
          {data.map((d, i) => (
            <li key={d.name} className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full shrink-0" style={{ background: COLORS[i] }} />
              <span className="flex-1 min-w-0 truncate text-muted-foreground">{d.name}</span>
              <span className="tabular-nums font-medium">{pct(d.value)}%</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
