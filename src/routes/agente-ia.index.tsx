import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  Check,
  Loader2,
  MessageSquare,
  Sparkles,
  Stethoscope,
  Trophy,
} from "lucide-react";
import { toast } from "sonner";
import { ResponsiveRouteState } from "@/components/layout/ResponsiveRouteState";
import { PageHeading } from "@/components/layout/PageHeading";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { getPipelineStages } from "@/lib/atendimentos/pipeline.functions";
import {
  aprenderAgora,
  getEstadoDoAgente,
  getPainelDoFunil,
  salvarConfiguracaoDoAgente,
} from "@/lib/agente-ia/agente.functions";
import { PainelDoFunil } from "@/components/agente-ia/PainelDoFunil";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/agente-ia/")({
  errorComponent: ({ error }) => (
    <ResponsiveRouteState
      error={error}
      title="Não foi possível carregar o agente"
      description="Tente novamente em instantes."
      semSidebar
    />
  ),
  notFoundComponent: () => <ResponsiveRouteState title="Página não encontrada" notFound semSidebar />,
  component: AgentePage,
});

/** Vendas para o manual parar de generalizar. Espelha `MINIMO_PARA_CONFIAR`
 *  da Edge Function — aqui só desenha a barra. */
const META_DE_APRENDIZADO = 3;

