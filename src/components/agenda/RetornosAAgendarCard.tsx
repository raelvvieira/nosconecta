/* eslint-disable @typescript-eslint/no-explicit-any -- erro de mutação, padrão do restante da agenda. */
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CalendarPlus, MessageCircle, X } from "lucide-react";
import {
  dispensarRetorno,
  listarRetornosAAgendar,
  type RetornoDaLista,
} from "@/lib/agenda/retornos.functions";
import { agruparRetornos, prazoPorExtenso, urgenciaDoRetorno } from "@/lib/agenda/retornos";
import { normalizeBrazilianPhone } from "@/lib/atendimentos/phone";
import { clinicTodayStr } from "@/lib/date";
import { useUnitSelection } from "@/lib/settings/unit-context";
import { cn } from "@/lib/utils";

const COR_DA_URGENCIA = {
  atrasado: "bg-danger",
  semana: "bg-warning",
  mes: "bg-violet",
  depois: "bg-border",
} as const;

/**
 * "Retornos a agendar": quem a recepção precisa chamar, em ordem de data.
 *
 * Substitui os eventos de retorno que o sistema criava sozinho na agenda. Aqui
 * é um lembrete: nada ocupa horário até a pessoa combinar um dia — e só então
 * "Agendar" abre o formulário já preenchido.
 */
export function RetornosAAgendarCard({ onAgendar }: { onAgendar: (r: RetornoDaLista) => void }) {
  const qc = useQueryClient();
  const listarFn = useServerFn(listarRetornosAAgendar);
  const dispensarFn = useServerFn(dispensarRetorno);
  const { selectedUnitId } = useUnitSelection();
  const hoje = clinicTodayStr();

  const { data = [], isLoading } = useQuery({
    queryKey: ["retornos-a-agendar", selectedUnitId ?? null],
    queryFn: () => listarFn({ data: { unitId: selectedUnitId ?? undefined } }),
    staleTime: 30_000,
  });

  const dispensar = useMutation({
    mutationFn: (id: string) => dispensarFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Retorno dispensado");
      qc.invalidateQueries({ queryKey: ["retornos-a-agendar"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Não foi possível dispensar"),
  });

  const grupos = useMemo(() => agruparRetornos(data, hoje), [data, hoje]);
  const atrasados = data.filter((r) => r.data_prevista < hoje).length;

  return (
    <div className="surface-card p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <span className="text-sm font-semibold text-foreground">Retornos a agendar</span>
        {data.length > 0 && (
          <span className="text-2xs text-muted-foreground">
            {data.length} {data.length === 1 ? "paciente" : "pacientes"}
            {atrasados > 0 && <span className="text-danger"> · {atrasados} atrasados</span>}
          </span>
        )}
      </div>

      {isLoading ? (
        <p className="py-3 text-center text-xs text-muted-foreground">Carregando…</p>
      ) : data.length === 0 ? (
        <p className="py-3 text-center text-xs leading-5 text-muted-foreground">
          Ninguém para chamar agora. Ao concluir um atendimento com retorno, o paciente aparece aqui
          na data escolhida.
        </p>
      ) : (
        <div className="max-h-[26rem] space-y-4 overflow-y-auto pr-1">
          {grupos.map((g) => (
            <section key={g.chave}>
              <h4
                className={cn(
                  "mb-1.5 text-3xs font-semibold uppercase tracking-wider",
                  g.chave === "atrasados" ? "text-danger" : "text-muted-foreground",
                )}
              >
                {g.titulo}
              </h4>
              <ul className="space-y-1">
                {g.itens.map((r) => {
                  const urg = urgenciaDoRetorno(r.data_prevista, hoje);
                  const fone = r.phone ? normalizeBrazilianPhone(r.phone).replace(/\D/g, "") : "";
                  return (
                    <li
                      key={r.id}
                      className="group flex items-center gap-2.5 rounded-xl px-2 py-2 transition-colors hover:bg-surface"
                    >
                      <span
                        className={cn("h-2 w-2 shrink-0 rounded-full", COR_DA_URGENCIA[urg])}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-foreground">
                          {r.patient_name}
                        </p>
                        <p className="truncate text-2xs text-muted-foreground">
                          {r.data_prevista.split("-").reverse().slice(0, 2).join("/")} ·{" "}
                          {prazoPorExtenso(r.data_prevista, hoje)}
                          {r.procedure_name ? ` · ${r.procedure_name}` : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-0.5 opacity-70 transition-opacity group-hover:opacity-100">
                        {fone && (
                          <a
                            href={`https://wa.me/${fone}`}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={`Chamar ${r.patient_name} no WhatsApp`}
                            className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:bg-white hover:text-foreground"
                          >
                            <MessageCircle className="h-3.5 w-3.5" strokeWidth={2} />
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => onAgendar(r)}
                          aria-label={`Agendar retorno de ${r.patient_name}`}
                          className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:bg-white hover:text-foreground"
                        >
                          <CalendarPlus className="h-3.5 w-3.5" strokeWidth={2} />
                        </button>
                        <button
                          type="button"
                          disabled={dispensar.isPending}
                          onClick={() => dispensar.mutate(r.id)}
                          aria-label={`Dispensar retorno de ${r.patient_name}`}
                          className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:bg-white hover:text-danger"
                        >
                          <X className="h-3.5 w-3.5" strokeWidth={2} />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
