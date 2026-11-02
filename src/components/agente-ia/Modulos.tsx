import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, GraduationCap, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  getModulos,
  ligarModulo,
  MODULOS,
  type EstadoLigado,
  type Modulo,
} from "@/lib/agente-ia/modulos.functions";

const ESTADOS: { id: EstadoLigado; rotulo: string; ajuda: string }[] = [
  { id: "desligado", rotulo: "Desligado", ajuda: "Nenhuma conversa usa o módulo." },
  {
    id: "teste",
    rotulo: "Só no teste",
    ajuda: "O módulo vale só na tela Testar. Nenhum paciente recebe nada dele.",
  },
  { id: "ligado", rotulo: "Ligado", ajuda: "Vale para as conversas reais de paciente modelo." },
];
import { Ajuda } from "./campos";

// A aba Módulos: capacidades comerciais que a Luna liga por cima do manual.
// Cada módulo tem cadastro próprio, e a seção dele só entra numa conversa do
// público certo (ver `_shared/modulo-paciente-modelo.ts`).

function diaCurto(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

export function Modulos() {
  const queryClient = useQueryClient();
  const buscar = useServerFn(getModulos);
  const ligar = useServerFn(ligarModulo);
  const query = useQuery({ queryKey: ["agente-modulos"], queryFn: () => buscar() });
  const alternar = useMutation({
    mutationFn: (v: { modulo: Modulo; estado: EstadoLigado }) => ligar({ data: v }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["agente-modulos"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const d = query.data;
  if (d?.indisponivel) {
    return (
      <section className="rounded-3xl border border-border/70 bg-card p-5 text-sm text-muted-foreground shadow-1">
        Os módulos ainda não estão ativados neste banco.
      </section>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-2">
        <h2 className="text-[15px] font-semibold tracking-[-0.01em]">Módulos da assistente</h2>
        <Ajuda texto="Capacidades específicas que a assistente liga por cima do manual. Cada módulo tem cadastro próprio: você cadastra a edição e a assistente passa a conhecer datas, local, valores e regras de reserva, sem mexer no manual." />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {MODULOS.map((m) => {
          const estado = d?.modulos.find((x) => x.modulo === m.id);
          const posicao: EstadoLigado = estado?.estado ?? "desligado";
          const ativo = posicao !== "desligado";
          const ePaciente = m.id === "paciente_modelo";
          const Icone = ePaciente ? Sparkles : GraduationCap;
          return (
            <section
              key={m.id}
              className={cn(
                "flex flex-col rounded-3xl border bg-card p-5 shadow-1",
                ativo ? "border-primary/40" : "border-border/70",
              )}
            >
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    "grid h-10 w-10 shrink-0 place-items-center rounded-2xl",
                    ativo ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                  )}
                >
                  <Icone className="h-5 w-5" strokeWidth={1.75} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold tracking-tight">{m.nome}</p>
                  <p className="text-xs text-muted-foreground">{m.resumo}</p>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2.5 py-1 text-2xs font-medium",
                    posicao === "ligado"
                      ? "bg-success-soft text-success"
                      : posicao === "teste"
                        ? "bg-warning-soft text-warning"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  {ESTADOS.find((e) => e.id === posicao)?.rotulo}
                </span>
              </div>

              {ePaciente ? (
                <dl className="mt-4 grid grid-cols-3 gap-3 text-xs">
                  <div>
                    <dt className="text-muted-foreground">Edição aberta</dt>
                    <dd className="mt-0.5 font-medium">
                      {d?.edicaoAberta
                        ? `${d.edicaoAberta.cidade ?? d.edicaoAberta.nome}${d.edicaoAberta.dias.length ? ` · ${d.edicaoAberta.dias.map(diaCurto).join(", ")}` : ""}`
                        : d?.proximaEdicao
                          ? `Próxima: ${d.proximaEdicao.nome}`
                          : "Nenhuma"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Vagas restantes</dt>
                    <dd className="mt-0.5 font-medium tabular-nums">
                      {d?.edicaoAberta ? d.edicaoAberta.vagasRestantes : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Pagamento a conferir</dt>
                    <dd
                      className={cn(
                        "mt-0.5 font-medium tabular-nums",
                        (d?.emAnalise ?? 0) > 0 && "text-warning",
                      )}
                    >
                      {d?.emAnalise ?? 0}
                      {(d?.sinaisPendentes ?? 0) > 0 && (
                        <span className="ml-1 text-2xs font-normal text-muted-foreground">
                          · {d?.sinaisPendentes} aguardando sinal
                        </span>
                      )}
                    </dd>
                  </div>
                </dl>
              ) : (
                <p className="mt-4 text-xs text-muted-foreground">
                  Turmas, matrículas e material para profissionais. Usa as mesmas edições do módulo
                  Paciente Modelo. Em construção: por enquanto, ligar este módulo só marca as
                  conversas de profissionais no Pipeline.
                </p>
              )}

              {ePaciente && ativo && (d?.conflito.length ?? 0) > 0 && (
                <p className="mt-3 rounded-xl bg-danger-soft px-3 py-2 text-xs text-danger">
                  Duas edições com inscrições abertas ({d?.conflito.join(" e ")}). A assistente não
                  vende até sobrar uma.
                </p>
              )}
              {ePaciente && ativo && (estado?.bloqueios.length ?? 0) > 0 && (
                <p className="mt-3 rounded-xl bg-warning-soft px-3 py-2 text-xs text-warning">
                  Cobrança bloqueada: falta {estado?.bloqueios.join(", ")}.
                </p>
              )}
              {ePaciente && ativo && !d?.edicaoAberta && !(d?.conflito.length ?? 0) && (
                <p className="mt-3 rounded-xl bg-warning-soft px-3 py-2 text-xs text-warning">
                  Sem edição com inscrições abertas: a assistente diz que não há vaga agora e
                  oferece a lista de interesse.
                </p>
              )}

              <div className="mt-auto flex items-center justify-between gap-3 pt-5">
                <div
                  role="group"
                  aria-label={`Estado de ${m.nome}`}
                  className="flex rounded-full border border-border/70 bg-card p-0.5"
                >
                  {ESTADOS.map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      title={e.ajuda}
                      disabled={alternar.isPending || !d}
                      aria-pressed={posicao === e.id}
                      onClick={() => alternar.mutate({ modulo: m.id, estado: e.id })}
                      className={cn(
                        "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                        posicao === e.id
                          ? "bg-foreground text-white"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {e.rotulo}
                    </button>
                  ))}
                </div>
                {ePaciente && (
                  <Button asChild variant="outline" className="h-9 gap-1.5 rounded-full">
                    <Link to="/agente-ia/modulos/paciente-modelo">
                      Gerenciar módulo
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
