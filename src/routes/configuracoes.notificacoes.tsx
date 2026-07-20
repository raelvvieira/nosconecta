import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Mail, MessageCircle, MessageSquareText, RotateCw, Send } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { Sidebar } from "@/components/finance/Sidebar";
import { ResponsiveRouteState } from "@/components/layout/ResponsiveRouteState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  getNotificationReplies,
  getNotificationsHealth,
  getNotificationsLog,
  resendNotification,
  sendTestNotification,
  type NotificationLogRow,
  type NotificationReplyRow,
  type NotificationsHealth,
} from "@/lib/notifications/notifications.functions";
import type { NotificationChannel, NotificationKind } from "@/components/agenda/types";

const searchSchema = z.object({});

export const Route = createFileRoute("/configuracoes/notificacoes")({
  ssr: false,
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Notificações · NÓS Conecta" },
      { name: "description", content: "Confirmação e lembretes automáticos por e-mail, SMS e WhatsApp." },
    ],
  }),
  errorComponent: () => (
    <ResponsiveRouteState
      title="Não foi possível carregar as notificações"
      description="Houve uma falha ao buscar os dados. Tente novamente em instantes."
    />
  ),
  notFoundComponent: () => <ResponsiveRouteState title="Página não encontrada" notFound />,
  component: NotificationsPage,
});

const KIND_LABEL: Record<NotificationKind, string> = {
  confirmation: "Confirmação",
  reminder_day_before: "1 dia antes",
  reminder_day_of: "No dia",
};
const KIND_OPTIONS: NotificationKind[] = ["confirmation", "reminder_day_before", "reminder_day_of"];
const CHANNEL_LABEL: Record<NotificationChannel, string> = {
  email: "E-mail",
  sms: "SMS",
  whatsapp: "WhatsApp",
};
const CHANNEL_OPTIONS: NotificationChannel[] = ["email", "sms", "whatsapp"];

