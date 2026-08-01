import { useEffect, useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Workflow } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getPipelineItems, getPipelineStages, type PipelineStage } from "@/lib/atendimentos/pipeline.functions";

export interface ResolvedAudience {
  // Ids de contato do CRM (PipelineItem.itemId) pra segmentar o disparo —
  // só faz sentido quando há etapa de origem escolhida.
  sendContactIds: string[];
  directCount: number;
  ignoredConversationCount: number;
  // Ids do próprio pipeline item (PipelineItem.id) pra mover depois do
  // envio — quando não há etapa de origem, considera todo contato que já
  // tem algum card no funil (não cria card novo pra quem nunca teve).
  moveCandidateItemIds: string[];
}

const EMPTY_AUDIENCE: ResolvedAudience = {
  sendContactIds: [],
  directCount: 0,
  ignoredConversationCount: 0,
  moveCandidateItemIds: [],
};

function StageDot({ color }: { color: string | null }) {
  return <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color ?? "#94A3B8" }} />;
}

function StageSelect({
  stages,
  value,
  onChange,
  placeholder,
}: {
  stages: PipelineStage[];
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder: string;
}) {
  return (
    <Select value={value ?? "none"} onValueChange={(v) => onChange(v === "none" ? null : v)}>
      <SelectTrigger className="mt-1.5">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">Nenhuma</SelectItem>
        {stages.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            <span className="flex items-center gap-2">
              <StageDot color={s.color} />
              {s.name}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function FunnelSection({
  sourceStageId,
  targetStageId,
  onSourceStageChange,
  onTargetStageChange,
  onAudienceResolved,
}: {
  sourceStageId: string | null;
  targetStageId: string | null;
  onSourceStageChange: (stageId: string | null) => void;
  onTargetStageChange: (stageId: string | null) => void;
  onAudienceResolved: (audience: ResolvedAudience) => void;
}) {
  const fetchStages = useServerFn(getPipelineStages);
  const fetchItems = useServerFn(getPipelineItems);

  const stagesQuery = useQuery({
    queryKey: ["pipeline-stages"],
    queryFn: () => fetchStages(),
    staleTime: 30_000,
  });
  const configured = stagesQuery.data?.configured ?? false;
  const stages = stagesQuery.data?.stages ?? [];

  const itemsQuery = useQuery({
    queryKey: ["pipeline-items"],
    queryFn: () => fetchItems(),
    enabled: configured,
    staleTime: 15_000,
  });
  const items = itemsQuery.data?.items ?? [];

  const audience = useMemo(() => {
    if (!configured) return EMPTY_AUDIENCE;

    const inSourceStage = sourceStageId ? items.filter((i) => i.stageId === sourceStageId) : [];
    const directCount = inSourceStage.filter((i) => i.type === "contact").length;
    const ignoredConversationCount = inSourceStage.filter((i) => i.type === "conversation").length;
    const sendContactIds = inSourceStage.filter((i) => i.type === "contact").map((i) => i.itemId);

    // Candidatos a mover pós-envio: se há etapa de origem, é a mesma
    // audiência filtrada; senão (sendToAll), é todo contato que já tem
    // algum card no funil, em qualquer etapa — não criamos card novo pra
    // quem nunca teve.
    const moveCandidateItemIds = sourceStageId
      ? inSourceStage.filter((i) => i.type === "contact").map((i) => i.id)
      : items.filter((i) => i.type === "contact").map((i) => i.id);

    const resolved: ResolvedAudience = { sendContactIds, directCount, ignoredConversationCount, moveCandidateItemIds };
    return resolved;
  }, [configured, items, sourceStageId]);

  useEffect(() => {
    onAudienceResolved(audience);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audience]);

  if (!configured) {
    return (
      <section className="space-y-1.5">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          <Workflow className="h-3.5 w-3.5" />
          Funil
          <span className="normal-case tracking-normal text-muted-foreground/70">(opcional)</span>
        </p>
        <p className="text-xs text-muted-foreground">
          Configure um pipeline em Atendimentos → Pipeline pra poder segmentar ou mover contatos por etapa.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        <Workflow className="h-3.5 w-3.5" />
        Funil
        <span className="normal-case tracking-normal text-muted-foreground/70">(opcional)</span>
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="text-sm font-medium">Segmentar por etapa de origem</label>
          <StageSelect stages={stages} value={sourceStageId} onChange={onSourceStageChange} placeholder="Enviar pra todos" />
        </div>
        <div>
          <label className="text-sm font-medium">Mover pra etapa após o envio</label>
          <StageSelect stages={stages} value={targetStageId} onChange={onTargetStageChange} placeholder="Não mover" />
        </div>
      </div>

      {sourceStageId && (
        <p className="rounded-2xl border border-border bg-white p-3 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{audience.directCount} contato(s)</span> nessa etapa vão receber a
          campanha.
          {audience.ignoredConversationCount > 0 && (
            <> {audience.ignoredConversationCount} conversa(s) na mesma etapa sem contato confirmado serão ignoradas.</>
          )}
        </p>
      )}
    </section>
  );
}
