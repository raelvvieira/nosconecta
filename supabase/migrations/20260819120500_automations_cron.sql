-- Cron de minuto que retoma as automações adiadas: chama
-- `atendimento-automations` com a ação `tick`, que executa o que estava na
-- fila e já venceu (`automation_pending_actions.run_after`).
--
-- Duas coisas caem aqui: a ação "aguardar tempo" (que guarda o resto da lista
-- de ações para depois) e a janela de horário com `outside: "defer"` (que
-- guarda a lista inteira para a próxima abertura da janela). Como o horário
-- já está gravado em cada linha, o tick não guarda estado — só varre o que
-- venceu, igual ao tick do disparo.
--
-- Autentica com a chave anon/publishable do projeto, mesmo padrão e mesma
-- justificativa dos outros dois crons (ver
-- 20260812210500_whatsapp_broadcast_cron.sql): a chave já vai dentro do
-- bundle do cliente, e só satisfaz a checagem de "é um JWT válido?" da
-- plataforma. A função lê a service role key do próprio ambiente dela.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

SELECT cron.unschedule('atendimento-automations-tick')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'atendimento-automations-tick');

SELECT cron.schedule(
  'atendimento-automations-tick',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://ddfteoeehsticjhojpka.supabase.co/functions/v1/atendimento-automations',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRkZnRlb2VlaHN0aWNqaG9qcGthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2NDA4MjcsImV4cCI6MjA5NzIxNjgyN30.FBVpoyMqMZXm9ARh0Do1IlhPuWQSVkhjf1E_uXsAPMM'
    ),
    body := '{"action":"tick"}'::jsonb
  );
  $$
);
