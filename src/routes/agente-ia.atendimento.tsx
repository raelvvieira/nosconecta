import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, KeyRound, Loader2, MessageSquare, Play } from "lucide-react";
import { toast } from "sonner";
import { ResponsiveRouteState } from "@/components/layout/ResponsiveRouteState";
import { PageHeading } from "@/components/layout/PageHeading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  getAtendimento,
  getEstadoDoAgente,
  salvarAtendimento,
  simularAtendimento,
} from "@/lib/agente-ia/agente.functions";
import { RegrasDeComportamento } from "@/components/agente-ia/RegrasDeComportamento";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/agente-ia/atendimento")({
  errorComponent: ({ error }) => (
    <ResponsiveRouteState
      error={error}
      title="Não foi possível carregar o atendimento"
      description="Tente novamente em instantes."
      semSidebar
    />
  ),
  notFoundComponent: () => (
    <ResponsiveRouteState title="Página não encontrada" notFound semSidebar />
  ),
  component: AtendimentoPage,
});

function AtendimentoPage() {
  const queryClient = useQueryClient();
  const buscar = useServerFn(getAtendimento);
  const buscarEstado = useServerFn(getEstadoDoAgente);
  const salvar = useServerFn(salvarAtendimento);
  const simular = useServerFn(simularAtendimento);

  const query = useQuery({ queryKey: ["agente-ia-atendimento"], queryFn: () => buscar() });
  const estadoQuery = useQuery({ queryKey: ["agente-ia"], queryFn: () => buscarEstado() });
  const config = query.data;

  const [eco, setEco] = useState("");
  const [texto, setTexto] = useState("");
  const [simulando, setSimulando] = useState(false);
  const [saida, setSaida] = useState<{
    respondeu: boolean;
    motivo?: string;
    enviados: { texto: string; esperaMs: number }[];
  } | null>(null);

  useEffect(() => {
    if (config) setEco(config.mensagemEco);
  }, [config]);

  const invalidar = () => queryClient.invalidateQueries({ queryKey: ["agente-ia-atendimento"] });

  const gravar = async (campos: Parameters<typeof salvar>[0]["data"]) => {
    try {
      await salvar({ data: campos });
      await invalidar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    }
  };

  const rodar = async () => {
    setSimulando(true);
    setSaida(null);
    try {
      setSaida(await simular({ data: { texto } }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "A simulação falhou.");
    } finally {
      setSimulando(false);
    }
  };

  const modoIa = config?.modo === "ia";
  const semChave = estadoQuery.data && !estadoQuery.data.temChave;
  const disjuntorAberto =
    config?.circuitoAbertoAte && new Date(config.circuitoAbertoAte) > new Date();

  return (
    <main className="w-full min-w-0 flex-1 px-4 pb-nav pt-7 sm:px-6 lg:px-10 lg:pb-10 lg:pt-9">
      <PageHeading
        className="pr-16 lg:pr-0"
        icon={MessageSquare}
        title="Atendimento"
        subtitle="Como ele responde, e com que ritmo."
      />

      {query.isPending ? (
        <div className="mt-10 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="mt-8 grid gap-4">
          {disjuntorAberto && (
            <p className="flex items-center gap-2.5 rounded-2xl bg-warning-soft px-4 py-3 text-sm">
              <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
              Pausado automaticamente após falhas seguidas. Volta sozinho em instantes.
            </p>
          )}

          {/* Duas pilhas, e não um grid de quatro células: as seções têm
              alturas bem diferentes, e num grid comum a linha inteira cresce
              até a mais alta, deixando buraco embaixo da menor. */}
          <div className="grid gap-4 xl:grid-cols-2 xl:items-start">
            <div className="grid gap-4">
              {/* ── Modo ────────────────────────────────────────────────────────
              Eco existe para provar o contrato antes de envolver o modelo:
              vínculo, entrega, autenticação, criação da mensagem. Com isso de
              pé, trocar a frase fixa pela IA é a parte fácil — e nunca se
              depura contrato e prompt ao mesmo tempo. */}
              <section className="rounded-3xl border border-border bg-white/70 p-6">
                <h2 className="text-base font-semibold">Como ele responde</h2>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <BotaoDeModo
                    ativo={!modoIa}
                    titulo="Frase fixa"
                    descricao="Sempre a mesma resposta. Prova o caminho sem gastar IA."
                    onClick={() => void gravar({ modo: "eco" })}
                  />
                  <BotaoDeModo
                    ativo={modoIa}
                    titulo="Inteligência"
                    descricao="Responde pelo manual aprendido."
                    onClick={() => void gravar({ modo: "ia" })}
                  />
                </div>

                {!modoIa && (
                  <div className="mt-4">
                    <label className="text-xs font-medium text-muted-foreground">A frase</label>
                    <Input
                      value={eco}
                      onChange={(e) => setEco(e.target.value)}
                      onBlur={() =>
                        eco !== config?.mensagemEco && void gravar({ mensagemEco: eco })
                      }
                      className="mt-1.5"
                    />
                  </div>
                )}

                {modoIa && semChave && (
                  <p className="mt-4 flex items-center gap-2.5 rounded-2xl bg-warning-soft px-4 py-3 text-sm">
                    <KeyRound className="h-4 w-4 shrink-0 text-warning" />
                    Falta a chave da IA — Lovable → Cloud → Secrets → ANTHROPIC_API_KEY.
                  </p>
                )}
              </section>

              {/* ── Ritmo ───────────────────────────────────────────────────────
              Não é enfeite: um agente que responde em 200 ms com oito
              parágrafos se denuncia por melhor que seja o texto. */}
              <section className="rounded-3xl border border-border bg-white/70 p-6">
                <h2 className="text-base font-semibold">Ritmo</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  O que faz parecer alguém digitando, e não um sistema respondendo.
                </p>

                <div className="mt-5 grid gap-4">
                  <Campo
                    rotulo="Esperar antes de responder"
                    sufixo="s"
                    valor={config?.debounceSegundos ?? 5}
                    dica="Deixa a pessoa terminar de escrever quando manda várias mensagens seguidas."
                    onSalvar={(v) => void gravar({ debounceSegundos: v })}
                  />
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">Quebrar respostas longas</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Em mensagens menores, como uma pessoa faria.
                      </p>
                    </div>
                    <Switch
                      checked={config?.segmentar ?? true}
                      onCheckedChange={(v) => void gravar({ segmentar: v })}
                      aria-label="Quebrar respostas longas"
                    />
                  </div>
                  {config?.segmentar && (
                    <>
                      <Campo
                        rotulo="Máximo por mensagem"
                        sufixo="caracteres"
                        valor={config?.limite ?? 300}
                        onSalvar={(v) => void gravar({ limite: v })}
                      />
                      <Campo
                        rotulo="Mínimo por mensagem"
                        sufixo="caracteres"
                        valor={config?.minimo ?? 50}
                        dica="Abaixo disso, o pedaço se junta ao anterior em vez de sair sozinho."
                        onSalvar={(v) => void gravar({ minimo: v })}
                      />
                    </>
                  )}
                  <Campo
                    rotulo="Tempo de digitação"
                    sufixo="ms por caractere"
                    valor={config?.msPorCaractere ?? 50}
                    onSalvar={(v) => void gravar({ msPorCaractere: v })}
                  />
                </div>
              </section>
            </div>

            <div className="grid gap-4">
              <RegrasDeComportamento regras={config?.regras ?? []} />

              {/* ── Simulação ───────────────────────────────────────────────────
              Passa pelo MESMO caminho do atendimento real — filtros, modelo,
              segmentação. O que muda é só o destino: nada sai daqui. */}
              <section className="rounded-3xl border border-border bg-white/70 p-6">
                <h2 className="text-base font-semibold">Testar</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Escreva como um paciente escreveria. Nada é enviado a ninguém.
                </p>
                <div className="mt-4 flex gap-2">
                  <Input
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && texto.trim() && void rodar()}
                    placeholder="Oi, quanto custa a limpeza?"
                  />
                  <Button
                    variant="premium"
                    disabled={simulando || !texto.trim()}
                    onClick={() => void rodar()}
                  >
                    {simulando ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                  </Button>
                </div>

                {saida && (
                  <div className="mt-5">
                    {saida.respondeu ? (
                      <div className="grid gap-2">
                        {saida.enviados.map((m, i) => (
                          <div key={i} className="flex justify-end">
                            <div className="max-w-[80%] rounded-2xl bg-gradient-primary px-4 py-2.5 text-sm text-white">
                              {m.texto}
                              <span className="mt-1 block text-2xs text-white/70">
                                após {(m.esperaMs / 1000).toFixed(1)}s digitando
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="rounded-2xl bg-muted px-4 py-3 text-sm text-muted-foreground">
                        Não respondeu — {saida.motivo}.
                      </p>
                    )}
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function BotaoDeModo({
  ativo,
  titulo,
  descricao,
  onClick,
}: {
  ativo: boolean;
  titulo: string;
  descricao: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={cn(
        "press rounded-2xl border p-4 text-left transition",
        ativo
          ? "border-transparent bg-foreground text-white"
          : "border-border bg-white hover:bg-muted",
      )}
    >
      <span className="block text-sm font-semibold">{titulo}</span>
      <span
        className={cn("mt-0.5 block text-xs", ativo ? "text-white/70" : "text-muted-foreground")}
      >
        {descricao}
      </span>
    </button>
  );
}

function Campo({
  rotulo,
  sufixo,
  valor,
  dica,
  onSalvar,
}: {
  rotulo: string;
  sufixo: string;
  valor: number;
  dica?: string;
  onSalvar: (v: number) => void;
}) {
  const [rascunho, setRascunho] = useState(String(valor));
  useEffect(() => setRascunho(String(valor)), [valor]);
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium">{rotulo}</p>
        {dica && <p className="mt-0.5 text-xs text-muted-foreground">{dica}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Input
          type="number"
          value={rascunho}
          onChange={(e) => setRascunho(e.target.value)}
          onBlur={() => {
            const n = Number(rascunho);
            // O servidor tem os limites; aqui só evita mandar lixo.
            if (Number.isFinite(n) && n !== valor) onSalvar(n);
            else setRascunho(String(valor));
          }}
          className="w-20 text-right tabular-nums"
        />
        <span className="text-xs text-muted-foreground">{sufixo}</span>
      </div>
    </div>
  );
}
