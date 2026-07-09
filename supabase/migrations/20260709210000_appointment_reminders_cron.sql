-- Daily cron that calls the "send-appointment-reminders" Edge Function,
-- which finds tomorrow's and today's appointments and dispatches the
-- day-before / day-of reminder emails and SMS via Brevo.
--
-- Authenticates using the project's anon/publishable key — safe to commit:
-- this key is meant to be public (it already ships inside every client
-- bundle of the app, see src/integrations/supabase/client.ts). It only
-- satisfies Supabase's platform-level "is this a validly signed JWT?"
-- check; send-appointment-reminders itself does no sensitive work and
-- forwards to the JWT-protected send-appointment-notification using the
-- *service role* key it reads from its own Edge Function runtime env
-- (never embedded here). Row-level security still applies to anything
-- this key alone could touch directly.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

SELECT cron.unschedule('send-appointment-reminders-daily')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-appointment-reminders-daily');

SELECT cron.schedule(
  'send-appointment-reminders-daily',
  '0 11 * * *', -- 11:00 UTC ≈ 08:00 America/Sao_Paulo
  $$
  SELECT net.http_post(
    url := 'https://ddfteoeehsticjhojpka.supabase.co/functions/v1/send-appointment-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRkZnRlb2VlaHN0aWNqaG9qcGthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2NDA4MjcsImV4cCI6MjA5NzIxNjgyN30.FBVpoyMqMZXm9ARh0Do1IlhPuWQSVkhjf1E_uXsAPMM'
    ),
    body := '{}'::jsonb
  );
  $$
);
