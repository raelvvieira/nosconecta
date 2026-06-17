import {
  ComposedChart, Line, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  ReferenceArea, ReferenceLine, ResponsiveContainer,
} from "recharts";
import { useState } from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/finance/format";
import { buildProjection, type RangeDays } from "./planning-mock";

const RANGES: { label: string; value: RangeDays }[] = [
  { label: "30 dias", value: 30 },
  { label: "60 dias", value: 60 },
  { label: "90 dias", value: 90 },
  { label: "180 dias", value: 180 },
];

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const items = payload.filter((p: any) => p.value !== null && p.value !== undefined);
  return (
    <div className="rounded-xl border border-border/70 bg-card/95 backdrop-blur shadow-lg px-3 py-2.5 text-xs min-w-[180px]">
      <p className="font-medium mb-1.5 text-foreground">{label}</p>
      <ul className="space-y-1">
        {items.map((p: any) => (
          <li key={p.dataKey} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
              {p.name}
            </span>
            <span className="tabular-nums font-medium">{formatBRL(p.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CashProjectionChart({
  range,
  onRangeChange,
}: {
  range: RangeDays;
  onRangeChange: (r: RangeDays) => void;
}) {
  const data = buildProjection(range);
  const [open, setOpen] = useState(false);

  return (
    <div className="surface-card p-5 lg:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <h3 className="font-medium text-base">Projeção de Saldo de Caixa</h3>
          <Info className="h-3.5 w-3.5 text-muted-foreground" />
        </div>

        <div className="flex items-center gap-4">
          <ul className="hidden md:flex items-center gap-4 text-xs text-muted-foreground">
            <li className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm bg-primary" /> Saldo Atual</li>
            <li className="flex items-center gap-1.5"><span className="h-[2px] w-3 border-t-2 border-dashed border-violet" /> Saldo Projetado</li>
            <li className="flex items-center gap-1.5"><span className="h-[2px] w-3 border-t border-muted-foreground/60" /> Meta Financeira</li>
            <li className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm bg-danger-soft" /> Zona de Risco</li>
          </ul>

          <div className="relative">
            <button
              onClick={() => setOpen(o => !o)}
              className="h-9 px-3 inline-flex items-center gap-2 rounded-lg border border-border/70 bg-card/70 text-sm hover:bg-muted/60"
            >
              Próximos {range} dias
              <span className="text-muted-foreground">▾</span>
            </button>
            {open && (
              <div className="absolute right-0 top-10 z-10 w-40 rounded-xl border border-border/70 bg-card shadow-lg p-1">
                {RANGES.map(r => (
                  <button
                    key={r.value}
                    onClick={() => { onRangeChange(r.value); setOpen(false); }}
                    className={cn(
                      "w-full text-left px-3 py-1.5 text-sm rounded-lg hover:bg-muted/60",
                      range === r.value && "bg-muted/60 font-medium",
                    )}
                  >
                    Próximos {r.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="h-[320px]">
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -10 }}>
            <defs>
              <linearGradient id="riskFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(0 80% 60%)" stopOpacity={0.12} />
                <stop offset="100%" stopColor="hsl(0 80% 60%)" stopOpacity={0.04} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} opacity={0.6} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false} tickLine={false}
              tickFormatter={(v) => `R$ ${(v / 1000).toFixed(0)}k`}
              width={60}
            />
            <Tooltip content={<ChartTooltip />} />
            <ReferenceArea y1={-100_000} y2={0} fill="url(#riskFill)" />
            <ReferenceLine y={0} stroke="hsl(0 70% 65%)" strokeOpacity={0.5} />
            <Line
              type="monotone" dataKey="goal" name="Meta Financeira"
              stroke="hsl(var(--muted-foreground))" strokeDasharray="2 4" strokeOpacity={0.7}
              dot={false} strokeWidth={1.5} isAnimationActive={false}
            />
            <Line
              type="monotone" dataKey="actual" name="Saldo Atual"
              stroke="hsl(var(--primary))" strokeWidth={2.4} dot={false}
              activeDot={{ r: 4 }}
            />
            <Line
              type="monotone" dataKey="projected" name="Saldo Projetado"
              stroke="oklch(0.58 0.20 290)" strokeWidth={2.2} strokeDasharray="5 5" dot={false}
              activeDot={{ r: 4 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