function NotificationsPage() {
  const queryClient = useQueryClient();
  const fetchHealth = useServerFn(getNotificationsHealth);
  const fetchLog = useServerFn(getNotificationsLog);
  const fetchReplies = useServerFn(getNotificationReplies);
  const sendTest = useServerFn(sendTestNotification);
  const resend = useServerFn(resendNotification);

  const health = useQuery({
    queryKey: ["notifications-health"],
    queryFn: () => fetchHealth(),
    staleTime: 15_000,
  });
  const log = useQuery({
    queryKey: ["notifications-log"],
    queryFn: () => fetchLog(),
    staleTime: 5_000,
  });
  const replies = useQuery({
    queryKey: ["notifications-replies"],
    queryFn: () => fetchReplies(),
    staleTime: 5_000,
  });

  const [testChannel, setTestChannel] = useState<NotificationChannel>("email");
  const [testKind, setTestKind] = useState<NotificationKind>("confirmation");
  const [testDestination, setTestDestination] = useState("");

  const testMutation = useMutation({
    mutationFn: () =>
      sendTest({ data: { channel: testChannel, kind: testKind, destination: testDestination } }),
    onSuccess: () => toast.success("Teste enviado — confira o telefone/e-mail informado."),
    onError: (error: Error) => toast.error(error.message),
  });

  const resendMutation = useMutation({
    mutationFn: (row: NotificationLogRow) => resend({ data: { appointmentId: row.appointmentId, kind: row.kind } }),
    onSuccess: () => {
      toast.success("Reenvio disparado");
      queryClient.invalidateQueries({ queryKey: ["notifications-log"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const h: NotificationsHealth = health.data ?? {
    email: false,
    sms: false,
    whatsapp: false,
    whatsappInboundWebhook: false,
  };

  return (
    <div className="min-h-screen app-bg lg:flex">
      <Sidebar />
      <main className="mx-auto w-full max-w-[1000px] px-4 pb-28 pt-7 sm:px-6 lg:px-10 lg:pb-12 lg:pt-9">
        <Link
          to="/configuracoes"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Configurações
        </Link>

        <header className="mt-3">
          <h1 className="text-[26px] font-semibold tracking-[-0.03em] lg:text-[32px]">Notificações</h1>
          <p className="mt-1 text-[15px] text-muted-foreground">
            Confirmação de agendamento e lembretes automáticos por e-mail, SMS e WhatsApp.
          </p>
        </header>

        {/* Status por canal */}
        <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <ChannelStatus icon={Mail} label="E-mail" ok={h.email} loading={health.isLoading} />
          <ChannelStatus icon={MessageSquareText} label="SMS" ok={h.sms} loading={health.isLoading} />
          <ChannelStatus icon={MessageCircle} label="WhatsApp (envio)" ok={h.whatsapp} loading={health.isLoading} />
          <ChannelStatus
            icon={MessageCircle}
            label="WhatsApp (respostas)"
            ok={h.whatsappInboundWebhook}
            loading={health.isLoading}
          />
        </section>

        {/* Testar envio */}
        <section className="surface-card mt-6 p-5">
          <h2 className="text-base font-semibold">Testar envio</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Dispara uma mensagem com dados fictícios, sem precisar de um agendamento real.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_1.4fr_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label className="text-sm">Canal</Label>
              <select
                className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
                value={testChannel}
                onChange={(e) => setTestChannel(e.target.value as NotificationChannel)}
              >
                {CHANNEL_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {CHANNEL_LABEL[c]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Tipo</Label>
              <select
                className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
                value={testKind}
                onChange={(e) => setTestKind(e.target.value as NotificationKind)}
              >
                {KIND_OPTIONS.map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">
                {testChannel === "email" ? "E-mail de destino" : "Telefone de destino"}
              </Label>
              <Input
                value={testDestination}
                onChange={(e) => setTestDestination(e.target.value)}
                placeholder={testChannel === "email" ? "voce@exemplo.com" : "(51) 99999-9999"}
                className="h-11 rounded-xl"
              />
            </div>
            <Button
              className="h-11 gap-2 bg-gradient-primary text-white"
              disabled={!testDestination.trim() || testMutation.isPending}
              onClick={() => testMutation.mutate()}
            >
              <Send className="h-4 w-4" />
              {testMutation.isPending ? "Enviando..." : "Enviar teste"}
            </Button>
          </div>
        </section>

        {/* Log de notificações */}
        <section className="surface-card mt-6 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4">
            <h2 className="text-base font-semibold">Notificações recentes</h2>
          </div>
          <div className="divide-y divide-border">
            {(log.data ?? []).map((row) => (
              <div key={row.id} className="flex items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{row.patientName ?? "—"}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {KIND_LABEL[row.kind]} · {CHANNEL_LABEL[row.channel]}
                    {row.date ? ` · ${formatDateBR(row.date)}${row.startTime ? ` ${row.startTime}` : ""}` : ""}
                  </p>
                  {row.error && (
                    <p className="mt-0.5 truncate text-xs text-danger" title={row.error}>
                      {row.error}
                    </p>
                  )}
                </div>
                <StatusPill status={row.status} />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Reenviar"
                  disabled={resendMutation.isPending}
                  onClick={() => resendMutation.mutate(row)}
                >
                  <RotateCw className="h-4 w-4" />
                </Button>
              </div>
            ))}
            {!log.isLoading && (log.data ?? []).length === 0 && (
              <div className="px-5 py-10 text-center text-sm text-muted-foreground">
                Nenhuma notificação disparada ainda.
              </div>
            )}
          </div>
        </section>

        {/* Respostas recebidas */}
        <section className="surface-card mt-6 overflow-hidden">
          <div className="px-5 py-4">
            <h2 className="text-base font-semibold">Respostas recebidas (WhatsApp)</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              "Confirmado" atualiza o agendamento sozinho. Pedidos de cancelamento ficam sinalizados
              aqui para revisão manual — nunca cancelamos automaticamente a partir de uma mensagem.
            </p>
          </div>
          <div className="divide-y divide-border">
            {(replies.data ?? []).map((row) => (
              <div key={row.id} className="flex items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{row.patientName ?? row.fromPhone}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">"{row.messageText}"</p>
                </div>
                <ReplyActionPill action={row.action} />
              </div>
            ))}
            {!replies.isLoading && (replies.data ?? []).length === 0 && (
              <div className="px-5 py-10 text-center text-sm text-muted-foreground">
                Nenhuma resposta recebida ainda.
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

function ChannelStatus({
  icon: Icon,
  label,
  ok,
  loading,
}: {
  icon: typeof Mail;
  label: string;
  ok: boolean;
  loading: boolean;
}) {
  return (
    <div className="surface-card flex items-center gap-3 p-4">
      <span
        className={cn(
          "grid h-10 w-10 shrink-0 place-items-center rounded-2xl",
          loading ? "bg-muted text-muted-foreground" : ok ? "bg-success-soft text-success" : "bg-muted text-muted-foreground",
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{label}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {loading ? "Verificando..." : ok ? "Configurado" : "Não configurado"}
        </p>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: NotificationLogRow["status"] }) {
  const style =
    status === "sent"
      ? { bg: "bg-success-soft", text: "text-success", label: "Enviado" }
      : status === "failed"
        ? { bg: "bg-danger-soft", text: "text-danger", label: "Falhou" }
        : status === "skipped"
          ? { bg: "bg-muted", text: "text-muted-foreground", label: "Pulado" }
          : { bg: "bg-warning-soft", text: "text-warning", label: "Pendente" };
  return (
    <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold", style.bg, style.text)}>
      {style.label}
    </span>
  );
}

function ReplyActionPill({ action }: { action: string }) {
  const style =
    action === "confirmed"
      ? { bg: "bg-success-soft", text: "text-success", label: "Confirmado" }
      : action === "declined"
        ? { bg: "bg-warning-soft", text: "text-warning", label: "Pediu cancelar — revisar" }
        : action === "no_patient_found"
          ? { bg: "bg-muted", text: "text-muted-foreground", label: "Paciente não identificado" }
          : action === "no_appointment_found"
            ? { bg: "bg-muted", text: "text-muted-foreground", label: "Sem agendamento futuro" }
            : { bg: "bg-muted", text: "text-muted-foreground", label: "Não entendido" };
  return (
    <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold", style.bg, style.text)}>
      {style.label}
    </span>
  );
}

function formatDateBR(dateStr: string) {
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}
