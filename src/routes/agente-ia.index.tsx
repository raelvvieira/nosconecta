import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, MessagesSquare, Sparkles, Trophy } from "lucide-react";
import { toast } from "sonner";
import { ResponsiveRouteState } from "@/components/layout/ResponsiveRouteState";
import { PageHeading } from "@/components/layout/PageHeading";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { getPipelineStages } from "@/lib/atendimentos/pipeline.functions";
import {
  aprenderAgora,
  getAtendimento,
  getEstadoDoAgente,
  getPainelDoFunil,
  salvarConfiguracaoDoAgente,
} from "@/lib/agente-ia/agente.functions";
import { PainelDoFunil } from "@/components/agente-ia/PainelDoFunil";
import { RegrasDeComportamento } from "@/components/agente-ia/RegrasDeComportamento";
import { ChaveDaIa } from "@/components/agente-ia/ChaveDaIa";
import { ComoResponde } from "@/components/agente-ia/ComoResponde";
import { ComQuemFala } from "@/components/agente-ia/ComQuemFala";
import { Ritmo } from "@/components/agente-ia/Ritmo";
import { Testar } from "@/components/agente-ia/Testar";
import { Procedimentos } from "@/components/agente-ia/Procedimentos";
import { OQueAprendeu } from "@/components/agente-ia/OQueAprendeu";
import { Bloco } from "@/components/agente-ia/campos";
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
  notFoundComponent: () => (
    <ResponsiveRouteState title="Página não encontrada" notFound semSidebar />
  ),
  component: AgentePage,
});

/** Conversas para o manual parar de generalizar. Espelha `MINIMO_PARA_CONFIAR`
 *  da Edge Function — aqui só desenha a barra. */
const META_DE_APRENDIZADO = 3;

/**
 * A página do Agente de IA — tudo sobre ele, num lugar só.
 *
 * ── Por que deixou de ter submenu ──────────────────────────────────────
 *
 * Era dividida em quatro: Agente, Aprendizado, Atendimento e Procedimentos.
 * Parecia organizado e escondia coisa. O caso concreto: a chave da IA morava
 * em "Atendimento", DENTRO do modo Inteligência — então uma clínica em modo
 * frase fixa, que é o padrão, não tinha onde cadastrá-la. Para achar o campo
 * era preciso adivinhar a aba e depois mudar o comportamento do agente só
 * para digitar uma senha.
 *
 * Agora é uma página só, na ordem em que as perguntas aparecem: primeiro o
 * que liga a IA (a chave), depois o que ela sabe (aprendizado), depois como e
 * com quem ela fala, e por último o que ela pode citar e como testar.
 *
 * Cada bloco mora no seu arquivo em `src/components/agente-ia/` — a página só
 * compõe. Foi o que evitou um arquivo de mil e trezentas linhas ao juntar as
 * quatro telas.
 */
