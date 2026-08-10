import { useEffect, useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Workflow } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getPipelineItems, getPipelineStages, type PipelineStage } from "@/lib/atendimentos/pipeline.functions";

export interface ResolvedAudience {
  // Ids do próprio pipeline item (PipelineItem.id) pra mover depois do
  // envio — todo contato que já tem algum card no funil, em qualquer etapa
  // (não criamos card novo pra quem nunca teve).
  moveCandidateItemIds: string[];
}

const EMPTY_AUDIENCE: ResolvedAudience = { moveCandidateItemIds: [] };

function StageDot({ color }: { color: string | null }) {
  return <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color ?? "var(--foreground-subtle)" }} />;
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
  targetStageId,
  onTargetStageChange,
  onAudienceResolved,
}: {
  targetStageId: string | null;
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
    // Toda campanha manda pra todos os contatos (ver comentário abaixo) —
    // "mover pra etapa" pega todo contato que já tem card no funil.
    const moveCandidateItemIds = items.filter((i) => i.type === "contact").map((i) => i.id);
    return { moveCandidateItemIds };
  }, [configured, items]);

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
          Configure um pipeline em Atendimentos → Pipeline pra poder mover contatos de etapa após o envio.
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

      {/* Segmentar por etapa de origem foi removido: confirmado no manual
          de integração do CRM (seção 14) que campanhas e pipeline não se
          comunicam — o filtro nunca teria funcionado de verdade, mesmo
          aparentando estar segmentando na tela. Toda campanha vai
          `sendToAll: true`. Mover pra etapa após o envio continua, porque
          é feito pelo nosso próprio frontend via pipeline_items/move_to_stage
          (confirmado), não depende do motor de campanhas entender nada. */}
      <div>
        <label className="text-sm font-medium">Mover pra etapa após o envio</label>
        <StageSelect stages={stages} value={targetStageId} onChange={onTargetStageChange} placeholder="Não mover" />
      </div>
    </section>
  );
}
