import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Megaphone, Pause, Play, Plus, Rocket, Square } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { ResponsiveRouteState } from "@/components/layout/ResponsiveRouteState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { WhatsappStatusBadge } from "@/components/atendimentos/WhatsappStatusBadge";
import { cn } from "@/lib/utils";
import {
  MESSAGE_INTERVAL_OPTIONS,
  campaignLifecycle,
  executeCampaign,
  getCampaigns,
  getDailySendUsage,
  getMessageTemplates,
  saveCampaign,
  saveMessageTemplate,
  setDailySendLimit,
  type MessageInterval,
} from "@/lib/atendimentos/campaigns.functions";

const searchSchema = z.object({});

export const Route = createFileRoute("/atendimentos/campanhas")({
  ssr: false,
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Campanhas · Atendimentos · NÓS Conecta" },
      { name: "description", content: "Disparo de mensagens em massa pelo WhatsApp." },
    ],
  }),
  errorComponent: () => (
    <ResponsiveRouteState
      title="Não foi possível carregar as campanhas"
      description="Houve uma falha ao buscar as campanhas. Tente novamente em instantes."
    />
  ),
  notFoundComponent: () => <ResponsiveRouteState title="Página não encontrada" notFound />,
  component: CampanhasPage,
});

const STATUS_LABEL: Record<string, string> = {
  draft: "Rascunho",
  scheduled: "Agendada",
  running: "Em andamento",
  paused: "Pausada",
  completed: "Concluída",
  stopped: "Parada",
};

