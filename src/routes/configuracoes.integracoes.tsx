import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import {
  AlertCircle,
  CheckCircle2,
  MoreHorizontal,
  Plus,
  Send,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { ResponsiveRouteState } from "@/components/layout/ResponsiveRouteState";
import { InboxSnapshot } from "@/components/atendimentos/InboxSnapshot";
import { MetaTriggerSheet } from "@/components/settings/MetaTriggerSheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/finance/format";
import { getPipelineStages } from "@/lib/atendimentos/pipeline.functions";
import {
  deleteMetaCapiTrigger,
  getMetaCapiEventLog,
  getMetaCapiSettings,
  listMetaCapiTriggers,
  saveMetaCapiSettings,
  saveMetaCapiTrigger,
  sendMetaCapiTestEvent,
  type MetaCapiTrigger,
  type SystemEvent,
} from "@/lib/integrations/meta-capi.functions";

export const SYSTEM_EVENT_LABEL: Record<SystemEvent, string> = {
  // Só "perdida": o ganho passou a consolidar um atendimento realizado, e a
  // conversão dele sai por "Agendamento muda de situação". Fossem os dois, a
  // mesma venda contaria em dobro para quem tivesse ambos configurados.
  "deal.status_changed": "Negociação é marcada como perdida",
  "pipeline.stage_changed": "Card entra numa etapa do funil",
  "appointment.created": "Agendamento é criado",
  "appointment.status_changed": "Agendamento muda de situação",
  "receivable.paid": "Recebimento é marcado como recebido",
  "patient.created": "Paciente é cadastrado",
};

const DEAL_STATUS_LABEL: Record<string, string> = {
  won: "Ganho",
  lost: "Perdido",
  negotiating: "Em negociação",
};

export const APPOINTMENT_STATUS_LABEL: Record<string, string> = {
  confirmed: "Confirmado",
  pending: "Pendente",
  in_progress: "Em atendimento",
  completed: "Concluído",
  missed: "Faltou",
  cancelled: "Cancelado",
};

export const Route = createFileRoute("/configuracoes/integracoes")({
  ssr: false,
  validateSearch: z.object({}),
  head: () => ({
    meta: [
      { title: "Integrações · NÓS Conecta" },
      {
        name: "description",
        content: "Conecte o Pixel da Meta e envie eventos de conversão automaticamente.",
      },
    ],
  }),
  errorComponent: ({ error }) => (
    <ResponsiveRouteState error={error}
      title="Não foi possível carregar as integrações"
      description="Houve uma falha ao buscar a configuração. Tente novamente em instantes."
    />
  ),
  notFoundComponent: () => <ResponsiveRouteState title="Página não encontrada" notFound />,
  component: IntegrationsPage,
});

function IntegrationsPage() {
  const queryClient = useQueryClient();
  const fetchSettings = useServerFn(getMetaCapiSettings);
  const fetchTriggers = useServerFn(listMetaCapiTriggers);
  const fetchStages = useServerFn(getPipelineStages);
  const fetchLog = useServerFn(getMetaCapiEventLog);
  const save = useServerFn(saveMetaCapiSettings);
  const test = useServerFn(sendMetaCapiTestEvent);
  const saveTrigger = useServerFn(saveMetaCapiTrigger);
  const removeTrigger = useServerFn(deleteMetaCapiTrigger);

  const settings = useQuery({
    queryKey: ["meta-capi-settings"],
    queryFn: () => fetchSettings(),
    staleTime: 15_000,
  });
  const triggers = useQuery({
    queryKey: ["meta-capi-triggers"],
    queryFn: () => fetchTriggers(),
    staleTime: 15_000,
  });
  const stages = useQuery({
    queryKey: ["pipeline-stages"],
    queryFn: () => fetchStages(),
    staleTime: 60_000,
  });
  const log = useQuery({
    queryKey: ["meta-capi-events"],
    queryFn: () => fetchLog(),
    staleTime: 5_000,
  });

  const [pixelId, setPixelId] = useState("");
  const [offlineEventSetId, setOfflineEventSetId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [testEventCode, setTestEventCode] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<MetaCapiTrigger | null>(null);
  const [pendingDelete, setPendingDelete] = useState<MetaCapiTrigger | null>(null);

  // Preenche o formulário quando a configuração salva chega. O token nunca
  // volta em claro do servidor, então o campo começa vazio e "vazio" salva
  // como "mantém o token atual".
  useEffect(() => {
    if (!settings.data) return;
    setPixelId(settings.data.pixelId);
    setOfflineEventSetId(settings.data.offlineEventSetId);
    setTestEventCode(settings.data.testEventCode);
    setEnabled(settings.data.enabled);
  }, [settings.data]);

  const refreshSettings = () =>
    queryClient.invalidateQueries({ queryKey: ["meta-capi-settings"] });
  const refreshTriggers = () =>
    queryClient.invalidateQueries({ queryKey: ["meta-capi-triggers"] });
  const refreshLog = () => queryClient.invalidateQueries({ queryKey: ["meta-capi-events"] });

  const saveMutation = useMutation({
    mutationFn: () =>
      save({ data: { pixelId, offlineEventSetId, accessToken, testEventCode, enabled } }),
    onSuccess: () => {
      toast.success("Integração salva");
      setAccessToken("");
      refreshSettings();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const testMutation = useMutation({
    mutationFn: () => test({}),
    onSuccess: (result: { testMode: boolean }) => {
      toast.success(
        result.testMode
          ? "Evento enviado — confira em Test Events no Gerenciador de Eventos."
          : "Evento enviado. Sem Test Event Code ele chega como produção.",
      );
      refreshSettings();
      refreshLog();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const toggleTrigger = useMutation({
    mutationFn: (trigger: MetaCapiTrigger) =>
      saveTrigger({ data: { ...trigger, active: !trigger.active } }),
    onSuccess: () => {
      toast.success("Gatilho atualizado");
      refreshTriggers();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deletion = useMutation({
    mutationFn: (trigger: MetaCapiTrigger) => removeTrigger({ data: { id: trigger.id } }),
    onSuccess: () => {
      toast.success("Gatilho excluído");
      setPendingDelete(null);
      refreshTriggers();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const stageName = (stageId?: string) =>
    stages.data?.stages.find((stage) => stage.id === stageId)?.name ?? "etapa removida";

  const conditionText = (trigger: MetaCapiTrigger) => {
    if (trigger.systemEvent === "deal.status_changed") {
      return trigger.conditions.dealStatus
        ? `situação "${DEAL_STATUS_LABEL[trigger.conditions.dealStatus] ?? trigger.conditions.dealStatus}"`
        : "qualquer situação";
    }
    if (trigger.systemEvent === "pipeline.stage_changed") {
      return trigger.conditions.stageId ? `etapa "${stageName(trigger.conditions.stageId)}"` : "qualquer etapa";
    }
    if (trigger.systemEvent === "appointment.status_changed") {
      return trigger.conditions.status
        ? `situação "${APPOINTMENT_STATUS_LABEL[trigger.conditions.status] ?? trigger.conditions.status}"`
        : "qualquer situação";
    }
    return null;
  };

  const valueText = (trigger: MetaCapiTrigger) => {
    if (trigger.valueSource === "fixed") return `valor fixo ${formatBRL(trigger.fixedValue ?? 0)}`;
    if (trigger.valueSource === "event") return "valor do próprio evento";
    return "sem valor";
  };

  const list = triggers.data ?? [];
  const connected = Boolean(
    settings.data?.hasToken && (settings.data?.pixelId || settings.data?.offlineEventSetId),
  );
  const offlineMode = Boolean(settings.data?.offlineEventSetId);
  // Lê o campo do formulário, não o valor salvo: a marcação de destino
  // precisa reagir enquanto a pessoa digita, antes de salvar.
  const offlineFilled = Boolean(offlineEventSetId.trim());

  return (
    <>
      <header>
        <h2 className="text-xl font-semibold tracking-tight">Integrações</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Envie eventos de conversão para a Meta direto do sistema, sem depender do navegador do
          paciente.
        </p>
      </header>

      <InboxSnapshot />

      {/* Conexão */}
      <div className="surface-card mt-6 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold">Meta Conversions API</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Credenciais do Gerenciador de Eventos.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {connected && (
              <span className="rounded-full bg-foreground/5 px-3 py-1 text-xs font-semibold">
                {offlineMode ? "Dataset offline" : "Pixel"}
              </span>
            )}
            <StatusPill
              connected={connected}
              enabled={settings.data?.enabled ?? false}
              lastError={settings.data?.lastError ?? null}
              lastSuccessAt={settings.data?.lastSuccessAt ?? null}
              needsReconnect={settings.data?.needsReconnect ?? false}
            />
          </div>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {/* Os dois campos são destinos alternativos, nunca simultâneos — o
              código manda para um só. Sem deixar isso visível, a leitura
              natural é que preencher ambos duplicaria as conversões. */}
          <div className={cn(offlineFilled && "opacity-55")}>
            <div className="flex items-center gap-2">
              <Label htmlFor="pixel-id">Pixel ID</Label>
              {!offlineFilled && <InUseTag />}
            </div>
            <Input
              id="pixel-id"
              value={pixelId}
              onChange={(event) => setPixelId(event.target.value)}
              placeholder="1234567890123456"
              className="mt-1.5 bg-white"
            />
            <p className="mt-1.5 text-2xs text-muted-foreground">
              {offlineFilled
                ? "Guardado, mas não usado enquanto houver conjunto offline preenchido."
                : "Recomendado para começar: funciona sem nenhum passo manual na Meta."}
            </p>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <Label htmlFor="offline-set">Conjunto de eventos offline (opcional)</Label>
              {offlineFilled && <InUseTag />}
            </div>
            <Input
              id="offline-set"
              value={offlineEventSetId}
              onChange={(event) => setOfflineEventSetId(event.target.value)}
              placeholder="Deixe em branco para usar o Pixel"
              className="mt-1.5 bg-white"
            />
            <p className="mt-1.5 text-2xs text-muted-foreground">
              Preenchido, os eventos vão para ele <strong>em vez</strong> do Pixel — nunca para os
              dois. Só compensa se o conjunto estiver vinculado às campanhas.
            </p>
          </div>
          <div>
            <Label htmlFor="access-token">Token de acesso</Label>
            <Input
              id="access-token"
              type="password"
              value={accessToken}
              onChange={(event) => setAccessToken(event.target.value)}
              placeholder={settings.data?.hasToken ? settings.data.tokenPreview : "EAAG..."}
              className="mt-1.5 bg-white"
            />
            <p className="mt-1.5 text-2xs text-muted-foreground">
              {settings.data?.hasToken
                ? "Já existe um token salvo. Deixe em branco para mantê-lo."
                : "Gere em Gerenciador de Eventos › Configurações › Conversions API."}
            </p>
          </div>
          <div>
            <Label htmlFor="test-code">Test Event Code (opcional)</Label>
            <Input
              id="test-code"
              value={testEventCode}
              onChange={(event) => setTestEventCode(event.target.value)}
              placeholder="TEST12345"
              className="mt-1.5 bg-white"
            />
            <p className="mt-1.5 text-2xs text-muted-foreground">
              Com o código preenchido, os eventos aparecem em Test Events e não contam como
              produção.
            </p>
          </div>
          <div className="flex items-end">
            <label className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border bg-white/65 px-4 py-3">
              <span>
                <span className="block text-sm font-medium">Integração ativa</span>
                <span className="block text-2xs text-muted-foreground">
                  Desligado, nenhum gatilho dispara.
                </span>
              </span>
              <Switch checked={enabled} onCheckedChange={setEnabled} />
            </label>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Button
            className="gap-2 bg-gradient-primary text-white"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? "Salvando..." : "Salvar"}
          </Button>
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => testMutation.mutate()}
            disabled={testMutation.isPending || !connected}
          >
            <Send className="h-4 w-4" />
            {testMutation.isPending ? "Enviando..." : "Enviar evento de teste"}
          </Button>
        </div>

        {/* Sem esse vínculo os eventos chegam na Meta mas não viram conversão
            atribuída — e a integração parece quebrada sem estar. É
            configuração manual no Gerenciador, não dá pra fazer por código. */}
        {offlineMode && (
          <p className="mt-4 flex items-start gap-2 rounded-2xl bg-coral-soft px-4 py-3 text-xs text-foreground/80">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-coral" />
            <span>
              No modo dataset offline, vincule o conjunto de eventos às campanhas no Gerenciador de
              Eventos da Meta. Sem isso os eventos chegam, mas não geram conversão atribuída.
            </span>
          </p>
        )}
      </div>

      {/* Gatilhos */}
      <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold tracking-tight">Gatilhos</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            O que acontece no sistema e qual evento isso envia para a Meta.
          </p>
        </div>
        <Button
          className="gap-2 bg-gradient-primary text-white"
          onClick={() => {
            setEditing(null);
            setSheetOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
          Adicionar gatilho
        </Button>
      </div>

      <div className="surface-card mt-4 divide-y divide-border overflow-hidden">
        {list.map((trigger) => {
          const condition = conditionText(trigger);
          return (
            <div key={trigger.id} className="flex min-h-[92px] items-center gap-3 px-4 py-4 sm:px-5">
              <span
                className={cn(
                  "grid h-11 w-11 shrink-0 place-items-center rounded-2xl",
                  trigger.active ? "bg-gradient-primary text-white" : "bg-muted text-muted-foreground",
                )}
              >
                <Zap className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-semibold sm:text-sm">{trigger.name}</p>
                  <span className="rounded-full bg-foreground/5 px-2 py-0.5 text-3xs font-semibold">
                    {trigger.metaEventName}
                  </span>
                  {!trigger.active && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-3xs font-semibold text-muted-foreground">
                      Pausado
                    </span>
                  )}
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {SYSTEM_EVENT_LABEL[trigger.systemEvent]}
                  {condition ? ` · ${condition}` : ""}
                </p>
                <p className="mt-1 truncate text-2xs text-muted-foreground/80">
                  {valueText(trigger)}
                </p>
                {/* Um gatilho antigo de "negociação ganha" fica mudo a partir
                    de agora. Melhor dizer isso na cara do que deixar a clínica
                    descobrir por conversões que pararam de chegar. */}
                {trigger.systemEvent === "deal.status_changed" &&
                  trigger.conditions.dealStatus === "won" && (
                    <p className="mt-1.5 rounded-xl bg-warning-soft px-2.5 py-1.5 text-2xs leading-4 text-warning">
                      Este gatilho não dispara mais. Marcar uma negociação como
                      ganha agora registra um atendimento realizado — aponte-o
                      para "Agendamento muda de situação", com a situação
                      "Concluído".
                    </p>
                  )}
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label={`Ações de ${trigger.name}`}>
                    <MoreHorizontal className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => {
                      setEditing(trigger);
                      setSheetOpen(true);
                    }}
                  >
                    Editar
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => toggleTrigger.mutate(trigger)}>
                    {trigger.active ? "Pausar" : "Ativar"}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-danger focus:text-danger"
                    onClick={() => setPendingDelete(trigger)}
                  >
                    Excluir
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        })}
        {!triggers.isLoading && !list.length && (
          <div className="grid min-h-72 place-items-center px-6 py-10 text-center">
            <div>
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-coral-soft text-coral">
                <Zap className="h-5 w-5" />
              </span>
              <h4 className="mt-4 font-semibold">Nenhum gatilho configurado</h4>
              <p className="mt-1 text-sm text-muted-foreground">
                Ex.: quando um card entra na etapa de fechamento, enviar Purchase.
              </p>
              <Button
                className="mt-5 gap-2 bg-gradient-primary text-white"
                onClick={() => {
                  setEditing(null);
                  setSheetOpen(true);
                }}
              >
                <Plus className="h-4 w-4" />
                Adicionar gatilho
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Histórico */}
      <h3 className="mt-8 text-lg font-semibold tracking-tight">Últimos envios</h3>
      <div className="surface-card mt-3 divide-y divide-border overflow-hidden">
        {(log.data ?? []).map((row) => (
          <div key={row.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
            {row.status === "sent" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0 text-danger" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{row.metaEventName}</p>
              <p className="truncate text-2xs text-muted-foreground">
                {SYSTEM_EVENT_LABEL[row.systemEvent as SystemEvent] ?? row.systemEvent}
                {row.error ? ` · ${row.error}` : ""}
              </p>
              {/* Campo descartado é a pista de match ruim: o dado existe no
                  cadastro mas está num formato que a Meta não aceita. */}
              {row.droppedKeys.length > 0 && (
                <p className="truncate text-2xs text-coral">
                  Campos descartados: {row.droppedKeys.join(", ")} — confira o cadastro do paciente.
                </p>
              )}
            </div>
            <span className="shrink-0 text-2xs text-muted-foreground">
              {new Date(row.sentAt).toLocaleString("pt-BR", {
                day: "2-digit",
                month: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
        ))}
        {!log.isLoading && !(log.data ?? []).length && (
          <div className="px-5 py-10 text-center text-sm text-muted-foreground">
            Nenhum evento enviado ainda.
          </div>
        )}
      </div>

      <MetaTriggerSheet
        open={sheetOpen}
        trigger={editing}
        stages={stages.data?.stages ?? []}
        existing={list}
        onOpenChange={setSheetOpen}
        onSaved={() => {
          refreshTriggers();
          setSheetOpen(false);
        }}
      />
      <AlertDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir este gatilho?</AlertDialogTitle>
            <AlertDialogDescription>
              Os eventos já enviados continuam no histórico. Nenhum evento novo será disparado por
              este gatilho.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-danger text-white hover:bg-danger/90"
              onClick={() => pendingDelete && deletion.mutate(pendingDelete)}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function InUseTag() {
  return (
    <span className="rounded-full bg-success-soft px-2 py-0.5 text-3xs font-semibold text-success">
      em uso
    </span>
  );
}

function StatusPill({
  connected,
  enabled,
  lastError,
  lastSuccessAt,
  needsReconnect,
}: {
  connected: boolean;
  enabled: boolean;
  lastError: string | null;
  lastSuccessAt: string | null;
  needsReconnect: boolean;
}) {
  if (!connected) {
    return (
      <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
        Não configurado
      </span>
    );
  }
  // Token expirado/revogado é diferente de falha de envio: reenviar não
  // resolve, precisa gerar outro token no Gerenciador.
  if (needsReconnect) {
    return (
      <span
        className="rounded-full bg-danger-soft px-3 py-1 text-xs font-semibold text-danger"
        title={lastError ?? undefined}
      >
        Reconectar — token expirado
      </span>
    );
  }
  if (lastError) {
    return (
      <span
        className="max-w-[240px] truncate rounded-full bg-danger-soft px-3 py-1 text-xs font-semibold text-danger"
        title={lastError}
      >
        Último envio falhou
      </span>
    );
  }
  if (!enabled) {
    return (
      <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
        Configurado, desligado
      </span>
    );
  }
  return (
    <span className="rounded-full bg-success-soft px-3 py-1 text-xs font-semibold text-success">
      {lastSuccessAt
        ? `Ativo · último envio ${new Date(lastSuccessAt).toLocaleDateString("pt-BR")}`
        : "Ativo"}
    </span>
  );
}
