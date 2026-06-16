import { useState } from "react";
import {
  Bar,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from "recharts";
import { Info } from "lucide-react";
import type { CashFlowPoint } from "@/lib/finance/selectors";
import type { Granularity } from "@/lib/finance/types";
import { formatBRL } from "@/lib/finance/format";

const COLORS = {
  entradas: "oklch(0.72 0.13 155)",
  saidas: "oklch(0.7 0.16 25)",
  futuro: "oklch(0.6 0.17 270)",
  saldo: "oklch(0.55 0.18 270)",
};

const granLabels: Record<Granularity, string> = {
  daily: "Diário",
  weekly: "Semanal",
  monthly: "Mensal",
};

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload as CashFlowPoint;
  const rows = [
    { label: "Entradas", value: p.entradas, color: COLORS.entradas },
    { label: "Saídas", value: -p.saidas, color: COLORS.saidas },
    { label: "Receb. futuro", value: p.receb_futuro, color: COLORS.futuro },
    { label: "Saldo", value: p.saldo, color: COLORS.saldo },
  ];
  return (
    <div className="rounded-xl border border-border/70 bg-popover/95 backdrop-blur p-3 shadow-lg min-w-[200px]">
      <p className="text-xs text-muted-foreground mb-2">{label}</p>
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between text-xs gap-6">
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ background: r.color }} />
              {r.label}
            </span>
            <span className="tabular-nums font-medium">{formatBRL(r.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CashFlowChart({
  data,
  granularity,
  onGranularityChange,
}: {
  data: CashFlowPoint[];
  granularity: Granularity;
  onGranularityChange: (g: Granularity) => void;
}) {
  return (
    <section className="surface-card p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold">Fluxo de Caixa</h2>
          <Info className="h-3.5 w-3.5 text-muted-foreground" />
        </div>

        <div className="flex items-center gap-4">
          <Legend
            content={() => (
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: COLORS.entradas }} />
                  Entradas
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: COLORS.saidas }} />
                  Saídas
                </span>
                <span className="flex items-center gap-1.5">
                  <span
                    className="h-2.5 w-2.5 rounded-sm border-2 border-dashed"
                    style={{ borderColor: COLORS.futuro }}
                  />
                  Receb. futuro
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-[2px] w-3" style={{ background: COLORS.saldo }} />
                  Saldo
                </span>
              </div>
            )}
          />
          <select
            value={granularity}
            onChange={(e) => onGranularityChange(e.target.value as Granularity)}
            className="h-8 px-3 text-xs rounded-lg border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
          >
            {(Object.keys(granLabels) as Granularity[]).map((g) => (
              <option key={g} value={g}>
                {granLabels[g]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex-1 min-h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 20, right: 8, left: -10, bottom: 0 }}>
            <CartesianGrid stroke="oklch(0.93 0.01 260)" strokeDasharray="3 6" vertical={false} />
            <XAxis
              dataKey="label"
              stroke="oklch(0.65 0.02 260)"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              stroke="oklch(0.65 0.02 260)"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => formatBRL(v, { compact: true })}
              width={70}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: "oklch(0.95 0.02 270 / 0.4)" }} />
            <Bar dataKey="entradas" fill={COLORS.entradas} radius={[6, 6, 0, 0]} barSize={10} />
            <Bar dataKey="saidas" fill={COLORS.saidas} radius={[6, 6, 0, 0]} barSize={10} />
            <Bar
              dataKey="receb_futuro"
              fill="transparent"
              stroke={COLORS.futuro}
              strokeDasharray="4 4"
              radius={[6, 6, 0, 0]}
              barSize={10}
            />
            <Line
              type="monotone"
              dataKey="saldo"
              stroke={COLORS.saldo}
              strokeWidth={2}
              dot={{ r: 3, fill: COLORS.saldo, strokeWidth: 0 }}
              activeDot={{ r: 5 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
