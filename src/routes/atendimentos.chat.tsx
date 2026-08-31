import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  CheckCheck,
  ChevronDown,
  MessageCircle,
  PanelRight,
  Search,
  StickyNote,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { SeletorDeTags } from "@/components/tags/SeletorDeTags";
import { ResponsiveRouteState } from "@/components/layout/ResponsiveRouteState";
import { agruparPorContato } from "@/lib/atendimentos/agruparConversas";
import { PainelDoContato } from "@/components/atendimentos/chat/PainelDoContato";
import { FiltrosDaConversa } from "@/components/atendimentos/chat/FiltrosDaConversa";
import {
  CONTEXTO_VAZIO,
  FILTROS_VAZIOS,
  ORDENACOES,
  filtrarGrupos,
  itemDoFunil,
  negociacaoDa,
  ordenarGrupos,
  type Filtros,
  type Ordenacao,
} from "@/lib/atendimentos/filtrosDeConversa";
import { listarTags, mapaDeTags, todasAsAtribuicoes } from "@/lib/tags/tags.functions";
import { getContatosComPaciente } from "@/lib/patients/patients.functions";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { ChatComposer } from "@/components/atendimentos/chat/ChatComposer";
import type { PendingAttachment } from "@/components/atendimentos/chat/AttachmentTray";
import { AppointmentDrawer } from "@/components/agenda/AppointmentDrawer";
import { useAgendaCatalog } from "@/lib/agenda/useAppointmentForm";
import { useSaveAppointment } from "@/lib/agenda/useSaveAppointment";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { WhatsappStatusBadge } from "@/components/atendimentos/WhatsappStatusBadge";
import {
  getConversations,
  getMessages,
  getWhatsappInstance,
  sendWhatsappMessage,
  type ConversationRow,
} from "@/lib/atendimentos/atendimentos.functions";
import {
  addPipelineItem,
  getPipelineItems,
  getPipelineStages,
  movePipelineItem,
} from "@/lib/atendimentos/pipeline.functions";
import {
  confirmarGanho,
  getDeals,
  saveDealStatus,
  DEAL_STATUS_LABEL,
  LOSS_REASONS,
  type DealStatus,
} from "@/lib/atendimentos/deals.functions";
import { chaveDaNegociacao } from "@/lib/atendimentos/deal-key";
import { ConfirmarGanho, type DadosGanho } from "@/components/atendimentos/pipeline/ConfirmarGanho";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { haptic } from "@/lib/haptics";
import { useUnitSelection } from "@/lib/settings/unit-context";
import { FotoDoContato } from "@/components/atendimentos/chat/FotoDoContato";
import { AnexoDaMensagem } from "@/components/atendimentos/chat/AnexoDaMensagem";

/** Onde a preferência de painel aberto/fechado fica guardada. */
const CHAVE_DO_PAINEL = "nos:painel-do-contato";
/** A ordem escolhida é lembrada; o filtro NÃO — ver `FiltrosDaConversa`. */
const CHAVE_DA_ORDEM = "nos:ordem-das-conversas";

const searchSchema = z.object({
  conversationId: z.string().optional(),
});

export const Route = createFileRoute("/atendimentos/chat")({
  ssr: false,
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Conversas · Atendimentos · NÓS Conecta" },
      { name: "description", content: "Chat com os contatos da clínica via WhatsApp." },
    ],
  }),
  errorComponent: ({ error }) => (
    <ResponsiveRouteState
      error={error}
      title="Não foi possível carregar os atendimentos"
      description="Houve uma falha ao buscar as conversas. Tente novamente em instantes."
      semSidebar
    />
  ),
  notFoundComponent: () => (
    <ResponsiveRouteState title="Página não encontrada" notFound semSidebar />
  ),
  component: ChatPage,
});

function formatTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function ChatPage() {
  const { conversationId } = Route.useSearch();
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();

  const fetchInstance = useServerFn(getWhatsappInstance);
  const fetchConversations = useServerFn(getConversations);
  const fetchMessages = useServerFn(getMessages);
  const doSendMessage = useServerFn(sendWhatsappMessage);

  const instanceQuery = useQuery({
    queryKey: ["atendimentos-instance"],
    queryFn: () => fetchInstance(),
    staleTime: 8_000,
    refetchInterval: (query) => (query.state.data?.status === "connecting" ? 4_000 : 20_000),
  });
  const instance = instanceQuery.data ?? null;
  const connected = instance?.status === "open";

  // A busca roda sempre — desconectado só volta lista vazia, tratado pelo
  // mesmo estado vazio de "Nenhuma conversa ainda." Conectar não é mais
  // feito por aqui, vive no Dashboard (`/atendimentos`).
  const conversationsQuery = useQuery({
    queryKey: ["atendimentos-conversations"],
    queryFn: () => fetchConversations(),
    staleTime: 5_000,
    refetchInterval: connected ? 15_000 : false,
  });
  const conversations = conversationsQuery.data ?? [];

  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("pt-BR");
    if (!q) return conversations;
    return conversations.filter((c) =>
      `${c.contactName ?? ""} ${c.phone ?? ""}`.toLocaleLowerCase("pt-BR").includes(q),
    );
  }, [conversations, query]);

  // Uma linha por pessoa. A busca roda ANTES de agrupar, sobre as conversas
  // cruas: filtrar depois faria uma conversa antiga escapar do filtro só por
  // estar escondida dentro de um grupo.
  const todosOsGrupos = useMemo(() => agruparPorContato(filtered), [filtered]);

  // ── Recortes e ordem ───────────────────────────────────────────────────
  //
  // O filtro NÃO é lembrado, a ordem é. Filtro esquecido ligado esconde
  // conversas: no dia seguinte a caixa parece vazia e alguém deixa de responder
  // um paciente. A ordem muda a sequência, nunca o conjunto.
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VAZIOS);
  const [ordem, setOrdem] = useState<Ordenacao>("sem-resposta");
  useEffect(() => {
    try {
      const guardada = localStorage.getItem(CHAVE_DA_ORDEM) as Ordenacao | null;
      // Confere contra a lista: um valor antigo de uma versão anterior faria a
      // lista cair no `default` sem ninguém entender por quê.
      if (guardada && (ORDENACOES as readonly string[]).includes(guardada)) setOrdem(guardada);
    } catch {
      /* preferência não lida: fica no padrão */
    }
  }, []);
  const trocarOrdem = (o: Ordenacao) => {
    setOrdem(o);
    try {
      localStorage.setItem(CHAVE_DA_ORDEM, o);
    } catch {
      /* sem persistir; a sessão atual continua funcionando */
    }
  };

  // Etapa, desfecho, etiqueta e paciente/lead só são buscados quando o recorte
  // que precisa deles está ligado — quem nunca abre o filtro não paga por eles.
  const precisaDoFunil = filtros.etapaIds.length > 0 || filtros.desfechos.length > 0;
  const fetchTags = useServerFn(listarTags);
  const fetchAtribuicoes = useServerFn(todasAsAtribuicoes);
  const fetchContatosComPaciente = useServerFn(getContatosComPaciente);

  const tagsQuery = useQuery({
    queryKey: ["tags"],
    queryFn: () => fetchTags(),
    staleTime: 5 * 60_000,
  });
  const atribuicoesQuery = useQuery({
    queryKey: ["tag-assignments"],
    queryFn: () => fetchAtribuicoes(),
    enabled: filtros.tagIds.length > 0,
    staleTime: 60_000,
  });
  const pacientesQuery = useQuery({
    queryKey: ["contatos-com-paciente"],
    queryFn: () => fetchContatosComPaciente(),
    enabled: filtros.vinculo !== "todos",
    staleTime: 60_000,
  });

  // Grupos com a conversa aberta ficam expandidos, para a pessoa enxergar em
  // qual das conversas dela está.
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const alternarGrupo = (chave: string) =>
    setExpandidos((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(chave)) proximo.delete(chave);
      else proximo.add(chave);
      return proximo;
    });

  const selected = conversations.find((c) => c.id === conversationId) ?? null;

  const fetchPipelineStages = useServerFn(getPipelineStages);
  const fetchPipelineItems = useServerFn(getPipelineItems);
  const doAddPipelineItem = useServerFn(addPipelineItem);
  const doMovePipelineItem = useServerFn(movePipelineItem);
  const fetchDeals = useServerFn(getDeals);
  const doConfirmarGanho = useServerFn(confirmarGanho);
  const { selectedUnitId } = useUnitSelection();
  const doSaveStatus = useServerFn(saveDealStatus);

  const pipelineStagesQuery = useQuery({
    queryKey: ["pipeline-stages"],
    queryFn: () => fetchPipelineStages(),
    // Sempre: o popover de filtros lista as etapas do funil, e antes isto só
    // rodava com uma conversa aberta — o filtro apareceria sem a seção de
    // etapa até alguém clicar em alguém.
    staleTime: 30_000,
  });
  const pipelineConfigured = pipelineStagesQuery.data?.configured ?? false;
  const pipelineStages = pipelineStagesQuery.data?.stages ?? [];

  const pipelineItemsQuery = useQuery({
    queryKey: ["pipeline-items"],
    queryFn: () => fetchPipelineItems(),
    enabled: (!!selected || precisaDoFunil) && pipelineConfigured,
    staleTime: 8_000,
  });
  // `itemDoFunil` casa pelos dois lados — pelo id da conversa e pelo do contato.
  // A regra era escrita aqui à mão e o filtro da lista precisava dela também;
  // com duas cópias, a lista diria que alguém está numa etapa e o cabeçalho
  // diria outra.
  const currentPipelineItem = selected
    ? itemDoFunil(pipelineItemsQuery.data?.items ?? [], selected)
    : null;
  const currentStage = pipelineStages.find((s) => s.id === currentPipelineItem?.stageId);

  const dealsQuery = useQuery({
    queryKey: ["deals"],
    queryFn: () => fetchDeals(),
    enabled: (!!selected || precisaDoFunil) && pipelineConfigured,
    staleTime: 8_000,
  });
  // A negociação pode estar pendurada no card do funil OU na própria conversa
  // (quando foi marcada sem card). A ordem de `chavesDaNegociacao` decide quem
  // ganha se, por algum motivo, existirem as duas.
  // Mesma função que o filtro da lista usa, pelo mesmo motivo do card acima.
  const currentDeal = selected
    ? negociacaoDa(dealsQuery.data ?? [], pipelineItemsQuery.data?.items ?? [], selected)
    : null;
  const dealStatus: DealStatus = currentDeal?.status ?? "negotiating";
  const contexto = useMemo(
    () => ({
      ...CONTEXTO_VAZIO,
      tagsPorChave: mapaDeTags(atribuicoesQuery.data ?? []),
      itens: pipelineItemsQuery.data?.items ?? [],
      deals: dealsQuery.data ?? [],
      pacientes: new Set(pacientesQuery.data ?? []),
    }),
    [atribuicoesQuery.data, pipelineItemsQuery.data, dealsQuery.data, pacientesQuery.data],
  );

  const grupos = useMemo(
    () => ordenarGrupos(filtrarGrupos(todosOsGrupos, filtros, contexto), ordem),
    [todosOsGrupos, filtros, contexto, ordem],
  );
  // Chave em que um desfecho novo será gravado. Nunca nula aqui: `selected`
  // existe sempre que este cabeçalho está na tela.
  const chaveDoDesfecho = chaveDaNegociacao({
    pipelineItemId: currentPipelineItem?.id,
    conversationId: selected?.id,
  });

  const [confirmandoGanho, setConfirmandoGanho] = useState(false);
  const [askingLoss, setAskingLoss] = useState(false);
  const [lossReason, setLossReason] = useState("");

  const invalidarNegocio = () => {
    queryClient.invalidateQueries({ queryKey: ["deals"] });
    queryClient.invalidateQueries({ queryKey: ["pipeline-items"] });
  };

  const ganhoMutation = useMutation({
    mutationFn: (dados: DadosGanho) =>
      doConfirmarGanho({
        data: {
          itemId: chaveDoDesfecho!,
          contactName: selected?.contactName ?? selected?.phone ?? "",
          crmContactId: selected?.contactId ?? null,
          phone: dados.phone,
          valor: dados.valor,
          realizadoEm: dados.realizadoEm,
          gerarCobranca: dados.gerarCobranca,
          pagamentoRecebido: dados.pagamentoRecebido,
          unitId: selectedUnitId ?? undefined,
        },
      }),
    onSuccess: (r) => {
      haptic("commit");
      setConfirmandoGanho(false);
      if (r.jaConsolidado) {
        toast.warning(
          "Ganho registrado. Esta pessoa já tinha atendimento realizado nesta data, então a conversão não foi enviada outra vez.",
          { duration: 8000 },
        );
      } else {
        toast.success("Atendimento realizado registrado e conversão enviada.");
      }
      invalidarNegocio();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const statusMutation = useMutation({
    mutationFn: (vars: { status: DealStatus; reason?: string }) =>
      doSaveStatus({
        data: {
          itemId: chaveDoDesfecho!,
          status: vars.status,
          lossReason: vars.reason,
          contactName: selected?.contactName ?? undefined,
          crmContactId: selected?.contactId ?? null,
        },
      }),
    onSuccess: (_r, vars) => {
      haptic(vars.status === "lost" ? "warn" : "commit");
      toast.success(`Marcado como ${DEAL_STATUS_LABEL[vars.status]}`);
      setAskingLoss(false);
      setLossReason("");
      invalidarNegocio();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const moveStageMutation = useMutation({
    mutationFn: (stageId: string) =>
      currentPipelineItem
        ? doMovePipelineItem({ data: { itemId: currentPipelineItem.id, newStageId: stageId } })
        : doAddPipelineItem({ data: { type: "conversation", itemId: selected!.id, stageId } }),
    onSuccess: () => {
      toast.success("Etapa atualizada");
      queryClient.invalidateQueries({ queryKey: ["pipeline-items"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const messagesQuery = useQuery({
    queryKey: ["atendimentos-messages", conversationId],
    queryFn: () => fetchMessages({ data: { conversationId: conversationId! } }),
    enabled: !!conversationId,
    staleTime: 3_000,
    refetchInterval: conversationId ? 5_000 : false,
  });
  const messages = messagesQuery.data ?? [];

  // ── O painel do contato ────────────────────────────────────────────────
  //
  // A escolha fica lembrada: quem usa o painel o usa em toda conversa, e
  // reabrir a cada clique na lista o tornaria mais trabalhoso do que ir até
  // Pacientes — que é justamente o caminho que ele veio encurtar.
  //
  // Lido num `useEffect`, e não no `useState` inicial: `localStorage` não
  // existe no servidor, e ler ali faria a primeira pintura do cliente divergir
  // do HTML que veio pronto. `try/catch` porque navegador com dados de site
  // bloqueados JOGA ao tocar em `localStorage` — e isso não pode derrubar o
  // chat inteiro por causa de uma preferência de layout.
  const [painelAberto, setPainelAberto] = useState(false);

  // `xl` é onde a terceira coluna cabe. Precisa ser estado, e não só classe
  // CSS: a gaveta do celular é um portal com camada escura por cima da tela
  // inteira — escondê-la com `xl:hidden` esconderia o conteúdo e deixaria a
  // camada. Começa em `false` para o servidor e o cliente pintarem igual.
  const [ehTelaLarga, setEhTelaLarga] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1280px)");
    const aplicar = () => setEhTelaLarga(mq.matches);
    aplicar();
    mq.addEventListener("change", aplicar);
    return () => mq.removeEventListener("change", aplicar);
  }, []);

  useEffect(() => {
    try {
      setPainelAberto(localStorage.getItem(CHAVE_DO_PAINEL) === "1");
    } catch {
      /* preferência não lida: segue fechado, que é o padrão */
    }
  }, []);
  const alternarPainel = () =>
    setPainelAberto((atual) => {
      const proximo = !atual;
      try {
        localStorage.setItem(CHAVE_DO_PAINEL, proximo ? "1" : "0");
      } catch {
        /* sem persistir; a sessão atual continua funcionando */
      }
      return proximo;
    });

  const [draft, setDraft] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [appointmentOpen, setAppointmentOpen] = useState(false);
  const agendaCatalog = useAgendaCatalog();
  const saveAppointment = useSaveAppointment({ onSaved: () => setAppointmentOpen(false) });
  const sendMutation = useMutation({
    mutationFn: () =>
      doSendMessage({
        data: {
          conversationId: conversationId!,
          text: draft,
          isPrivate,
          attachments: attachments.map(({ name, type, data, isRecordedAudio }) => ({
            name,
            type,
            data,
            isRecordedAudio,
          })),
        },
      }),
    onSuccess: (res) => {
      setDraft("");
      if (isPrivate) toast.success("Nota interna salva — o contato não recebeu nada.");
      setIsPrivate(false);
      attachments.forEach((a) => a.previewUrl && URL.revokeObjectURL(a.previewUrl));
      setAttachments([]);
      queryClient.invalidateQueries({ queryKey: ["atendimentos-messages", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["atendimentos-conversations"] });
      if (!res.ok) toast.error("Mensagem não confirmada pelo CRM — verifique a conexão.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const selectConversation = (row: ConversationRow) =>
    navigate({ search: { conversationId: row.id } });

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length]);

  return (
    // Sem `mx-auto`/`max-w`: em tela larga isso centralizava as duas colunas
    // e deixava um vão vazio grande entre o menu lateral e a lista de
    // conversas. Agora a lista encosta no menu e a conversa ocupa o resto.
    <main className="flex w-full flex-1 flex-col pb-nav lg:h-full lg:flex-row lg:overflow-hidden lg:pb-0">
      {/* Conversation list */}
      <section
        className={cn(
          "flex w-full flex-col border-border lg:w-[340px] lg:shrink-0 lg:border-r",
          conversationId && "hidden lg:flex",
        )}
      >
        <header className="px-4 pb-3 pt-6 sm:px-6 lg:px-5 lg:pt-7">
          <h1 className="flex items-center gap-2.5 text-2xl font-semibold">
            <MessageCircle className="h-[1.1em] w-[1.1em] shrink-0 text-pink" strokeWidth={1.75} />
            Conversas
          </h1>
          <div className="mt-0.5">
            <WhatsappStatusBadge variant="minimal" />
          </div>
          <div className="relative mt-4">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-11 rounded-xl bg-white pl-11 shadow-soft"
              placeholder="Buscar conversa"
            />
          </div>

          <div className="mt-3">
            <FiltrosDaConversa
              filtros={filtros}
              onFiltros={setFiltros}
              ordem={ordem}
              onOrdem={trocarOrdem}
              tags={tagsQuery.data ?? []}
              etapas={pipelineStages}
              quantidade={grupos.length}
              total={todosOsGrupos.length}
            />
          </div>
          {/* O status em si já aparece no indicador acima — aqui só o
              caminho pra resolver, sem repetir o texto. */}
          {!connected && (
            <p className="mt-3 text-xs text-muted-foreground">
              <Link
                to="/atendimentos"
                className="underline underline-offset-2 hover:text-foreground"
              >
                Conecte pelo Dashboard
              </Link>{" "}
              para ver as conversas aqui.
            </p>
          )}
        </header>

        <div className="flex-1 overflow-y-auto px-2 pb-4 lg:px-2">
          {/* Três vazios diferentes, e dizer qual é o certo importa: "nada
              encontrado" numa caixa que tem 200 conversas escondidas por um
              filtro faz a pessoa achar que perdeu as conversas. */}
          {grupos.length === 0 && (
            <div className="grid min-h-40 place-items-center gap-2 px-6 text-center">
              <p className="text-sm text-muted-foreground">
                {conversations.length === 0
                  ? "Nenhuma conversa ainda."
                  : todosOsGrupos.length === 0
                    ? "Nada encontrado."
                    : "Nenhuma conversa neste recorte."}
              </p>
              {todosOsGrupos.length > 0 && (
                <button
                  type="button"
                  onClick={() => setFiltros({ ...FILTROS_VAZIOS, busca: filtros.busca })}
                  className="press rounded-lg px-2 py-1 text-xs font-medium text-primary hover:bg-muted"
                >
                  Limpar filtros
                </button>
              )}
            </div>
          )}
          {grupos.map((g) => {
            const row = g.principal;
            const name = row.contactName ?? row.phone ?? "Contato";
            const aberto = expandidos.has(g.chave);
            // O grupo fica "aceso" pela conversa aberta, seja ela a principal
            // ou uma das antigas — senão, abrir uma conversa antiga apagaria a
            // marca de onde a pessoa está.
            const ativo =
              row.id === conversationId || g.outras.some((o) => o.id === conversationId);
            return (
              <div key={g.chave}>
                <button
                  type="button"
                  onClick={() => selectConversation(row)}
                  className={cn(
                    "press flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left",
                    ativo ? "bg-foreground text-white" : "hover:bg-white active:bg-white",
                  )}
                >
                  <FotoDoContato
                    nome={name}
                    url={row.avatarUrl}
                    className={cn(
                      "h-11 w-11",
                      ativo ? "bg-white/15 text-white" : "bg-coral-soft text-coral",
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold">{name}</span>
                      <span
                        className={cn(
                          "shrink-0 text-2xs",
                          ativo ? "text-white/70" : "text-muted-foreground",
                        )}
                      >
                        {formatTime(row.lastMessageAt)}
                      </span>
                    </span>
                    <span className="mt-0.5 flex items-center justify-between gap-2">
                      <span
                        className={cn(
                          "truncate text-xs",
                          ativo ? "text-white/70" : "text-muted-foreground",
                        )}
                      >
                        {row.lastMessagePreview ?? "—"}
                      </span>
                      {/* A soma do grupo, não só da principal: esconder a
                          contagem de uma conversa recolhida esconderia
                          justamente o aviso de que tem gente esperando. */}
                      {g.naoLidas > 0 && (
                        <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-gradient-primary px-1.5 text-3xs font-bold text-white">
                          {g.naoLidas}
                        </span>
                      )}
                    </span>
                  </span>
                </button>

                {/* Só aparece quando a pessoa tem mais de uma conversa no CRM —
                    o que acontece porque conversa encerrada não some de lá.
                    Some da lista, mas continua alcançável: escondê-la de vez
                    perderia histórico. */}
                {g.outras.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => alternarGrupo(g.chave)}
                      aria-expanded={aberto}
                      className="press ml-14 mt-0.5 flex items-center gap-1 rounded-lg px-2 py-1 text-2xs text-muted-foreground hover:bg-white"
                    >
                      <ChevronDown
                        className={cn("h-3 w-3 transition-transform", aberto && "rotate-180")}
                      />
                      {g.outras.length + 1} conversas
                    </button>
                    {aberto && (
                      <div className="ml-14 grid gap-0.5 border-l border-border pl-2">
                        {g.outras.map((o) => (
                          <button
                            key={o.id}
                            type="button"
                            onClick={() => selectConversation(o)}
                            className={cn(
                              "press flex items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-left text-xs",
                              o.id === conversationId
                                ? "bg-foreground text-white"
                                : "text-muted-foreground hover:bg-white",
                            )}
                          >
                            <span className="truncate">
                              {o.status === "resolved" ? "Encerrada" : "Aberta"} ·{" "}
                              {formatTime(o.lastMessageAt)}
                            </span>
                            {o.unreadCount > 0 && (
                              <span className="grid h-4 min-w-4 shrink-0 place-items-center rounded-full bg-gradient-primary px-1 text-3xs font-bold text-white">
                                {o.unreadCount}
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Thread */}
      <section className={cn("flex min-w-0 flex-1 flex-col", !conversationId && "hidden lg:flex")}>
        {!selected ? (
          <div className="hidden flex-1 items-center justify-center lg:flex">
            <p className="text-sm text-muted-foreground">
              Selecione uma conversa para ver as mensagens.
            </p>
          </div>
        ) : (
          <>
            <header className="flex items-center gap-3 border-b border-border bg-white/70 px-4 py-3 sm:px-6 lg:px-6">
              <button
                type="button"
                onClick={() => navigate({ search: { conversationId: undefined } })}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-muted-foreground hover:bg-muted lg:hidden"
                aria-label="Voltar"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              {/* O nome inteiro é o gatilho do painel — é onde a mão vai, e é
                  onde o sistema de referência colocou. O ícone à direita existe
                  para quem procura o controle onde ele costuma estar, e para
                  dar um alvo de toque próprio no celular. */}
              <button
                type="button"
                onClick={alternarPainel}
                aria-expanded={painelAberto}
                aria-label="Ver o perfil do contato"
                className="press flex min-w-0 flex-1 items-center gap-3 rounded-2xl py-1 pr-2 text-left hover:bg-muted/60"
              >
                <FotoDoContato
                  nome={selected.contactName ?? selected.phone ?? "Contato"}
                  url={selected.avatarUrl}
                  className="h-10 w-10 shrink-0 bg-coral-soft text-coral"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">
                    {selected.contactName ?? selected.phone ?? "Contato"}
                  </span>
                  {selected.contactName && selected.phone && (
                    <span className="block truncate text-xs text-muted-foreground">
                      {selected.phone}
                    </span>
                  )}
                </span>
              </button>

              <button
                type="button"
                onClick={alternarPainel}
                aria-expanded={painelAberto}
                aria-label={painelAberto ? "Fechar o perfil" : "Abrir o perfil"}
                className={cn(
                  "press grid h-9 w-9 shrink-0 place-items-center rounded-xl transition-colors",
                  painelAberto
                    ? "bg-foreground text-white"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                <PanelRight className="h-4 w-4" />
              </button>
              {/* Tags ficam FORA do bloco do funil: elas não dependem de o
                  pipeline estar configurado, e uma clínica que nunca conectou o
                  CRM continua podendo categorizar quem fala com ela. */}
              <SeletorDeTags
                alvo={{ crmContactId: selected.contactId ?? null }}
                vazio="Tag"
                compacto
                className="shrink-0"
              />

              {pipelineConfigured && pipelineStages.length > 0 && (
                <div className="flex shrink-0 items-center gap-1.5">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-white px-3 py-1.5 text-xs font-semibold"
                      >
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{
                            backgroundColor: currentStage?.color ?? "var(--foreground-subtle)",
                          }}
                        />
                        {currentStage?.name ?? "Sem etapa"}
                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {pipelineStages.map((s) => (
                        <DropdownMenuItem key={s.id} onClick={() => moveStageMutation.mutate(s.id)}>
                          {s.name}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {/* Etapa e desfecho são coisas diferentes: a etapa diz onde a
                      pessoa está, o desfecho diz como terminou. Marcar o
                      desfecho NÃO mexe na etapa nem cria card — sem card, a
                      negociação é gravada com a chave da própria conversa
                      (ver deal-key.ts), e a pessoa simplesmente não aparece no
                      board. */}
                  {chaveDoDesfecho && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          data-desfecho=""
                          className={cn(
                            "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold",
                            dealStatus === "won" &&
                              "border-success/30 bg-success-soft text-success",
                            dealStatus === "lost" && "border-danger/30 bg-danger-soft text-danger",
                            dealStatus === "negotiating" && "border-border bg-white",
                          )}
                        >
                          {dealStatus === "won" && <Check className="h-3.5 w-3.5" />}
                          {dealStatus === "lost" && <X className="h-3.5 w-3.5" />}
                          {DEAL_STATUS_LABEL[dealStatus]}
                          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => statusMutation.mutate({ status: "negotiating" })}
                        >
                          Em negociação
                        </DropdownMenuItem>
                        {/* Ganho não grava daqui: abre a confirmação, que pede
                            valor e data antes de mandar qualquer conversão. */}
                        <DropdownMenuItem onClick={() => setConfirmandoGanho(true)}>
                          Ganho
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setAskingLoss(true)}>
                          Perdido
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              )}
            </header>

            {/* Sem motivo, "perdido" não ensina nada depois — mesma exigência
                do funil, e o servidor recusa sem ele de qualquer jeito. */}
            {askingLoss && (
              <div className="space-y-2 border-b border-border bg-surface px-4 py-3 sm:px-6 lg:px-8">
                <p className="text-xs font-semibold text-foreground">Motivo da perda</p>
                <div className="flex flex-wrap gap-1.5">
                  {LOSS_REASONS.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setLossReason(r)}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-2xs",
                        lossReason === r
                          ? "border-danger bg-danger-soft text-danger"
                          : "border-border bg-white",
                      )}
                    >
                      {r}
                    </button>
                  ))}
                </div>
                <Textarea
                  value={lossReason}
                  onChange={(e) => setLossReason(e.target.value)}
                  placeholder="Ou escreva o motivo"
                  className="min-h-14 bg-white"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="premium"
                    disabled={!lossReason.trim() || statusMutation.isPending}
                    onClick={() => statusMutation.mutate({ status: "lost", reason: lossReason })}
                  >
                    Marcar como perdido
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setAskingLoss(false)}>
                    Cancelar
                  </Button>
                </div>
              </div>
            )}

            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8">
              {/* Sem `mx-auto`: centralizada, a coluna flutuava no meio da
                  tela e as mensagens recebidas ficavam longe do nome do
                  contato. Encostada à esquerda, a conversa acompanha o
                  cabeçalho. O limite de largura fica só pra linha não
                  esticar demais e ficar cansativa de ler. */}
              <div className="flex max-w-[760px] flex-col gap-2">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={cn("flex", m.fromMe ? "justify-end" : "justify-start")}
                  >
                    <div
                      className={cn(
                        "max-w-[78%] rounded-2xl px-4 py-2.5 text-sm leading-6 shadow-soft",
                        m.isPrivate
                          ? "border border-warning/30 bg-warning-soft text-foreground"
                          : m.fromMe
                            ? "bg-gradient-primary text-white"
                            : "bg-white text-foreground",
                      )}
                    >
                      {m.isPrivate && (
                        <span className="mb-1 flex items-center gap-1 text-3xs font-semibold uppercase tracking-wide text-warning">
                          <StickyNote className="h-3 w-3" />
                          Nota interna
                        </span>
                      )}
                      {/* Anexo ANTES do texto: no WhatsApp a legenda vem
                          embaixo da foto, e é assim que o disparo com imagem
                          legendada chegou para quem recebeu. */}
                      {m.attachments.map((a) => (
                        <AnexoDaMensagem key={a.id} anexo={a} claro={m.fromMe && !m.isPrivate} />
                      ))}
                      {m.body && <p className="mt-1 whitespace-pre-wrap break-words">{m.body}</p>}
                      <span
                        className={cn(
                          "mt-1 flex items-center justify-end gap-1 text-3xs",
                          m.fromMe && !m.isPrivate ? "text-white/70" : "text-muted-foreground",
                        )}
                      >
                        {formatTime(m.timestamp)}
                        {m.fromMe && !m.isPrivate && <CheckCheck className="h-3 w-3" />}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <ChatComposer
              value={draft}
              onChange={setDraft}
              onSend={() => sendMutation.mutate()}
              isSending={sendMutation.isPending}
              isPrivate={isPrivate}
              onPrivateChange={setIsPrivate}
              attachments={attachments}
              onAttachmentsChange={setAttachments}
              conversationId={selected.id}
              contactId={selected.contactId}
              onScheduleAppointment={() => setAppointmentOpen(true)}
            />
          </>
        )}
      </section>

      {/* ── O perfil do contato ─────────────────────────────────────────────
          Terceira coluna a partir de `xl`. Abaixo disso não cabe: espremer a
          conversa para caber o painel destruiria justamente o que a pessoa
          está lendo. Em tela menor ele vira gaveta, como as outras do sistema.
          `shrink-0` com largura fixa para a conversa ceder o espaço, e não o
          painel — num painel de 200px os cards de financeiro se empilham. */}
      {selected && painelAberto && (
        <aside className="hidden w-[340px] shrink-0 border-l border-border xl:flex">
          <PainelDoContato
            conversa={selected}
            chaveDoDesfecho={chaveDoDesfecho}
            onFechar={alternarPainel}
            className="w-full"
          />
        </aside>
      )}

      {selected && (
        <Drawer open={painelAberto && !ehTelaLarga} onOpenChange={(o) => !o && alternarPainel()}>
          <DrawerContent className="h-[88dvh] xl:hidden">
            {/* Exigido pelo Radix por baixo do vaul: sem título acessível o
                leitor de tela anuncia uma gaveta sem nome. Escondido porque o
                próprio painel já mostra "Perfil" no cabeçalho dele. */}
            <DrawerTitle className="sr-only">Perfil do contato</DrawerTitle>
            <PainelDoContato
              conversa={selected}
              chaveDoDesfecho={chaveDoDesfecho}
              className="min-h-0 flex-1"
            />
          </DrawerContent>
        </Drawer>
      )}

      {/* Mesmo formulário e mesma gravação da Agenda — um agendamento feito
          aqui aparece lá igual a qualquer outro. O nome do contato do
          WhatsApp entra como sugestão de paciente; quem agenda confirma ou
          troca pelo cadastro certo. */}
      {selected && (
        <AppointmentDrawer
          open={appointmentOpen}
          catalog={agendaCatalog}
          origin={`Agendamento a partir da conversa de WhatsApp com ${
            selected.contactName ?? selected.phone ?? "este contato"
          }.`}
          defaultPatient={selected.contactName ? { id: "", name: selected.contactName } : null}
          contact={{
            name: selected.contactName,
            phone: selected.phone,
            crmContactId: selected.contactId,
          }}
          isSaving={saveAppointment.isPending}
          onClose={() => setAppointmentOpen(false)}
          onSave={(data) =>
            saveAppointment.mutate({
              data,
              contact: {
                phone: selected.phone,
                crmContactId: selected.contactId,
              },
            })
          }
        />
      )}

      <ConfirmarGanho
        open={confirmandoGanho}
        contactName={selected?.contactName ?? selected?.phone ?? "Contato"}
        phone={selected?.phone ?? null}
        valorSugerido={currentDeal?.value ?? null}
        isPending={ganhoMutation.isPending}
        onOpenChange={(o) => !o && setConfirmandoGanho(false)}
        onConfirm={(dados) => ganhoMutation.mutate(dados)}
      />
    </main>
  );
}
