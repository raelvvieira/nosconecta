import type { ReactNode } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { ResponsiveRouteState } from "@/components/layout/ResponsiveRouteState";
import { PageHeading } from "@/components/layout/PageHeading";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  aprenderAgora,
  getAtendimento,
  getEstadoDoAgente,
  listarLicoesDaLuna,
  salvarConfiguracaoDoAgente,
} from "@/lib/agente-ia/agente.functions";
import { getRelatoriosDoOlho } from "@/lib/agente-ia/olho.functions";
import { minhaFranquia } from "@/lib/plataforma/plataforma.functions";
import { ChaveDaIa } from "@/components/agente-ia/ChaveDaIa";
import { NomeDaAssistente } from "@/components/agente-ia/NomeDaAssistente";
import { ManualDaLuna } from "@/components/agente-ia/ManualDaLuna";
import { PacienteModelo } from "@/components/agente-ia/PacienteModelo";
import { ComQuemFala } from "@/components/agente-ia/ComQuemFala";
import { Ritmo } from "@/components/agente-ia/Ritmo";
import { VoltarEmQuemSumiu } from "@/components/agente-ia/VoltarEmQuemSumiu";
import { RecoveryEngine, SoSemRecovery } from "@/components/agente-ia/RecoveryEngine";
import { Testar } from "@/components/agente-ia/Testar";
import { Procedimentos } from "@/components/agente-ia/Procedimentos";
import { LicoesDaLuna } from "@/components/agente-ia/LicoesDaLuna";
import { OlhoDeDeus } from "@/components/agente-ia/OlhoDeDeus";
import { ConsumoDaIa } from "@/components/agente-ia/ConsumoDaIa";
import { ConversasDoMes } from "@/components/agente-ia/ConversasDoMes";
import { souDaPlataforma } from "@/lib/plataforma/plataforma.functions";
import { OQueAprendeu } from "@/components/agente-ia/OQueAprendeu";

const ABAS = [
  { value: "atendimento", label: "Atendimento" },
  { value: "conhecimento", label: "O que ela sabe" },
  { value: "aprendizado", label: "Aprendizado" },
  { value: "configuracao", label: "Configuração" },
] as const;
type Aba = (typeof ABAS)[number]["value"];

const searchSchema = z.object({
  /** Na URL para o F5 voltar na mesma aba. */
  aba: z.enum(["atendimento", "conhecimento", "aprendizado", "configuracao"]).optional(),
});

