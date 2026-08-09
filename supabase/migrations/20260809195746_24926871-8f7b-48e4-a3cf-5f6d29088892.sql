-- Varredura periódica de mensagens novas no WhatsApp.
--
-- O CRM (Wavy) não tem webhook de entrada: mensagem nova só é descoberta
-- perguntando. Por isso o cron — não é preferência de arquitetura, é o que a
-- API do CRM permite.
--
-- A cada 2 minutos: rápido o bastante pra notificação fazer sentido, e a
-- function sai cedo pra quem não tem aparelho inscrito, então não há chamada
-- ao CRM à toa.
--
-- Mesmo padrão de 20260709210000_appointment_reminders_cron.sql, inclusive a
-- anon key inline — ela é pública por definição e serve só pra passar o gate
-- de "JWT válido" do Supabase; o trabalho sensível usa o service role lido do
-- env da própria function.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

SELECT cron.unschedule('push-poll-conversations')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'push-poll-conversations');

SELECT cron.schedule(
  'push-poll-conversations',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://ddfteoeehsticjhojpka.supabase.co/functions/v1/push-poll-conversations',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRkZnRlb2VlaHN0aWNqaG9qcGthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2NDA4MjcsImV4cCI6MjA5NzIxNjgyN30.FBVpoyMqMZXm9ARh0Do1IlhPuWQSVkhjf1E_uXsAPMM'
    ),
    body := '{}'::jsonb
  );
  $$
);