function AgentePage() {
  const queryClient = useQueryClient();
  const buscarEstado = useServerFn(getEstadoDoAgente);
  const buscarEtapas = useServerFn(getPipelineStages);
  const buscarPainel = useServerFn(getPainelDoFunil);
  const salvar = useServerFn(salvarConfiguracaoDoAgente);
  const aprender = useServerFn(aprenderAgora);

  const estadoQuery = useQuery({ queryKey: ["agente-ia"], queryFn: () => buscarEstado() });
  const etapasQuery = useQuery({ queryKey: ["pipeline-stages"], queryFn: () => buscarEtapas() });
  const painelQuery = useQuery({ queryKey: ["agente-ia-painel"], queryFn: () => buscarPainel() });
  const estado = estadoQuery.data;
  const etapas = etapasQuery.data?.stages ?? [];

  const [salvando, setSalvando] = useState(false);
  const invalidar = () => queryClient.invalidateQueries({ queryKey: ["agente-ia"] });

  const gravar = async (campos: Parameters<typeof salvar>[0]["data"]) => {
    setSalvando(true);
    try {
      await salvar({ data: campos });
      await invalidar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  };

  const alternarEtapa = (stageId: string) => {
    if (!estado) return;
    const atuais = new Set(estado.etapasDeVitoria);
    if (atuais.has(stageId)) atuais.delete(stageId);
    else atuais.add(stageId);
    void gravar({ etapasDeVitoria: [...atuais] });
  };

  const ligarDesligar = useMutation({
    mutationFn: (ligado: boolean) => salvar({ data: { ligado } }),
    onSuccess: (_r, ligado) => {
      invalidar();
      toast.success(ligado ? "Agente ativado" : "Agente pausado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rodarCiclo = useMutation({
    mutationFn: () => aprender(),
    onSuccess: (r) => {
      invalidar();
      queryClient.invalidateQueries({ queryKey: ["agente-ia-painel"] });
      if (r.aprendeu) toast.success(`Manual atualizado com ${r.novas} conversa(s) nova(s).`);
      else toast.info(r.motivo ?? "Nada novo para aprender.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Número, sempre. Foi assim que a tela chegou a escrever "undefined conversas
  // aprendidas": interpolar direto um campo que pode não ter vindo.
  const vendas = Number(estado?.vendas ?? 0) || 0;
  const semFonte =
    !!estado && !estado.aprenderDeGanhos && estado.etapasDeVitoria.length === 0;
  const progresso = Math.min(100, Math.round((vendas / META_DE_APRENDIZADO) * 100));
  const pronto = vendas >= META_DE_APRENDIZADO;

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 pb-28 pt-6 sm:px-6 lg:pb-10">
      <PageHeading
        icon={Sparkles}
        kicker="Agente de IA"
        title="Assistente"
        subtitle="Aprende a atender lendo as conversas que fecharam tratamento."
        actions={
          estado && (
            <div className="flex items-center gap-3 rounded-2xl border border-border bg-white/70 px-4 py-2.5">
              <span className="text-sm font-medium">{estado.ligado ? "Ativo" : "Pausado"}</span>
              <Switch
                checked={estado.ligado}
                onCheckedChange={(v) => ligarDesligar.mutate(v)}
                aria-label="Ativar o agente"
              />
            </div>
          )
        }
      />

      {estadoQuery.isPending ? (
        <div className="mt-10 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="mt-8 grid gap-4">
          {/* ── Prontidão ───────────────────────────────────────────────────
              A barra responde à única pergunta que importa antes de ligar:
              "dá para confiar nisso?". Abaixo da meta o manual existe, mas
              generaliza de pouca coisa — e esconder isso faria a clínica
              confiar cedo demais. */}
          <section className="rounded-3xl border border-border bg-white/70 p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-base font-semibold">
                  {pronto ? "Pronto para atender" : "Aprendendo"}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {vendas === 0
                    ? "Nenhuma conversa aprendida ainda."
                    : `${vendas} conversa${vendas === 1 ? "" : "s"} aprendida${vendas === 1 ? "" : "s"}` +
                      (pronto ? "." : ` · faltam ${META_DE_APRENDIZADO - vendas}.`)}
                </p>
              </div>
              <span className="shrink-0 text-3xl font-semibold tabular-nums">{vendas}</span>
            </div>

            <div
              className="mt-4 h-2 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuenow={vendas}
              aria-valuemin={0}
              aria-valuemax={META_DE_APRENDIZADO}
              aria-label="Conversas aprendidas"
            >
              <div
                className={cn(
                  "h-full rounded-full transition-[width] duration-500",
                  pronto ? "bg-gradient-primary" : "bg-coral/50",
                )}
                style={{ width: `${Math.max(progresso, vendas > 0 ? 8 : 0)}%` }}
              />
            </div>

            {/* De onde veio — responde "aprendeu com o quê?", que é a primeira
                pergunta quando o número surpreende. */}
            {vendas > 0 && (
              <p className="mt-3 text-xs text-muted-foreground">
                {estado?.porFonte.ganho ?? 0} marcada(s) como Ganho ·{" "}
                {estado?.porFonte.etapa ?? 0} por etapa do funil
              </p>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Button
                variant="premium"
                disabled={rodarCiclo.isPending || semFonte}
                onClick={() => rodarCiclo.mutate()}
              >
                {rodarCiclo.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Aprender agora
              </Button>
              {estado?.aprendidoEm && (
                <span className="text-xs text-muted-foreground">
                  Atualizado em {new Date(estado.aprendidoEm).toLocaleDateString("pt-BR")}
                </span>
              )}
            </div>
            {estado?.ultimoMotivo && (
              <p className="mt-3 text-sm text-muted-foreground">
                Última rodada: {estado.ultimoMotivo}.
              </p>
            )}
          </section>

          {/* ── De onde ele aprende ─────────────────────────────────────────
              Duas fontes. A de Ganho é a principal nesta clínica, porque o
              desfecho é marcado no chat e muitas vezes sem card no funil — ler
              só etapa deixava a maior parte das vitórias invisível. */}
          <section
            className={cn(
              "rounded-3xl border bg-white/70 p-6",
              semFonte ? "border-coral/40 ring-1 ring-coral/20" : "border-border",
            )}
          >
            <h2 className="text-base font-semibold">De onde ele aprende</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              O que conta como tratamento fechado.
            </p>

            <div className="mt-4 flex items-start justify-between gap-4 rounded-2xl bg-muted/60 px-4 py-3.5">
              <div className="flex min-w-0 items-start gap-3">
                <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-coral-soft text-coral">
                  <Trophy className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium">Conversas marcadas como Ganho</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Inclui as marcadas no chat, sem card no funil.
                  </p>
                </div>
              </div>
              <Switch
                checked={estado?.aprenderDeGanhos ?? true}
                disabled={salvando}
                onCheckedChange={(v) => void gravar({ aprenderDeGanhos: v })}
                aria-label="Aprender com conversas marcadas como Ganho"
              />
            </div>

            <div className="mt-4">
              <p className="text-sm font-medium">Etapas do funil que significam fechado</p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {etapas.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nenhuma etapa ainda —{" "}
                    <Link to="/atendimentos/pipeline" className="underline underline-offset-2">
                      configure o funil
                    </Link>
                    .
                  </p>
                ) : (
                  etapas.map((e) => {
                    const ativa = estado?.etapasDeVitoria.includes(e.id) ?? false;
                    return (
                      <button
                        key={e.id}
                        type="button"
                        disabled={salvando}
                        onClick={() => alternarEtapa(e.id)}
                        aria-pressed={ativa}
                        className={cn(
                          "press inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition",
                          ativa
                            ? "border-transparent bg-foreground text-white"
                            : "border-border bg-white text-foreground hover:bg-muted",
                        )}
                      >
                        {ativa && <Check className="h-3.5 w-3.5" />}
                        {e.name}
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {semFonte && (
              <p className="mt-4 rounded-xl bg-warning-soft px-3.5 py-2.5 text-sm">
                Sem nenhuma fonte ligada ele não tem o que aprender.
              </p>
            )}
          </section>

          <PainelDoFunil painel={painelQuery.data} carregando={painelQuery.isPending} />

          <div className="grid gap-4 sm:grid-cols-3">
            <Atalho
              to="/agente-ia/manual"
              icon={BookOpen}
              titulo="Manual"
              descricao="O método que ele aprendeu — e o que você corrigiu."
            />
            <Atalho
              to="/agente-ia/procedimentos"
              icon={Stethoscope}
              titulo="Procedimentos"
              descricao="O que ele pode citar e precificar."
            />
            <Atalho
              to="/agente-ia/atendimento"
              icon={MessageSquare}
              titulo="Atendimento"
              descricao="Como responde, com que ritmo — e o teste."
            />
          </div>
        </div>
      )}
    </main>
  );
}

function Atalho({
  to,
  icon: Icon,
  titulo,
  descricao,
}: {
  to: "/agente-ia/manual" | "/agente-ia/procedimentos" | "/agente-ia/atendimento";
  icon: typeof BookOpen;
  titulo: string;
  descricao: string;
}) {
  return (
    <Link
      to={to}
      className="press flex items-start gap-3.5 rounded-3xl border border-border bg-white/70 p-5 transition hover:bg-white"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-coral-soft text-coral">
        <Icon className="h-4.5 w-4.5" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{titulo}</span>
        <span className="mt-0.5 block text-sm text-muted-foreground">{descricao}</span>
      </span>
    </Link>
  );
}