export const Route = createFileRoute("/agente-ia/")({
  validateSearch: searchSchema,
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

/**
 * A página do Agente de IA.
 *
 * ── O redesenho de 30/10 ───────────────────────────────────────────────
 *
 * Eram dezesseis cartões numa rolagem só, cada um com uma frase explicando o
 * que é. Agora: no topo, quatro números que respondem "como ela está indo"
 * sem abrir nada; embaixo, quatro abas na ordem do uso.
 *
 *   Atendimento   — com quem fala, ritmo, voltar em quem sumiu, e o teste ao
 *                   lado (é onde se ajusta e confere na mesma tela).
 *   O que ela sabe — o manual, os preços e a vaga de paciente modelo.
 *   Aprendizado   — lições, Olho de Deus e a matéria-prima do manual.
 *   Configuração  — nome, chave, conversas do mês e (plataforma) o custo.
 *
 * As explicações foram para o "i" de cada título (`Ajuda`, em `campos.tsx`).
 *
 * Saiu o "Seu funil hoje": contava `pipeline_deals` (5 linhas em 30/10) e o
 * texto dizia que era "o material que o agente tem para aprender", o que
 * deixou de ser verdade quando o manual escrito pela clínica passou a mandar.
 * O funil de verdade agora é o Pipeline, que se organiza sozinho.
 *
 * Cada bloco continua no seu arquivo em `src/components/agente-ia/` — a
 * página só compõe.
 */
function AgentePage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const aba: Aba = Route.useSearch().aba ?? "atendimento";
  const irPara = (proxima: Aba) =>
    navigate({ to: "/agente-ia", search: { aba: proxima }, replace: true });

  const buscarEstado = useServerFn(getEstadoDoAgente);
  const buscarAtendimento = useServerFn(getAtendimento);
  const salvar = useServerFn(salvarConfiguracaoDoAgente);
  const aprender = useServerFn(aprenderAgora);
  // O custo da IA só aparece para quem administra a plataforma (29/10).
  const perguntarPlataforma = useServerFn(souDaPlataforma);
  const { data: daPlataforma = false } = useQuery({
    queryKey: ["sou-da-plataforma"],
    queryFn: () => perguntarPlataforma(),
    staleTime: Infinity,
    retry: false,
  });

  const estadoQuery = useQuery({ queryKey: ["agente-ia"], queryFn: () => buscarEstado() });
  const atendimentoQuery = useQuery({
    queryKey: ["agente-ia-atendimento"],
    queryFn: () => buscarAtendimento(),
  });
  const estado = estadoQuery.data;

  const invalidar = () => queryClient.invalidateQueries({ queryKey: ["agente-ia"] });

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
      if (r.aprendeu) toast.success(`Leu ${r.novas} conversa(s) e atualizou o aprendizado.`);
      else toast.info(r.motivo ?? "Nada novo para aprender.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const config = atendimentoQuery.data;
  const disjuntorAberto =
    config?.circuitoAbertoAte && new Date(config.circuitoAbertoAte) > new Date();

  return (
    <main className="agente-ia-celular w-full min-w-0 flex-1 overflow-x-hidden px-4 pb-nav pt-7 sm:px-6 lg:px-10 lg:pb-10 lg:pt-9">
      <PageHeading
        className="pr-16 lg:pr-0"
        icon={Sparkles}
        title="Agente de IA"
        actions={
          estado && (
            <label className="flex cursor-pointer items-center gap-2.5 rounded-full border border-border/70 bg-card px-3.5 py-2 shadow-1">
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  estado.ligado ? "bg-success" : "bg-muted-foreground/40",
                )}
              />
              <span className="text-sm font-medium">
                {estado.nome || "Luna"} · {estado.ligado ? "ativa" : "pausada"}
              </span>
              <Switch
                checked={estado.ligado}
                disabled={ligarDesligar.isPending}
                onCheckedChange={(v) => ligarDesligar.mutate(v)}
                aria-label="Ativar o agente"
              />
            </label>
          )
        }
      />

      {estadoQuery.isPending ? (
        <div className="mt-10 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="mt-5 grid gap-4 lg:mt-7">
          {disjuntorAberto && (
            <p className="flex items-center gap-2.5 rounded-2xl bg-warning-soft px-4 py-3 text-sm">
              <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
              Pausado automaticamente após falhas seguidas. Volta sozinho em instantes.
            </p>
          )}

          <VisaoGeral onAprendizado={() => irPara("aprendizado")} />

          <div
            role="tablist"
            className="flex w-full gap-1 overflow-x-auto rounded-full border border-border/70 bg-card p-1 shadow-1 sm:w-fit"
          >
            {ABAS.map((a) => (
              <button
                key={a.value}
                type="button"
                role="tab"
                aria-selected={aba === a.value}
                onClick={() => irPara(a.value)}
                className={cn(
                  "shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                  aba === a.value
                    ? "bg-foreground text-white"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {a.label}
              </button>
            ))}
          </div>

          {aba === "atendimento" && (
            // O teste ao lado de propósito: muda o ritmo ou com quem ela fala
            // e confere na mesma tela.
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:items-start">
              <div className="grid gap-4">
                <ComQuemFala />
                <Ritmo />
                <RecoveryEngine />
                <SoSemRecovery>
                  <VoltarEmQuemSumiu />
                </SoSemRecovery>
              </div>
              <div className="xl:sticky xl:top-6">
                <Testar />
              </div>
            </div>
          )}

          {aba === "conhecimento" && (
            <div className="grid gap-4">
              <ManualDaLuna />
              <div className="grid gap-4 xl:grid-cols-2 xl:items-start">
                <Procedimentos />
                <PacienteModelo />
              </div>
            </div>
          )}

          {aba === "aprendizado" && (
            <div className="grid gap-4">
              <div className="grid gap-4 xl:grid-cols-2 xl:items-start">
                <LicoesDaLuna />
                <OlhoDeDeus />
              </div>
              <OQueAprendeu
                aprender={() => rodarCiclo.mutate()}
                aprendendo={rodarCiclo.isPending}
                aprendidoEm={estado?.aprendidoEm ?? null}
                conversasLidas={Number(estado?.vendas ?? 0) + Number(estado?.conversas ?? 0)}
              />
            </div>
          )}

          {aba === "configuracao" && (
            <div className="grid gap-4 xl:grid-cols-2 xl:items-start">
              <div className="grid gap-4">
                {estado && <NomeDaAssistente nome={estado.nome} />}
                <ConversasDoMes />
              </div>
              <ChaveDaIa />
              {daPlataforma && (
                <div className="xl:col-span-2">
                  <ConsumoDaIa />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </main>
  );
}

function Numero({
  rotulo,
  children,
  rodape,
  onClick,
}: {
  rotulo: string;
  children: ReactNode;
  rodape?: ReactNode;
  onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "flex min-w-0 flex-col rounded-2xl border border-border/70 bg-card p-4 text-left shadow-1",
        onClick && "press transition-shadow hover:shadow-2",
      )}
    >
      <span className="text-3xs font-medium uppercase tracking-[0.06em] text-muted-foreground">
        {rotulo}
      </span>
      <span className="mt-1.5 min-w-0">{children}</span>
      {rodape && <span className="mt-auto pt-2">{rodape}</span>}
    </Tag>
  );
}

/**
 * Como ela está indo, sem abrir nada. As consultas são as mesmas dos blocos
 * (mesma chave de cache), então abrir a aba depois não busca de novo.
 */
function VisaoGeral({ onAprendizado }: { onAprendizado: () => void }) {
  const buscarFranquia = useServerFn(minhaFranquia);
  const buscarLicoes = useServerFn(listarLicoesDaLuna);
  const buscarOlho = useServerFn(getRelatoriosDoOlho);
  const { data: franquia } = useQuery({
    queryKey: ["minha-franquia"],
    queryFn: () => buscarFranquia(),
    staleTime: 60_000,
  });
  const { data: licoes } = useQuery({
    queryKey: ["licoes-da-luna"],
    queryFn: () => buscarLicoes(),
  });
  const { data: olho } = useQuery({
    queryKey: ["olho-de-deus"],
    queryFn: () => buscarOlho(),
    staleTime: 60_000,
  });

  const total = (licoes?.fechou ?? 0) + (licoes?.naoFechou ?? 0);
  const taxa = total ? Math.round(((licoes?.fechou ?? 0) / total) * 100) : null;
  const motivo = licoes?.motivos?.[0] ?? null;
  const gargalo = olho?.[0]?.gargalo ?? null;
  const pct = franquia?.franquia
    ? Math.min(100, Math.round((franquia.usadas / franquia.franquia) * 100))
    : 0;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Numero
        rotulo="Conversas no mês"
        rodape={
          franquia?.franquia ? (
            <span className="block h-1 overflow-hidden rounded-full bg-surface-subtle">
              <span
                className={cn(
                  "block h-full rounded-full",
                  pct >= 100 ? "bg-danger" : pct >= 80 ? "bg-warning" : "bg-coral",
                )}
                style={{ width: `${pct}%` }}
              />
            </span>
          ) : null
        }
      >
        <span className="text-2xl font-semibold tabular-nums tracking-tight">
          {franquia?.usadas ?? "—"}
        </span>
        {franquia?.franquia ? (
          <span className="text-sm text-muted-foreground"> / {franquia.franquia}</span>
        ) : null}
      </Numero>

      <Numero rotulo="Fechou sozinha" onClick={onAprendizado}>
        <span className="text-2xl font-semibold tabular-nums tracking-tight">
          {taxa === null ? "—" : `${taxa}%`}
        </span>
        {total > 0 && (
          <span className="block text-2xs text-muted-foreground">
            {licoes?.fechou} de {total} conversas
          </span>
        )}
      </Numero>

      <Numero rotulo="Mais perde por" onClick={onAprendizado}>
        <span className="line-clamp-2 text-sm font-semibold leading-snug tracking-tight">
          {motivo?.motivo ?? "—"}
        </span>
        {motivo && (
          <span className="block text-2xs text-muted-foreground">{motivo.quantas} conversas</span>
        )}
      </Numero>

      <Numero rotulo="Gargalo da semana" onClick={onAprendizado}>
        <span className="line-clamp-3 text-sm leading-snug">
          {gargalo ?? <span className="text-muted-foreground">Sem relatório ainda</span>}
        </span>
      </Numero>
    </div>
  );
}
