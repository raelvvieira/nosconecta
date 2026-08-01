// Move em sequência uma lista de pipeline items pra uma etapa de destino,
// reaproveitando movePipelineItem (já confirmado/testado) — usado depois
// que uma campanha segmentada é disparada, pra mover os contatos
// alcançados. Roda no frontend (não numa Edge Function) de propósito: um
// loop de até `daily_send_limit` chamadas HTTP sequenciais ao CRM correria
// risco de estourar o timeout de execução de uma Edge Function Deno.
export async function moveContactsToStage(
  mover: (args: { itemId: string; newStageId: string }) => Promise<unknown>,
  pipelineItemIds: string[],
  targetStageId: string,
  onProgress?: (done: number, total: number) => void,
): Promise<{ succeededIds: string[]; failedIds: string[] }> {
  const succeededIds: string[] = [];
  const failedIds: string[] = [];

  for (let i = 0; i < pipelineItemIds.length; i++) {
    const itemId = pipelineItemIds[i];
    try {
      await mover({ itemId, newStageId: targetStageId });
      succeededIds.push(itemId);
    } catch {
      failedIds.push(itemId);
    }
    onProgress?.(i + 1, pipelineItemIds.length);
  }

  return { succeededIds, failedIds };
}