function AgentePage() {
  const queryClient = useQueryClient();
  const buscarEstado = useServerFn(getEstadoDoAgente);
  const buscarEtapas = useServerFn(getPipelineStages);
  const buscarPainel = useServerFn(getPainelDoFunil);
  const buscarAtendimento = useServerFn(getAtendimento);
  const salvar = useServerFn(salvarConfiguracaoDoAgente);
  const aprender = useServerFn(aprenderAgora);

  const estadoQuery = useQuery({ queryKey: ["agente-ia"], queryFn: () => buscarEstado() });
  const etapasQuery = useQuery({ queryKey: ["pipeline-stages"], queryFn: () => buscarEtapas() });
  const painelQuery = useQuery({ queryKey: ["agente-ia-painel"], queryFn: () => buscarPainel() });
  const atendimentoQuery = useQuery({
    queryKey: ["agente-ia-atendimento"],
    queryFn: () => buscarAtendimento(),
  });
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
      if (r.aprendeu) toast.success(`Leu ${r.novas} conversa(s) e atualizou o aprendizado.`);
      else toast.info(r.motivo ?? "Nada novo para aprender.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Número, sempre. Foi assim que a tela chegou a escrever "undefined conversas
  // aprendidas": interpolar direto um campo que pode não ter vindo.
  const vendas = Number(estado?.vendas ?? 0) || 0;
  const conversas = Number(estado?.conversas ?? 0) || 0;

  // O que sustenta o manual é a soma: venda marcada no funil MAIS conversa real
  // do espelho. Antes isto era só `vendas`, e com o funil vazio a barra ficaria
  // em zero para sempre — inclusive depois de ele aprender com vinte conversas.
  const fontes = vendas + conversas;
  const progresso = Math.min(100, Math.round((fontes / META_DE_APRENDIZADO) * 100));
  const pronto = fontes >= META_DE_APRENDIZADO;
  const semFonteDoFunil =
    !!estado && !estado.aprenderDeGanhos && estado.etapasDeVitoria.length === 0;

  const config = atendimentoQuery.data;
  const disjuntorAberto =
    config?.circuitoAbertoAte && new Date(config.circuitoAbertoAte) > new Date();

  return (
    <main className="w-full min-w-0 flex-1 px-4 pb-nav pt-7 sm:px-6 lg:px-10 lg:pb-10 lg:pt-9">
      <PageHeading
        className="pr-16 lg:pr-0"
        icon={Sparkles}
        title="Agente de IA"
        subtitle="Aprende a atender lendo as conversas reais da clínica."
        actions={
          estado && (
            <div className="flex items-center gap-3 rounded-2xl border border-border bg-white/70 px-4 py-2.5">
              <span className="text-sm font-medium">{estado.ligado ? "Ativo" : "Pausado"}</span>
              <Switch
                checked={estado.ligado}
                disabled={ligarDesligar.isPending}
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
          {disjuntorAberto && (
            <p className="flex items-center gap-2.5 rounded-2xl bg-warning-soft px-4 py-3 text-sm">
              <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
              Pausado automaticamente após falhas seguidas. Volta sozinho em instantes.
            </p>
          )}

          {/* ── 1. A chave ──────────────────────────────────────────────────
              Primeiro de tudo porque é o que destrava o resto: sem ela a IA
              não responde e as sugestões não aparecem no chat. */}
          <ChaveDaIa />

          {/* ── 2. O aprendizado ────────────────────────────────────────────
              Duas pilhas, e não um grid de quatro células: as seções têm
              alturas bem diferentes, e num grid comum a linha inteira cresce
              até a mais alta, deixando buraco embaixo da menor. */}
          <div className="grid gap-4 xl:grid-cols-2 xl:items-start">
            <Bloco
              titulo={pronto ? "Pronta para atender" : "Aprendendo"}
              descricao={
                fontes === 0
                  ? "Nenhuma conversa aprendida ainda."
                  : `${fontes} conversa${fontes === 1 ? "" : "s"} aprendida${fontes === 1 ? "" : "s"}` +
                    (pronto ? "." : ` · faltam ${META_DE_APRENDIZADO - fontes}.`)
              }
              acao={<span className="shrink-0 text-3xl font-semibold tabular-nums">{fontes}</span>}
            >
              <div
                className="h-2 overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-valuenow={fontes}
                aria-valuemin={0}
                aria-valuemax={META_DE_APRENDIZADO}
                aria-label="Conversas aprendidas"
              >
                <div
                  className={cn(
                    "h-full rounded-full transition-[width] duration-500",
                    pronto ? "bg-gradient-primary" : "bg-coral/50",
                  )}
                  style={{ width: `${Math.max(progresso, fontes > 0 ? 8 : 0)}%` }}
                />
              </div>

              {/* De onde veio — responde "aprendeu com o quê?", que é a
                  primeira pergunta quando o número surpreende. */}
              {fontes > 0 && (
                <p className="mt-3 text-xs text-muted-foreground">
                  {[
                    (estado?.porFonte.paciente ?? 0) > 0 &&
                      `${estado?.porFonte.paciente} que viraram paciente`,
                    (estado?.porFonte.conversa ?? 0) > 0 &&
                      `${estado?.porFonte.conversa} com troca real`,
                    (estado?.porFonte.ganho ?? 0) > 0 &&
                      `${estado?.porFonte.ganho} marcada(s) como Ganho`,
                    (estado?.porFonte.etapa ?? 0) > 0 &&
                      `${estado?.porFonte.etapa} por etapa do funil`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <Button
                  variant="premium"
                  disabled={rodarCiclo.isPending}
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
                <p className="mt-3 text-xs text-muted-foreground">
                  Última rodada: {estado.ultimoMotivo}.
                </p>
              )}
            </Bloco>

            {/* ── De onde ele aprende ───────────────────────────────────────
                Três fontes, e a ordem importa: as duas do funil são escolha da
                clínica (dá para desligar), a das conversas é sempre. */}
            <Bloco
              titulo="De onde ela aprende"
              descricao="Ela sempre lê as conversas reais. Abaixo, o que conta como tratamento fechado."
              className={semFonteDoFunil ? "border-coral/40 ring-1 ring-coral/20" : undefined}
            >
              {/* A fonte que não tem interruptor. Fica em primeiro porque é a
                  que está sustentando o manual hoje — esconder isso faria a
                  clínica achar que o funil é que está ensinando. */}
              <div className="flex items-start gap-3 rounded-2xl bg-success-soft px-4 py-3.5">
                <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-white/70 text-success">
                  <MessagesSquare className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium">As conversas do WhatsApp</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    As que tiveram troca dos dois lados, começando pelas de quem virou paciente.
                  </p>
                </div>
              </div>

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
                            "press rounded-full border px-3.5 py-1.5 text-sm transition",
                            ativa
                              ? "border-transparent bg-foreground text-white"
                              : "border-border bg-white hover:bg-muted",
                          )}
                        >
                          {e.name}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {semFonteDoFunil && (
                <p className="mt-4 rounded-xl bg-warning-soft px-3.5 py-2.5 text-sm">
                  Nenhuma fonte do funil ligada — ela aprende só pelas conversas.
                </p>
              )}
            </Bloco>
          </div>

          {/* ── 3. Como ela atende ──────────────────────────────────────────
              Modo, destinatário e ritmo de um lado; o que ela pode fazer e o
              teste do outro. */}
          <div className="grid gap-4 xl:grid-cols-2 xl:items-start">
            <div className="grid gap-4">
              <ComoResponde />
              <ComQuemFala />
              <Ritmo />
            </div>
            <div className="grid gap-4">
              <RegrasDeComportamento regras={config?.regras ?? []} />
              <Testar />
            </div>
          </div>

          {/* ── 4. O que ela pode citar ─────────────────────────────────── */}
          <Procedimentos />

          {/* ── 5. O que ela aprendeu ────────────────────────────────────
              Por último porque é o mais longo e o mais lido — acima dele fica
              tudo que se AJUSTA, aqui o que se LÊ. */}
          <OQueAprendeu />

          {/* ── 6. O funil ─────────────────────────────────────────────── */}
          <PainelDoFunil painel={painelQuery.data} carregando={painelQuery.isPending} />
        </div>
      )}
    </main>
  );
}
