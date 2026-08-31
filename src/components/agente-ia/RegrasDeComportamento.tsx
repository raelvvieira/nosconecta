import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  excluirRegra,
  salvarRegra,
  type RegraDeComportamento,
} from "@/lib/agente-ia/agente.functions";

/** Os quatro tipos, e o que cada um resolve — em linguagem de quem atende. */
const TIPOS = [
  {
    tipo: "transferencia" as const,
    titulo: "Passar para uma pessoa",
    exemplo: "Quando o paciente falar em convênio, passe para a recepção.",
    ajuda: "Situações além das que já são obrigatórias.",
  },
  {
    tipo: "inatividade" as const,
    titulo: "Quando ninguém responde",
    exemplo: "Pergunte se ainda tem interesse.",
    ajuda: "Depois de um tempo em silêncio.",
  },
  {
    tipo: "contato" as const,
    titulo: "Atualizar o cadastro",
    exemplo: "Se o paciente disser o nome completo, salve no cadastro.",
    ajuda: "Deixe desligado se não quiser que ele edite dados.",
  },
  {
    tipo: "pipeline" as const,
    titulo: "Mover no funil",
    exemplo: "Quando o paciente confirmar o horário, mova para Agendado.",
    ajuda: "",
  },
];

/**
 * As regras que a clínica escreve — o irmão configurável das regras de repasse.
 *
 * As de repasse (pedir uma pessoa, irritação, dinheiro fora do padrão, saúde)
 * são fixas em código e não aparecem aqui: elas dizem quando o agente PRECISA
 * parar. Estas dizem o que a clínica QUER que ele faça. Misturar as duas na
 * mesma tela sugeriria que as primeiras também são editáveis.
 */
export function RegrasDeComportamento({ regras }: { regras: RegraDeComportamento[] }) {
  const queryClient = useQueryClient();
  const salvar = useServerFn(salvarRegra);
  const excluir = useServerFn(excluirRegra);
  const [abertoEm, setAbertoEm] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState("");
  const [minutos, setMinutos] = useState("60");

  const invalidar = () => queryClient.invalidateQueries({ queryKey: ["agente-ia-atendimento"] });

  const criar = async (tipo: RegraDeComportamento["tipo"]) => {
    try {
      await salvar({
        data: {
          tipo,
          instrucao: rascunho,
          ...(tipo === "inatividade"
            ? { aposMinutos: Number(minutos) || 60, acao: "cutucar" as const }
            : {}),
        },
      });
      await invalidar();
      setAbertoEm(null);
      setRascunho("");
      toast.success("Regra criada — ligue quando quiser que ela valha.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível criar.");
    }
  };

  const alternar = async (r: RegraDeComportamento, ativa: boolean) => {
    try {
      await salvar({ data: { id: r.id, tipo: r.tipo, ativa } });
      await invalidar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    }
  };

  const remover = async (id: string) => {
    try {
      await excluir({ data: { id } });
      await invalidar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível excluir.");
    }
  };

  return (
    <section className="rounded-3xl border border-border bg-white/70 p-6">
      <h2 className="text-base font-semibold">O que ele pode fazer</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Escreva em português. Toda regra nasce desligada.
      </p>

      <div className="mt-5 grid gap-3">
        {TIPOS.map(({ tipo, titulo, exemplo, ajuda }) => {
          const doTipo = regras.filter((r) => r.tipo === tipo);
          const abrindo = abertoEm === tipo;
          return (
            <div key={tipo} className="rounded-2xl border border-border bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{titulo}</p>
                  {ajuda && <p className="mt-0.5 text-xs text-muted-foreground">{ajuda}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setAbertoEm(abrindo ? null : tipo);
                    setRascunho("");
                  }}
                  className="press grid h-8 w-8 shrink-0 place-items-center rounded-xl text-muted-foreground hover:bg-muted"
                  aria-label={`Adicionar regra de ${titulo}`}
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>

              {/* A armadilha registrada na migration: o coletor de aprendizado
                  procura cards que entraram numa etapa de vitória. Um agente que
                  move card sozinho gera a própria matéria-prima de treino — e se
                  marcar como ganho o que não foi, aprende com o próprio erro. */}
              {tipo === "pipeline" && (
                <p className="mt-3 flex items-start gap-2 rounded-xl bg-warning-soft px-3 py-2 text-xs">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                  <span>
                    Card movido pelo agente vira matéria-prima do aprendizado. Se ele marcar como
                    fechado o que não fechou, aprende com o próprio engano.
                  </span>
                </p>
              )}

              {doTipo.length > 0 && (
                <ul className="mt-3 grid gap-2">
                  {doTipo.map((r) => (
                    <li
                      key={r.id}
                      className="flex items-start gap-3 rounded-xl bg-muted/60 px-3.5 py-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm leading-5">{r.instrucao || "(sem instrução)"}</p>
                        {r.tipo === "inatividade" && r.aposMinutos && (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            após {r.aposMinutos} min · {r.acao === "encerrar" ? "encerrar" : "cutucar"}
                          </p>
                        )}
                      </div>
                      <Switch
                        checked={r.ativa}
                        onCheckedChange={(v) => void alternar(r, v)}
                        aria-label="Ligar regra"
                      />
                      <button
                        type="button"
                        onClick={() => void remover(r.id)}
                        className="press grid h-7 w-7 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-white"
                        aria-label="Excluir regra"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {abrindo && (
                <div className="mt-3 grid gap-2">
                  {tipo === "inatividade" && (
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        value={minutos}
                        onChange={(e) => setMinutos(e.target.value)}
                        className="w-20 text-right tabular-nums"
                      />
                      <span className="text-xs text-muted-foreground">minutos em silêncio</span>
                    </div>
                  )}
                  <Textarea
                    value={rascunho}
                    onChange={(e) => setRascunho(e.target.value)}
                    rows={2}
                    className="resize-none"
                    placeholder={exemplo}
                  />
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => setAbertoEm(null)}>
                      Cancelar
                    </Button>
                    <Button
                      variant="premium"
                      size="sm"
                      disabled={!rascunho.trim()}
                      onClick={() => void criar(tipo)}
                    >
                      Criar
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
