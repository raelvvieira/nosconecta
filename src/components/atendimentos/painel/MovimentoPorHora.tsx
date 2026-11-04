import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { CHART_AXIS, CHART_SERIES, CHART_TICK_FONT_SIZE } from "@/lib/finance/chart-theme";

// Mensagens recebidas por hora, no período escolhido. Uma série, uma cor: a
// hora mais movimentada fica cheia, as outras esmaecem. No "Hoje", a hora em
// que estamos ganha um traço embaixo — é onde o olho procura.

function Dica({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: { hora: number; v: number } }[];
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-xl border border-border/70 bg-popover/95 p-2.5 text-xs shadow-lg backdrop-blur">
      <p className="font-medium">{p.hora}h</p>
      <p className="tabular-nums">
        <span className="font-semibold">{p.v}</span> {p.v === 1 ? "mensagem" : "mensagens"}
      </p>
    </div>
  );
}

export function MovimentoPorHora({
  porHora,
  horaAtual,
}: {
  porHora: number[];
  /** Só no "Hoje". */
  horaAtual: number | null;
}) {
  const primeira = porHora.findIndex((v) => v > 0);
  const ultima = porHora.length - 1 - [...porHora].reverse().findIndex((v) => v > 0);
  const de = Math.min(7, primeira < 0 ? 7 : primeira);
  const ate = Math.max(20, ultima < 0 ? 20 : ultima, horaAtual ?? 0);
  const dados = porHora.slice(de, ate + 1).map((v, i) => ({ hora: de + i, v }));
  const maximo = Math.max(...dados.map((d) => d.v), 0);
  return (
    <div className="h-44" role="img" aria-label="Mensagens recebidas por hora">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={dados}
          margin={{ top: 6, right: 0, bottom: 0, left: 0 }}
          barCategoryGap="18%"
        >
          <XAxis
            dataKey="hora"
            tickFormatter={(h: number) => (h % 3 === 0 ? `${h}h` : "")}
            axisLine={false}
            tickLine={false}
            tick={{ fill: CHART_AXIS.tick, fontSize: CHART_TICK_FONT_SIZE }}
            interval={0}
          />
          <Tooltip cursor={false} content={<Dica />} />
          <Bar dataKey="v" radius={[4, 4, 4, 4]} isAnimationActive={false}>
            {dados.map((d) => (
              <Cell
                key={d.hora}
                fill={CHART_SERIES.entrada}
                fillOpacity={maximo > 0 && d.v === maximo ? 1 : d.hora === horaAtual ? 0.7 : 0.35}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