function CampanhasPage() {
  const queryClient = useQueryClient();
  const fetchCampaigns = useServerFn(getCampaigns);
  const fetchUsage = useServerFn(getDailySendUsage);
  const doSetLimit = useServerFn(setDailySendLimit);
  const doExecute = useServerFn(executeCampaign);
  const doLifecycle = useServerFn(campaignLifecycle);

  const campaignsQuery = useQuery({ queryKey: ["campaigns"], queryFn: () => fetchCampaigns(), staleTime: 10_000 });
  const usageQuery = useQuery({ queryKey: ["campaigns-usage"], queryFn: () => fetchUsage(), staleTime: 15_000 });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    queryClient.invalidateQueries({ queryKey: ["campaigns-usage"] });
  };

  const executeMutation = useMutation({
    mutationFn: (campaignId: string) => doExecute({ data: { campaignId } }),
    onSuccess: (res) => {
      toast.success(`Campanha disparada — ~${res.recipientsCounted} contatos`);
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const lifecycleMutation = useMutation({
    mutationFn: (vars: { campaignId: string; action: "pause" | "resume" | "stop" }) => doLifecycle({ data: vars }),
    onSuccess: () => {
      toast.success("Atualizado");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const [limitInput, setLimitInput] = useState("");
  const limitMutation = useMutation({
    mutationFn: () => doSetLimit({ data: { limit: Number(limitInput) } }),
    onSuccess: () => {
      toast.success("Limite atualizado");
      setLimitInput("");
      queryClient.invalidateQueries({ queryKey: ["campaigns-usage"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const [formOpen, setFormOpen] = useState(false);
  const usage = usageQuery.data ?? { limit: 200, usedToday: 0 };
  const usagePct = usage.limit > 0 ? Math.min(100, Math.round((usage.usedToday / usage.limit) * 100)) : 0;

  return (
    <>
      <main className="mx-auto w-full max-w-[900px] px-4 pb-28 pt-7 sm:px-6 lg:px-10 lg:pb-12 lg:pt-9">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <h1 className="flex items-center gap-2 text-[26px] font-semibold tracking-[-0.03em]">
            <Megaphone className="h-5 w-5 text-pink" />
            Campanhas
          </h1>
          <div className="flex items-center gap-2.5">
            <WhatsappStatusBadge />
            <Button className="gap-2 bg-gradient-primary text-white" onClick={() => setFormOpen(true)}>
              <Plus className="h-4 w-4" />
              Nova campanha
            </Button>
          </div>
        </header>

        <section className="surface-card mt-5 p-4 sm:p-5">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Limite diário de disparo</span>
            <span className="text-muted-foreground">
              {usage.usedToday}/{usage.limit} contatos hoje
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full", usagePct >= 100 ? "bg-danger" : "bg-gradient-primary")}
              style={{ width: `${usagePct}%` }}
            />
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Input
              value={limitInput}
              onChange={(e) => setLimitInput(e.target.value.replace(/\D/g, ""))}
              placeholder={`Novo limite (atual: ${usage.limit})`}
              className="h-9 max-w-[220px] rounded-xl"
            />
            <Button
              variant="outline"
              size="sm"
              disabled={!limitInput || limitMutation.isPending}
              onClick={() => limitMutation.mutate()}
            >
              Salvar limite
            </Button>
          </div>
        </section>

        <section className="surface-card mt-5 divide-y divide-border overflow-hidden">
          {(campaignsQuery.data ?? []).length === 0 && (
            <div className="grid min-h-40 place-items-center px-6 text-center">
              <p className="text-sm text-muted-foreground">Nenhuma campanha criada ainda.</p>
            </div>
          )}
          {(campaignsQuery.data ?? []).map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-4 sm:px-5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{c.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {STATUS_LABEL[c.status] ?? c.status} · {c.sendToAll ? "Todos os contatos" : "Segmento"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={executeMutation.isPending}
                  onClick={() => executeMutation.mutate(c.id)}
                >
                  <Rocket className="h-3.5 w-3.5" />
                  Disparar
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => lifecycleMutation.mutate({ campaignId: c.id, action: "pause" })}
                  aria-label="Pausar"
                >
                  <Pause className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => lifecycleMutation.mutate({ campaignId: c.id, action: "resume" })}
                  aria-label="Retomar"
                >
                  <Play className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-danger"
                  onClick={() => lifecycleMutation.mutate({ campaignId: c.id, action: "stop" })}
                  aria-label="Parar"
                >
                  <Square className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </section>
      </main>

      <NewCampaignSheet open={formOpen} onOpenChange={setFormOpen} onCreated={refresh} />
    </>
  );
}

function NewCampaignSheet({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const fetchTemplates = useServerFn(getMessageTemplates);
  const doSaveTemplate = useServerFn(saveMessageTemplate);
  const doSaveCampaign = useServerFn(saveCampaign);

  const templatesQuery = useQuery({
    queryKey: ["message-templates"],
    queryFn: () => fetchTemplates(),
    enabled: open,
    staleTime: 10_000,
  });

  const [title, setTitle] = useState("");
  const [sendToAll, setSendToAll] = useState(true);
  const [interval, setInterval] = useState<MessageInterval>("5_10");
  const [templateId, setTemplateId] = useState<string>("");
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateContent, setNewTemplateContent] = useState("");
  const [creatingTemplate, setCreatingTemplate] = useState(false);

  const reset = () => {
    setTitle("");
    setSendToAll(true);
    setInterval("5_10");
    setTemplateId("");
    setNewTemplateName("");
    setNewTemplateContent("");
    setCreatingTemplate(false);
  };

  const submit = useMutation({
    mutationFn: async () => {
      let finalTemplateId = templateId || undefined;
      if (creatingTemplate) {
        if (!newTemplateName.trim() || !newTemplateContent.trim()) {
          throw new Error("Preencha nome e conteúdo do template.");
        }
        await doSaveTemplate({ data: { name: newTemplateName.trim(), content: newTemplateContent.trim() } });
      }
      return doSaveCampaign({
        data: { title: title.trim(), sendToAll, messageInterval: interval, templateId: finalTemplateId },
      });
    },
    onSuccess: () => {
      toast.success("Campanha criada");
      reset();
      onOpenChange(false);
      onCreated();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Nova campanha</SheetTitle>
        </SheetHeader>

        <form
          className="mt-4 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit.mutate();
          }}
        >
          <div>
            <Label htmlFor="campaign-title">Título</Label>
            <Input id="campaign-title" value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1.5" required />
          </div>

          <div className="flex items-center justify-between rounded-2xl border border-border p-3">
            <div>
              <p className="text-sm font-medium">Enviar para todos os contatos</p>
              <p className="text-xs text-muted-foreground">Segmentação por etapa ainda não disponível</p>
            </div>
            <Switch checked={sendToAll} onCheckedChange={setSendToAll} />
          </div>

          <div>
            <Label>Intervalo entre mensagens</Label>
            <Select value={interval} onValueChange={(v) => setInterval(v as MessageInterval)}>
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MESSAGE_INTERVAL_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Template da mensagem</Label>
            <p className="mt-1 text-[11px] text-muted-foreground">
              A lista de templates hoje é compartilhada entre todas as contas do CRM — evite nomes genéricos.
            </p>
            {!creatingTemplate ? (
              <div className="mt-1.5 space-y-2">
                <Select value={templateId} onValueChange={setTemplateId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Escolher template existente" />
                  </SelectTrigger>
                  <SelectContent>
                    {(templatesQuery.data ?? []).map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button type="button" variant="outline" size="sm" onClick={() => setCreatingTemplate(true)}>
                  Criar novo template
                </Button>
              </div>
            ) : (
              <div className="mt-1.5 space-y-2 rounded-2xl border border-border p-3">
                <Input
                  value={newTemplateName}
                  onChange={(e) => setNewTemplateName(e.target.value)}
                  placeholder="Nome do template"
                />
                <Textarea
                  value={newTemplateContent}
                  onChange={(e) => setNewTemplateContent(e.target.value)}
                  placeholder="Conteúdo da mensagem"
                  rows={4}
                />
                <Button type="button" variant="ghost" size="sm" onClick={() => setCreatingTemplate(false)}>
                  Usar um template existente em vez disso
                </Button>
              </div>
            )}
          </div>

          <Button
            type="submit"
            className="w-full gap-2 bg-gradient-primary text-white"
            disabled={!title.trim() || submit.isPending}
          >
            Criar campanha
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
