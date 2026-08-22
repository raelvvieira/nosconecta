CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

SELECT cron.unschedule('automation-scheduled-daily')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'automation-scheduled-daily');

SELECT cron.schedule(
  'automation-scheduled-daily',
  '0 11 * * *',
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