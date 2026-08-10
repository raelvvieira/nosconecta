import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCheck, ChevronDown, Search, StickyNote } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { ResponsiveRouteState } from "@/components/layout/ResponsiveRouteState";
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
  errorComponent: () => (
    <ResponsiveRouteState
      title="Não foi possível carregar os atendimentos"
      description="Houve uma falha ao buscar as conversas. Tente novamente em instantes."
    />
  ),
  notFoundComponent: () => <ResponsiveRouteState title="Página não encontrada" notFound />,
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

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
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
    return conversations.filter((c) => `${c.contactName ?? ""} ${c.phone ?? ""}`.toLocaleLowerCase("pt-BR").includes(q));
  }, [conversations, query]);

  const selected = conversations.find((c) => c.id === conversationId) ?? null;

  const fetchPipelineStages = useServerFn(getPipelineStages);
  const fetchPipelineItems = useServerFn(getPipelineItems);
  const doAddPipelineItem = useServerFn(addPipelineItem);
  const doMovePipelineItem = useServerFn(movePipelineItem);

  const pipelineStagesQuery = useQuery({
    queryKey: ["pipeline-stages"],
    queryFn: () => fetchPipelineStages(),
    enabled: !!selected,
    staleTime: 30_000,
  });
  const pipelineConfigured = pipelineStagesQuery.data?.configured ?? false;
  const pipelineStages = pipelineStagesQuery.data?.stages ?? [];

  const pipelineItemsQuery = useQuery({
    queryKey: ["pipeline-items"],
    queryFn: () => fetchPipelineItems(),
    enabled: !!selected && pipelineConfigured,
    staleTime: 8_000,
  });
  const currentPipelineItem = pipelineItemsQuery.data?.items.find(
    (i) => i.type === "conversation" && i.itemId === selected?.id,
  );
  const currentStage = pipelineStages.find((s) => s.id === currentPipelineItem?.stageId);

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

  const selectConversation = (row: ConversationRow) => navigate({ search: { conversationId: row.id } });

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length]);

  return (
    // Sem `mx-auto`/`max-w`: em tela larga isso centralizava as duas colunas
    // e deixava um vão vazio grande entre o menu lateral e a lista de
    // conversas. Agora a lista encosta no menu e a conversa ocupa o resto.
    <main className="flex w-full flex-1 flex-col pb-20 lg:h-full lg:flex-row lg:overflow-hidden lg:pb-0">
      {/* Conversation list */}
      <section
        className={cn(
          "flex w-full flex-col border-border lg:w-[340px] lg:shrink-0 lg:border-r",
          conversationId && "hidden lg:flex",
        )}
      >
        <header className="px-4 pb-3 pt-6 sm:px-6 lg:px-5 lg:pt-7">
          <h1 className="text-2xl font-semibold tracking-[-0.03em]">Conversas</h1>
          <div className="mt-0.5">
            <WhatsappStatusBadge variant="minimal" />
          </div>
          <div className="relative mt-4">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-11 rounded-[16px] bg-white pl-11 shadow-soft"
              placeholder="Buscar conversa"
            />
          </div>
          {/* O status em si já aparece no indicador acima — aqui só o
              caminho pra resolver, sem repetir o texto. */}
          {!connected && (
            <p className="mt-3 text-xs text-muted-foreground">
              <Link to="/atendimentos" className="underline underline-offset-2 hover:text-foreground">
                Conecte pelo Dashboard
              </Link>{" "}
              para ver as conversas aqui.
            </p>
          )}
        </header>

        <div className="flex-1 overflow-y-auto px-2 pb-4 lg:px-2">
          {filtered.length === 0 && (
            <div className="grid min-h-40 place-items-center px-6 text-center">
              <p className="text-sm text-muted-foreground">
                {conversations.length === 0 ? "Nenhuma conversa ainda." : "Nada encontrado."}
              </p>
            </div>
          )}
          {filtered.map((row) => {
            const name = row.contactName ?? row.phone ?? "Contato";
            const active = row.id === conversationId;
            return (
              <button
                key={row.id}
                type="button"
                onClick={() => selectConversation(row)}
                className={cn(
                  "press flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left",
                  active ? "bg-foreground text-white" : "hover:bg-white active:bg-white",
                )}
              >
                <span
                  className={cn(
                    "grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-sm font-bold",
                    active ? "bg-white/15 text-white" : "bg-coral-soft text-coral",
                  )}
                >
                  {initials(name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold">{name}</span>
                    <span className={cn("shrink-0 text-2xs", active ? "text-white/70" : "text-muted-foreground")}>
                      {formatTime(row.lastMessageAt)}
                    </span>
                  </span>
                  <span className="mt-0.5 flex items-center justify-between gap-2">
                    <span className={cn("truncate text-xs", active ? "text-white/70" : "text-muted-foreground")}>
                      {row.lastMessagePreview ?? "—"}
                    </span>
                    {row.unreadCount > 0 && (
                      <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-gradient-primary px-1.5 text-3xs font-bold text-white">
                        {row.unreadCount}
                      </span>
                    )}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Thread */}
      <section className={cn("flex min-w-0 flex-1 flex-col", !conversationId && "hidden lg:flex")}>
        {!selected ? (
          <div className="hidden flex-1 items-center justify-center lg:flex">
            <p className="text-sm text-muted-foreground">Selecione uma conversa para ver as mensagens.</p>
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
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-coral-soft text-sm font-bold text-coral">
                {initials(selected.contactName ?? selected.phone ?? "Contato")}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{selected.contactName ?? selected.phone ?? "Contato"}</p>
                {selected.contactName && selected.phone && (
                  <p className="truncate text-xs text-muted-foreground">{selected.phone}</p>
                )}
              </div>
              {pipelineConfigured && pipelineStages.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-white px-3 py-1.5 text-xs font-semibold"
                    >
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: currentStage?.color ?? "var(--foreground-subtle)" }}
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
              )}
            </header>

            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8">
              {/* Sem `mx-auto`: centralizada, a coluna flutuava no meio da
                  tela e as mensagens recebidas ficavam longe do nome do
                  contato. Encostada à esquerda, a conversa acompanha o
                  cabeçalho. O limite de largura fica só pra linha não
                  esticar demais e ficar cansativa de ler. */}
              <div className="flex max-w-[760px] flex-col gap-2">
                {messages.map((m) => (
                  <div key={m.id} className={cn("flex", m.fromMe ? "justify-end" : "justify-start")}>
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
                      <p className="whitespace-pre-wrap break-words">{m.body}</p>
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
          defaultPatient={
            selected.contactName ? { id: "", name: selected.contactName } : null
          }
          isSaving={saveAppointment.isPending}
          onClose={() => setAppointmentOpen(false)}
          onSave={(data) => saveAppointment.mutate({ data })}
        />
      )}
    </main>
  );
}
