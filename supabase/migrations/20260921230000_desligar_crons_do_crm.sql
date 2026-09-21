-- Desliga os dois crons que consultavam o CRM.
--
-- ── Por que eles existiam ────────────────────────────────────────────────
--
-- O CRM não tinha webhook de entrada: "as conversas só existem por consulta".
-- Então mensagem nova era DESCOBERTA perguntando de tempos em tempos —
-- `wa-espelho` copiava conversas a cada 5 minutos, e `push-poll-conversations`
-- comparava contadores de não-lidas a cada 2 para saber se avisava alguém no
-- celular. O aviso chegava com até dois minutos de atraso, e só enquanto o CRM
-- atendesse.
--
-- O `wa-webhook` substituiu os dois em 19/09: a mensagem CHEGA, e o aviso sai
-- no instante em que ela chega.
--
-- ── Por que desligar agora ───────────────────────────────────────────────
--
-- As duas funções foram apagadas junto com o resto do CRM. Os agendamentos
-- continuam no banco e seguiriam batendo numa URL que não existe mais — um a
-- cada 2 minutos, outro a cada 5, para sempre. Não quebra nada, e é
-- exatamente por isso que passaria despercebido: ruído permanente no log de
-- onde alguém, um dia, vai procurar um problema de verdade.

SELECT cron.unschedule('wa-espelho')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'wa-espelho');

SELECT cron.unschedule('push-poll-conversations')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'push-poll-conversations');
