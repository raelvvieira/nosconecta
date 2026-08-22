-- Cron diário da varredura de automações agendadas.
--
-- Chama `automation-scheduled`, que procura os agendamentos a 3 dias, 1 dia e
-- hoje e despacha `appointment.reminder_due` para o motor de automações. É o
-- que permite uma automação reagir ao TEMPO, e não só a alguém ter clicado em
-- alguma coisa.
--
-- 11:00 UTC = 08:00 America/Sao_Paulo, mesmo horário e mesma justificativa de
-- 20260709210000_appointment_reminders_cron.sql. O horário não é detalhe: a
-- função calcula "daqui a 3 dias" no fuso da clínica, e rodar de madrugada
-- faria a conta cair no dia errado.
--
-- Autentica com a chave anon/publishable, mesmo padrão dos outros três crons
-- (ver 20260812210500_whatsapp_broadcast_cron.sql): ela já vai dentro do bundle
-- do cliente e só satisfaz a checagem de "é um JWT válido?" da plataforma. A
-- função lê a service role key do próprio ambiente dela.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

SELECT cron.unschedule('automation-scheduled-daily')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'automation-scheduled-daily');

SELECT cron.schedule(
  'automation-scheduled-daily',
  '0 11 * * *', -- 11:00 UTC ≈ 08:00 America/Sao_Paulo
  $$
  SELECT net.http_post(
    url := 'https://ddfteoeehsticjhojpka.supabase.co/functions/v1/automation-scheduled',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRkZnRlb2VlaHN0aWNqaG9qcGthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2NDA4MjcsImV4cCI6MjA5NzIxNjgyN30.FBVpoyMqMZXm9ARh0Do1IlhPuWQSVkhjf1E_uXsAPMM'
    ),
    body := '{}'::jsonb
  );
  $$
);
