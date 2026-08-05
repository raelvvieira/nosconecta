import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Rocket } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import {
  saveCampaign,
  saveMessageTemplate,
  executeCampaign,
  updatePendingMove,
  type MessageInterval,
} from "@/lib/atendimentos/campaigns.functions";
import { movePipelineItem } from "@/lib/atendimentos/pipeline.functions";
import { moveContactsToStage } from "@/lib/atendimentos/campaignMoveLoop";
import { FunnelSection, type ResolvedAudience } from "./FunnelSection";
import { PacingSection } from "./PacingSection";
import { MessageComposer, HIDDEN_TEMPLATE_PREFIX, type ComposerState } from "./MessageComposer";
import { PhonePreview } from "./PhonePreview";
import { CreateTransmissionDialog } from "./CreateTransmissionDialog";

const EMPTY_AUDIENCE: ResolvedAudience = { moveCandidateItemIds: [] };

const INITIAL_COMPOSER: ComposerState = {
  mode: "digitar",
  templateId: null,
  isNewTemplate: true,
  newTemplateName: "",
  content: "",
  mediaUrl: null,
};

function isComposerReady(state: ComposerState): boolean {
  if (state.mode === "digitar") return state.content.trim().length > 0;
  if (state.isNewTemplate) return state.newTemplateName.trim().length > 0 && state.content.trim().length > 0;
  return !!state.templateId;
}

export function NewCampaignSheet({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const queryClient = useQueryClient();
  const doSaveTemplate = useServerFn(saveMessageTemplate);
  const doSaveCampaign = useServerFn(saveCampaign);
  const doExecuteCampaign = useServerFn(executeCampaign);
  const doMovePipelineItem = useServerFn(movePipelineItem);
  const doUpdatePendingMove = useServerFn(updatePendingMove);

  const [targetStageId, setTargetStageId] = useState<string | null>(null);
  const [audience, setAudience] = useState<ResolvedAudience>(EMPTY_AUDIENCE);

  const [interval, setInterval] = useState<MessageInterval>("5_10");
  const [pauseAfterCount, setPauseAfterCount] = useState<number | null>(null);
  const [resumeAfterMinutes, setResumeAfterMinutes] = useState<number | null>(null);

  const [composer, setComposer] = useState<ComposerState>(INITIAL_COMPOSER);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [moveProgress, setMoveProgress] = useState<{ done: number; total: number } | null>(null);

  const reset = () => {
    setTargetStageId(null);
    setAudience(EMPTY_AUDIENCE);
    setInterval("5_10");
    setPauseAfterCount(null);
    setResumeAfterMinutes(null);
    setComposer(INITIAL_COMPOSER);
    setMoveProgress(null);
  };

  const canProceed = isComposerReady(composer);

  const confirmMutation = useMutation({
    mutationFn: async ({ title }: { title: string }) => {
      let templateId = composer.templateId;
      if (composer.isNewTemplate) {
        const name =
          composer.mode === "digitar"
            ? `${HIDDEN_TEMPLATE_PREFIX}${crypto.randomUUID().slice(0, 6)}`
            : composer.newTemplateName.trim();
        const result = await doSaveTemplate({
          data: { name, content: composer.content, mediaUrl: composer.mediaUrl ?? undefined },
        });
        if (!result.template) throw new Error("O CRM não retornou o template criado.");
        templateId = result.template.id;
      }

      // sendToAll sempre true: segmentação por etapa do pipeline não é
      // suportada pelo CRM (confirmado no manual — campanhas e pipeline não
      // se comunicam). Ver comentário em FunnelSection.tsx.
      const campaignResult = await doSaveCampaign({
        data: {
          title,
          sendToAll: true,
          messageInterval: interval,
          templateId: templateId ?? undefined,
          targetStageId,
          moveContactIds: targetStageId ? audience.moveCandidateItemIds : undefined,
          pauseAfterCount,
          resumeAfterMinutes,
        },
      });
      const campaignId = campaignResult.campaign?.id;
      if (!campaignId) throw new Error("O CRM não retornou a campanha criada.");

      const executeResult = await doExecuteCampaign({ data: { campaignId } });

      if (targetStageId && audience.moveCandidateItemIds.length > 0) {
        setMoveProgress({ done: 0, total: audience.moveCandidateItemIds.length });
        const { failedIds } = await moveContactsToStage(
          (args) => doMovePipelineItem({ data: args }),
          audience.moveCandidateItemIds,
          targetStageId,
          (done, total) => setMoveProgress({ done, total }),
        );
        await doUpdatePendingMove({ data: { campaignId, remainingIds: failedIds } });
        setMoveProgress(null);
        if (failedIds.length > 0) {
          toast.warning(`Campanha disparada, mas ${failedIds.length} contato(s) não foram movidos de etapa — tente novamente na lista de campanhas.`);
        }
      }

      return executeResult;
    },
    onSuccess: (res) => {
      toast.success(`Campanha disparada — ~${res.recipientsCounted} contato(s)`);
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["campaigns-usage"] });
      queryClient.invalidateQueries({ queryKey: ["pipeline-items"] });
      setDialogOpen(false);
      onOpenChange(false);
      reset();
      onCreated();
    },
    onError: (error: Error) => {
      setMoveProgress(null);
      toast.error(error.message);
    },
  });

  return (
    <>
      <Sheet open={open} onOpenChange={(next) => { if (!next) reset(); onOpenChange(next); }}>
        <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-2xl">
          <SheetHeader className="border-b border-border bg-gradient-to-br from-pink-soft/50 to-coral-soft/40 px-6 py-5 text-left">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-primary text-white shadow-soft">
                <Rocket className="h-5 w-5" />
              </span>
              <div>
                <SheetTitle>Nova campanha</SheetTitle>
                <SheetDescription>Configure o ritmo, o funil e a mensagem antes de disparar.</SheetDescription>
              </div>
            </div>
          </SheetHeader>

          <div className="space-y-7 px-6 py-6">
            <PacingSection
              interval={interval}
              pauseAfterCount={pauseAfterCount}
              resumeAfterMinutes={resumeAfterMinutes}
              onIntervalChange={setInterval}
              onPauseAfterChange={setPauseAfterCount}
              onResumeAfterChange={setResumeAfterMinutes}
            />

            <FunnelSection
              targetStageId={targetStageId}
              onTargetStageChange={setTargetStageId}
              onAudienceResolved={setAudience}
            />

            <div className="grid gap-6 lg:grid-cols-[1fr_220px]">
              <MessageComposer state={composer} onChange={setComposer} />
              <PhonePreview content={composer.content} mediaUrl={composer.mediaUrl} />
            </div>

            <div className="flex gap-3 border-t border-border pt-5">
              <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button
                type="button"
                className="flex-1 gap-2 bg-gradient-primary text-white"
                disabled={!canProceed}
                onClick={() => setDialogOpen(true)}
              >
                Prosseguir
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <CreateTransmissionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        defaultTitle=""
        isPending={confirmMutation.isPending}
        moveProgress={moveProgress}
        onConfirm={(title) => confirmMutation.mutate({ title })}
      />
    </>
  );
}
