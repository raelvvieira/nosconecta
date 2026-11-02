import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { DiaDaSemana, ModoDoDia } from "@/lib/settings/horarios.functions";

const NOMES = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const MODOS: { id: ModoDoDia; rotulo: string }[] = [
  { id: "aberto", rotulo: "Aberto" },
  { id: "sob_consulta", rotulo: "Sob consulta" },
  { id: "fechado", rotulo: "Fechado" },
];

/** A semana de uma unidade: segunda primeiro, domingo por último. */
export function HorariosDaSemana({
  dias,
  onMudar,
}: {
  dias: DiaDaSemana[];
  onMudar: (dias: DiaDaSemana[]) => void;
}) {
  const ordem = [1, 2, 3, 4, 5, 6, 0];
  const mudar = (weekday: number, patch: Partial<DiaDaSemana>) =>
    onMudar(
      dias.map((d) => {
        if (d.weekday !== weekday) return d;
        const novo = { ...d, ...patch };
        if (novo.modo === "aberto") {
          novo.abre = novo.abre ?? "09:00";
          novo.fecha = novo.fecha ?? "18:00";
        }
        return novo;
      }),
    );
  return (
    <div className="grid gap-2">
      {ordem.map((w) => {
        const d = dias.find((x) => x.weekday === w);
        if (!d) return null;
        return (
          <div
            key={w}
            className="grid grid-cols-[5.5rem_1fr] items-center gap-2 rounded-2xl bg-muted/40 px-3 py-2 sm:grid-cols-[6rem_auto_1fr]"
          >
            <span className="text-sm font-medium">{NOMES[w]}</span>
            <div className="flex gap-1">
              {MODOS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => mudar(w, { modo: m.id })}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs transition",
                    d.modo === m.id
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  {m.rotulo}
                </button>
              ))}
            </div>
            {d.modo === "aberto" ? (
              <div className="col-span-2 flex items-center gap-2 sm:col-span-1 sm:justify-end">
                <Input
                  type="time"
                  className="h-8 w-28"
                  value={d.abre ?? ""}
                  onChange={(e) => mudar(w, { abre: e.target.value })}
                />
                <span className="text-xs text-muted-foreground">às</span>
                <Input
                  type="time"
                  className="h-8 w-28"
                  value={d.fecha ?? ""}
                  onChange={(e) => mudar(w, { fecha: e.target.value })}
                />
              </div>
            ) : (
              <span className="hidden text-right text-xs text-muted-foreground sm:block">
                {d.modo === "sob_consulta" ? "A assistente não oferece horário sozinha" : "—"}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
