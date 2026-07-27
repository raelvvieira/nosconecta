import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  CheckCheck,
  Clock,
  MessageCircle,
  QrCode,
  RefreshCw,
  Search,
  Send,
  WifiOff,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { Sidebar } from "@/components/finance/Sidebar";
import { ResponsiveRouteState } from "@/components/layout/ResponsiveRouteState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  connectWhatsapp,
  getConversations,
  getMessages,
  getWhatsappInstance,
  refreshWhatsappStatus,
  sendWhatsappMessage,
  type ConversationRow,
  type WhatsappInstance,
} from "@/lib/atendimentos/atendimentos.functions";

const searchSchema = z.object({
  conversationId: z.string().optional(),
});

export const Route = createFileRoute("/atendimentos")({
  ssr: false,
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Atendimentos · NÓS Conecta" },
      { name: "description", content: "Conversas de WhatsApp da clínica em um só lugar." },
    ],
  }),
  errorComponent: () => (
    <ResponsiveRouteState
      title="Não foi possível carregar os atendimentos"
      description="Houve uma falha ao buscar as conversas. Tente novamente em instantes."
    />
  ),
  notFoundComponent: () => <ResponsiveRouteState title="Página não encontrada" notFound />,
  component: AtendimentosPage,
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

function AtendimentosPage() {
  const { conversationId } = Route.useSearch();
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();

  const fetchInstance = useServerFn(getWhatsappInstance);
  const doConnect = useServerFn(connectWhatsapp);
  const doRefreshStatus = useServerFn(refreshWhatsappStatus);
  const fetchConversations = useServerFn(getConversations);
  const fetchMessages = useServerFn(getMessages);
  const doSendMessage = useServerFn(sendWhatsappMessage);

  const instanceQuery = useQuery({
    queryKey: ["atendimentos-instance"],
    queryFn: () => fetchInstance(),
    staleTime: 10_000,
  });
  const instance = instanceQuery.data ?? null;
  const connected = instance?.status === "open";

  const connectMutation = useMutation({
    mutationFn: () => doConnect(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["atendimentos-instance"] }),
    onError: (error: Error) => toast.error(error.message),
  });

  // Poll status while connecting (waiting for QR scan) so the screen flips
  // to the conversation list automatically once WhatsApp links.
  useEffect(() => {
    if (instance?.status !== "connecting") return;
    const id = setInterval(async () => {
      try {
        await doRefreshStatus();
        queryClient.invalidateQueries({ queryKey: ["atendimentos-instance"] });
      } catch {
        // silent — next tick tries again
      }
    }, 4000);
    return () => clearInterval(id);
  }, [instance?.status, doRefreshStatus, queryClient]);

  const conversationsQuery = useQuery({
    queryKey: ["atendimentos-conversations"],
    queryFn: () => fetchConversations(),
    enabled: connected,
    staleTime: 5_000,
    refetchInterval: connected ? 15_000 : false,
  });
  const conversations = conversationsQuery.data ?? [];

  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("pt-BR");
    if (!q) return conversations;
    return conversations.filter((c) =>
      `${c.contactName ?? ""} ${c.patientName ?? ""} ${c.remoteJid}`.toLocaleLowerCase("pt-BR").includes(q),
    );
  }, [conversations, query]);

  const selected = conversations.find((c) => c.id === conversationId) ?? null;

  const messagesQuery = useQuery({
    queryKey: ["atendimentos-messages", conversationId],
    queryFn: () => fetchMessages({ data: { conversationId: conversationId! } }),
    enabled: !!conversationId,
    staleTime: 3_000,
    refetchInterval: conversationId ? 5_000 : false,
  });
  const messages = messagesQuery.data ?? [];

  const [draft, setDraft] = useState("");
  const sendMutation = useMutation({
    mutationFn: () => doSendMessage({ data: { conversationId: conversationId!, text: draft } }),
    onSuccess: (res) => {
      setDraft("");
      queryClient.invalidateQueries({ queryKey: ["atendimentos-messages", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["atendimentos-conversations"] });
      if (!res.ok) toast.error("Mensagem não confirmada pelo WhatsApp — verifique a conexão.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const selectConversation = (row: ConversationRow) => {
    navigate({ search: { conversationId: row.id } });
    queryClient.invalidateQueries({ queryKey: ["atendimentos-conversations"] });
  };

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length]);

  if (instanceQuery.isLoading) {
    return (
      <div className="min-h-screen app-bg lg:flex">
        <Sidebar />
        <main className="flex min-h-screen flex-1 items-center justify-center">
          <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
        </main>
      </div>
    );
  }

  if (!connected) {
    return (
      <div className="min-h-screen app-bg lg:flex">
        <Sidebar />
        <main className="flex min-h-screen flex-1 items-center justify-center px-5 pb-28 pt-20 lg:min-h-0 lg:px-10 lg:pb-10 lg:pt-10">
          <section className="surface-card w-full max-w-[440px] px-6 py-8 text-center sm:px-10 sm:py-10">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-[20px] bg-coral-soft text-coral">
              {instance?.status === "connecting" ? (
                <QrCode className="h-6 w-6" />
              ) : (
                <WifiOff className="h-6 w-6" />
              )}
            </span>
            <h1 className="mt-5 text-xl font-semibold tracking-tight">
              {instance?.status === "connecting" ? "Escaneie o QR Code" : "Conectar WhatsApp"}
            </h1>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
              {instance?.status === "connecting"
                ? "Abra o WhatsApp no celular da clínica → Aparelhos conectados → Conectar um aparelho."
                : "Conecte o número da clínica para espelhar as conversas de WhatsApp aqui."}
            </p>

            {instance?.status === "connecting" && instance.qrCode && (
              <img
                src={instance.qrCode.startsWith("data:") ? instance.qrCode : `data:image/png;base64,${instance.qrCode}`}
                alt="QR Code de conexão do WhatsApp"
                className="mx-auto mt-6 h-56 w-56 rounded-2xl border border-border object-contain"
              />
            )}

            {instance?.lastError && (
              <p className="mt-4 rounded-xl bg-danger-soft px-3 py-2 text-xs text-danger">
                {instance.lastError}
              </p>
            )}

            <Button
              className="mt-6 gap-2 bg-gradient-primary text-white"
              onClick={() => connectMutation.mutate()}
              disabled={connectMutation.isPending}
            >
              <RefreshCw className={cn("h-4 w-4", connectMutation.isPending && "animate-spin")} />
              {instance?.status === "connecting" ? "Gerar novo QR Code" : "Conectar"}
            </Button>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen app-bg lg:flex">
      <Sidebar />
      <main className="flex min-h-screen flex-1 flex-col pb-20 lg:h-screen lg:flex-row lg:overflow-hidden lg:pb-0">
        {/* Conversation list */}
        <section
          className={cn(
            "flex w-full flex-col border-border lg:w-[340px] lg:shrink-0 lg:border-r",
            conversationId && "hidden lg:flex",
          )}
        >
          <header className="px-4 pb-3 pt-6 sm:px-6 lg:px-5 lg:pt-7">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-pink">
              <MessageCircle className="h-4 w-4" />
              Atendimentos
            </div>
            <h1 className="text-[26px] font-semibold tracking-[-0.03em]">Conversas</h1>
            <div className="relative mt-4">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-11 rounded-[16px] bg-white pl-11 shadow-soft"
                placeholder="Buscar conversa ou paciente"
              />
            </div>
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
              const name = row.patientName ?? row.contactName ?? row.remoteJid.split("@")[0];
              const active = row.id === conversationId;
              return (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => selectConversation(row)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors",
                    active ? "bg-foreground text-white" : "hover:bg-white",
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
                      <span
                        className={cn(
                          "shrink-0 text-[11px]",
                          active ? "text-white/70" : "text-muted-foreground",
                        )}
                      >
                        {formatTime(row.lastMessageAt)}
                      </span>
                    </span>
                    <span className="mt-0.5 flex items-center justify-between gap-2">
                      <span
                        className={cn(
                          "truncate text-xs",
                          active ? "text-white/70" : "text-muted-foreground",
                        )}
                      >
                        {row.lastMessagePreview ?? "—"}
                      </span>
                      {row.unreadCount > 0 && (
                        <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-gradient-primary px-1.5 text-[10px] font-bold text-white">
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
                  {initials(selected.patientName ?? selected.contactName ?? selected.remoteJid.split("@")[0])}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {selected.patientName ?? selected.contactName ?? selected.remoteJid.split("@")[0]}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {selected.patientName ? "Paciente cadastrado" : "Sem cadastro vinculado"}
                  </p>
                </div>
              </header>

              <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8">
                <div className="mx-auto flex max-w-[720px] flex-col gap-2">
                  {messages.map((m) => (
                    <div key={m.id} className={cn("flex", m.fromMe ? "justify-end" : "justify-start")}>
                      <div
                        className={cn(
                          "max-w-[78%] rounded-2xl px-4 py-2.5 text-sm leading-6 shadow-soft",
                          m.fromMe ? "bg-gradient-primary text-white" : "bg-white text-foreground",
                        )}
                      >
                        <p className="whitespace-pre-wrap break-words">{m.body}</p>
                        <span
                          className={cn(
                            "mt-1 flex items-center justify-end gap-1 text-[10px]",
                            m.fromMe ? "text-white/70" : "text-muted-foreground",
                          )}
                        >
                          {formatTime(m.timestamp)}
                          {m.fromMe &&
                            (m.status === "failed" ? (
                              <X className="h-3 w-3" />
                            ) : m.status === "sending" ? (
                              <Clock className="h-3 w-3" />
                            ) : (
                              <CheckCheck className="h-3 w-3" />
                            ))}
                          {!m.fromMe && <Check className="hidden h-3 w-3" />}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <form
                className="flex items-end gap-2 border-t border-border bg-white/70 px-4 py-3 sm:px-6 lg:px-6"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (draft.trim() && !sendMutation.isPending) sendMutation.mutate();
                }}
              >
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (draft.trim() && !sendMutation.isPending) sendMutation.mutate();
                    }
                  }}
                  placeholder="Escreva uma mensagem"
                  rows={1}
                  className="max-h-32 min-h-11 flex-1 resize-none rounded-[16px] bg-white"
                />
                <Button
                  type="submit"
                  size="icon"
                  className="h-11 w-11 shrink-0 rounded-[16px] bg-gradient-primary text-white"
                  disabled={!draft.trim() || sendMutation.isPending}
                  aria-label="Enviar"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
