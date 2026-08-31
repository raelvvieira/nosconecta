import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Check, Loader2, MessageSquare, Sparkles, Stethoscope } from "lucide-react";
import { toast } from "sonner";
import { ResponsiveRouteState } from "@/components/layout/ResponsiveRouteState";
import { PageHeading } from "@/components/layout/PageHeading";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { getPipelineStages } from "@/lib/atendimentos/pipeline.functions";
import {
  aprenderAgora,
  getEstadoDoAgente,
  salvarConfiguracaoDoAgente,
} from "@/lib/agente-ia/agente.functions";
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

function AgentePage() {
  const queryClient = useQueryClient();
  const buscarEstado = useServerFn(getEstadoDoAgente);
  const buscarEtapas = useServerFn(getPipelineStages);
  const salvar = useServerFn(salvarConfiguracaoDoAgente);
  const aprender = useServerFn(aprenderAgora);

  const estadoQuery = useQuery({ queryKey: ["agente-ia"], queryFn: () => buscarEstado() });
  const etapasQuery = useQuery({ queryKey: ["pipeline-stages"], queryFn: () => buscarEtapas() });
  const estado = estadoQuery.data;
  const etapas = etapasQuery.data?.stages ?? [];

  const [salvando, setSalvando] = useState(false);
  const invalidar = () => queryClient.invalidateQueries({ queryKey: ["agente-ia"] });

  const alternarEtapa = async (stageId: string) => {
    if (!estado) return;
    const atuais = new Set(estado.etapasDeVitoria);
    if (atuais.has(stageId)) atuais.delete(stageId);
    else atuais.add(stageId);
    setSalvando(true);
    try {
      await salvar({ data: { etapasDeVitoria: [...atuais] } });
      await invalidar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
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
      if (r.aprendeu) toast.success(`Manual atualizado com ${r.novas} venda(s) nova(s).`);
      else toast.info(r.motivo ?? "Nada novo para aprender.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const semEtapas = (estado?.etapasDeVitoria.length ?? 0) === 0;

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 pb-28 pt-6 sm:px-6 lg:pb-10">
      <PageHeading
        icon={Sparkles}
        kicker="Agente de IA"
        title="Assistente"
        subtitle="Aprende a atender lendo as conversas que viraram tratamento."
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
          {/* ── O único ajuste obrigatório ─────────────────────────────────
              Sem etapa de vitória o coletor não sabe o que procurar e o manual
              nasce vazio. Por isso é a primeira coisa da página, e o resto fica
              apagado até ela estar resolvida. */}
          <section
            className={cn(
              "rounded-3xl border bg-white/70 p-6",
              semEtapas ? "border-coral/40 ring-1 ring-coral/20" : "border-border",
            )}
          >
            <h2 className="text-base font-semibold">O que significa “fechou”</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              As etapas do funil em que um paciente conta como tratamento fechado.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {etapas.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Nenhuma etapa ainda —{" "}
                  <Link to="/atendimentos/pipeline" className="underline underline-offset-2">
                    configure o funil
                  </Link>
                  .
                </p>
              )}
              {etapas.map((e) => {
                const ativa = estado?.etapasDeVitoria.includes(e.id) ?? false;
                return (
                  <button
                    key={e.id}
                    type="button"
                    disabled={salvando}
                    onClick={() => void alternarEtapa(e.id)}
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
              })}
            </div>
          </section>

          {/* ── Quanta base sustenta o manual ─────────────────────────────── */}
          <section className="rounded-3xl border border-border bg-white/70 p-6">
            <div className="flex items-baseline justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold">Aprendizado</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {estado?.vendas === 0
                    ? "Nenhuma conversa aprendida ainda."
                    : `${estado?.vendas} conversa${estado?.vendas === 1 ? "" : "s"} aprendida${estado?.vendas === 1 ? "" : "s"}.`}
                </p>
              </div>
              <span className="text-3xl font-semibold tabular-nums">{estado?.vendas ?? 0}</span>
            </div>

            {/* A honestidade importa mais que o número: abaixo de três vendas o
                manual existe, mas está generalizando de pouca coisa. Esconder
                isso faria a clínica confiar cedo demais. */}
            {estado && !estado.confiavel && estado.vendas > 0 && (
              <p className="mt-3 rounded-xl bg-warning-soft px-3.5 py-2.5 text-sm text-foreground">
                Ainda pouca base — faltam {estado.faltam} para o manual parar de generalizar.
              </p>
            )}
            {estado?.ultimoMotivo && (
              <p className="mt-3 text-sm text-muted-foreground">Última rodada: {estado.ultimoMotivo}.</p>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Button
                variant="premium"
                disabled={rodarCiclo.isPending || semEtapas}
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
          </section>

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
