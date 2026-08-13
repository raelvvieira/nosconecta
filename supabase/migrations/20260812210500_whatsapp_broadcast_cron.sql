-- Cron de minuto que empurra a fila de disparo: chama `whatsapp-broadcast` com
-- a ação `tick`, que manda os alvos cujo horário já venceu.
--
-- Precisa ser cron, e não um laço: 200 mensagens a 8 segundos passam de 26
-- minutos, o que não sobrevive a uma aba fechada nem ao teto de tempo de uma
-- Edge Function. O ritmo já está gravado em cada alvo (`scheduled_for`), então
-- o tick não guarda estado — só varre o que venceu.
--
-- Autentica com a chave anon/publishable do projeto, mesmo padrão e mesma
-- justificativa do cron de lembretes (ver
-- 20260709210000_appointment_reminders_cron.sql): a chave já vai dentro do
-- bundle do cliente, e só satisfaz a checagem de "é um JWT válido?" da
-- plataforma. A função lê a service role key do próprio ambiente dela.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

SELECT cron.unschedule('whatsapp-broadcast-tick')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'whatsapp-broadcast-tick');

SELECT cron.schedule(
  'whatsapp-broadcast-tick',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://ddfteoeehsticjhojpka.supabase.co/functions/v1/whatsapp-broadcast',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRkZnRlb2VlaHN0aWNqaG9qcGthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2NDA4MjcsImV4cCI6MjA5NzIxNjgyN30.FBVpoyMqMZXm9ARh0Do1IlhPuWQSVkhjf1E_uXsAPMM'
    ),
    body := '{"action":"tick"}'::jsonb
  );
  $$
);
