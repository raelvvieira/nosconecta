-- Uma pessoa não pode entrar duas vezes na MESMA campanha.
--
-- ── O que aconteceu ───────────────────────────────────────────────────────
--
-- O disparo de 31/08 mandou a mensagem DUAS vezes para várias pessoas, criou
-- duas conversas para cada uma no CRM e debitou a cota do dia em dobro.
--
-- A raiz é do lado do navegador: a leitura de contatos pedia seis páginas em
-- paralelo sobre uma lista que o próprio disparo reordena (criar conversa
-- atualiza a atividade do contato) e juntava com `concat`, sem conjunto de
-- vistos. O mesmo contato caía no array duas vezes; a seleção é um `Set` de
-- ids, mas o mapeamento para alvos é um `filter` sobre o array — então um
-- clique virava dois alvos.
--
-- Isso já foi corrigido em três camadas de código (leitura, montagem dos alvos
-- e a Edge Function antes do INSERT). Esta é a quarta, e a única que não
-- depende de nenhuma delas ter sido chamada.
--
-- ── Por que o índice é PARCIAL ────────────────────────────────────────────
--
-- Só sobre `status = 'pending'`. Um alvo já `sent` é o registro de uma mensagem
-- que de fato foi entregue — apagá-lo para caber num índice único destruiria o
-- histórico de um envio real, inclusive o das duplicatas de hoje, que é
-- exatamente a prova de que isto aconteceu.
--
-- Pendente é o que ainda pode virar mensagem. É lá que a garantia importa.

-- Limpa os pendentes repetidos que já estejam na fila, mantendo o primeiro a
-- sair. Sem isto o CREATE UNIQUE INDEX abaixo falha, e a migration inteira
-- volta atrás.
DELETE FROM public.whatsapp_broadcast_targets t
WHERE t.status = 'pending'
  AND EXISTS (
    SELECT 1
    FROM public.whatsapp_broadcast_targets anterior
    WHERE anterior.status = 'pending'
      AND anterior.broadcast_id = t.broadcast_id
      AND anterior.contact_id = t.contact_id
      AND (anterior.scheduled_for, anterior.id) < (t.scheduled_for, t.id)
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_broadcast_targets_um_por_contato
  ON public.whatsapp_broadcast_targets (broadcast_id, contact_id)
  WHERE status = 'pending';
