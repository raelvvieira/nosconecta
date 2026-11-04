import { DIAS_CURTOS, DIAS_LONGOS } from "@/lib/atendimentos/painel/formato";
import type { PicoDaSemana as Pico } from "@/lib/atendimentos/painel/metricas";

// Mapa de calor: dia da semana × hora, das últimas quatro semanas. Uma cor só,
// a intensidade diz o resto. Segunda a domingo, como a recepção lê a semana.

const HORAS = Array.from({ length: 15 }, (_, i) => i + 7); // 7h–21h
const ORDEM = [1, 2, 3, 4, 5, 6, 0];

export function PicoDaSemana({ pico }: { pico: Pico }) {
  return (
    <div>
      <div className="grid grid-cols-[2rem_repeat(15,minmax(0,1fr))] gap-[3px]">
        <span />
        {HORAS.map((h) => (
          <span key={h} className="text-center text-[10px] tabular-nums text-muted-foreground">
            {h % 3 === 0 ? h : ""}
          </span>
        ))}
        {ORDEM.map((dia) => (
          <div key={dia} className="contents">
            <span className="flex items-center text-[10px] text-muted-foreground">
              {DIAS_CURTOS[dia]}
            </span>
            {HORAS.map((h) => {
              const v = pico.celulas[dia]?.[h] ?? 0;
              const forca = pico.maximo > 0 ? v / pico.maximo : 0;
              const ehPico = pico.pico?.dia === dia && pico.pico.hora === h;
              return (
                <span
                  key={h}
                  title={`${DIAS_LONGOS[dia]}, ${h}h · ${v} ${v === 1 ? "mensagem" : "mensagens"}`}
                  className={`aspect-square rounded-[4px] ${ehPico ? "ring-1 ring-foreground/60" : ""}`}
                  style={{
                    background:
                      v === 0
                        ? "var(--muted)"
                        : `color-mix(in oklab, var(--chart-1) ${Math.round(18 + forca * 82)}%, transparent)`,
                    opacity: v === 0 ? 0.5 : 1,
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>
      {pico.pico && (
        <p className="mt-3 text-xs text-muted-foreground">
          Mais movimento:{" "}
          <span className="font-medium text-foreground">
            {DIAS_LONGOS[pico.pico.dia]}, {pico.pico.hora}h
          </span>
        </p>
      )}
    </div>
  );
}
