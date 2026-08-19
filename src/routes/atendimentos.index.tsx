import { createFileRoute } from "@tanstack/react-router";
import { PageHeading } from "@/components/layout/PageHeading";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Bell, LayoutDashboard, Megaphone, MessageCircle, Workflow } from "lucide-react";
import { ResponsiveRouteState } from "@/components/layout/ResponsiveRouteState";
import { KpiCard } from "@/components/finance/KpiCard";
import { WhatsappStatusBadge } from "@/components/atendimentos/WhatsappStatusBadge";
import { WhatsappConnectionCard } from "@/components/atendimentos/WhatsappConnectionCard";
import { CrmBackfillCard } from "@/components/atendimentos/CrmBackfillCard";
import { PipelineFunnelCard } from "@/components/atendimentos/PipelineFunnelCard";
import { StuckConversationsCard } from "@/components/atendimentos/StuckConversationsCard";
import { SalesPlaybookCard } from "@/components/atendimentos/SalesPlaybookCard";
import { getConversations } from "@/lib/atendimentos/atendimentos.functions";
import { getPipelineItems, getPipelineStages } from "@/lib/atendimentos/pipeline.functions";
import { getCampaigns, getDailySendUsage } from "@/lib/atendimentos/campaigns.functions";
import { getSalesAssistant, getSalesPlaybook } from "@/lib/atendimentos/insights.functions";

export const Route = createFileRoute("/atendimentos/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Dashboard · Atendimentos · NÓS Conecta" },
      { name: "description", content: "Visão geral de conversas, funil e campanhas do WhatsApp." },
    ],
  }),
  errorComponent: ({ error }) => (
    <ResponsiveRouteState error={error}
      title="Não foi possível carregar o dashboard"
      description="Houve uma falha ao buscar as métricas de atendimento. Tente novamente em instantes."
      semSidebar
    />
  ),
  notFoundComponent: () => <ResponsiveRouteState title="Página não encontrada" notFound
  semSidebar
/>,
  component: DashboardPage,
});

function DashboardPage() {
  const fetchConversations = useServerFn(getConversations);
  const fetchStages = useServerFn(getPipelineStages);
  const fetchItems = useServerFn(getPipelineItems);
  const fetchCampaigns = useServerFn(getCampaigns);
  const fetchUsage = useServerFn(getDailySendUsage);
  const fetchAssistant = useServerFn(getSalesAssistant);
  const fetchPlaybook = useServerFn(getSalesPlaybook);

  const conversationsQuery = useQuery({
    queryKey: ["atendimentos-conversations"],
    queryFn: () => fetchConversations(),
    staleTime: 5_000,
  });
  const conversations = conversationsQuery.data ?? [];
  const needsAttention = conversations.filter((c) => c.unreadCount > 0).length;

  const stagesQuery = useQuery({ queryKey: ["pipeline-stages"], queryFn: () => fetchStages(), staleTime: 10_000 });
  const configured = stagesQuery.data?.configured ?? false;
  const stages = stagesQuery.data?.stages ?? [];

  const itemsQuery = useQuery({ queryKey: ["pipeline-items"], queryFn: () => fetchItems(), staleTime: 8_000 });
  const items = itemsQuery.data?.items ?? [];

  const campaignsQuery = useQuery({ queryKey: ["campaigns"], queryFn: () => fetchCampaigns(), staleTime: 10_000 });
  const campaigns = campaignsQuery.data ?? [];
  const activeCampaigns = campaigns.filter((c) => c.status === "running").length;

  const usageQuery = useQuery({ queryKey: ["campaigns-usage"], queryFn: () => fetchUsage(), staleTime: 15_000 });

  // Análise diária do CRM (sales_assistant/sales_playbook) — nunca deve
  // travar o dashboard: se falhar (ex.: conta sem esses recursos liberados),
  // o resto da página continua funcionando, esses cards só ficam vazios.
  const assistantQuery = useQuery({
    queryKey: ["sales-assistant"],
    queryFn: () => fetchAssistant(),
    staleTime: 60_000,
    retry: 1,
  });
  const playbookQuery = useQuery({
    queryKey: ["sales-playbook"],
    queryFn: () => fetchPlaybook(),
    staleTime: 60_000,
    retry: 1,
  });

  return (
    <main className="flex flex-1 flex-col pb-nav lg:pb-8">
      <PageHeading
        className="px-4 pb-4 pt-6 sm:px-6 lg:px-10 lg:pt-7"
        icon={LayoutDashboard}
        title="Dashboard"
        actions={<WhatsappStatusBadge />}
      />

      <div className="space-y-5 px-4 sm:px-6 lg:px-10">
        <section className="grid grid-cols-2 gap-3 md:gap-5 xl:grid-cols-4">
          <KpiCard label="Conversas ativas" value={String(conversations.length)} icon={MessageCircle} tone="violet" />
          <KpiCard label="Precisam de atenção" value={String(needsAttention)} icon={Bell} tone="warning" />
          <KpiCard label="Contatos no funil" value={String(items.length)} icon={Workflow} tone="success" />
          <KpiCard label="Campanhas ativas" value={String(activeCampaigns)} icon={Megaphone} tone="danger" />
        </section>

        <section className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_360px]">
          <PipelineFunnelCard configured={configured} stages={stages} items={items} />
          <WhatsappConnectionCard dailyUsage={usageQuery.data} />
        </section>

        <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <StuckConversationsCard assistant={assistantQuery.data ?? null} />
          <SalesPlaybookCard playbook={playbookQuery.data ?? null} />
        </section>

        <section className="max-w-md">
          <CrmBackfillCard />
        </section>
      </div>
    </main>
  );
}
