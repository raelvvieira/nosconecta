-- Mantém o espelho do WhatsApp em dia.
--
-- A cada 5 minutos. Não é preferência de arquitetura: o CRM não tem webhook
-- de entrada — "as conversas só existem por consulta" —, então perguntar de
-- tempos em tempos é o que a API dele permite. Quando a Evolution for nossa,
-- o webhook substitui isto e o cron some.
--
-- Cinco minutos, e não dois como o `push-poll-conversations`: aquele só lê
-- uma lista e compara contadores; este GRAVA — conversas, mensagens e mídia.
-- Enquanto a carga inicial não termina, cada rodada tem trabalho de verdade
-- pela frente, e empilhar rodadas em cima de rodadas não faria a cópia andar
-- mais rápido: a fila é a mesma e o CRM é o mesmo.
--
-- Corpo vazio de propósito: sem `ownerId`, a function roda para todas as
-- clínicas que têm credencial do CRM. Mesmo padrão das outras crons daqui,
-- inclusive a anon key inline — ela é pública por definição e serve só para
-- passar o gate de "JWT válido" do Supabase; o trabalho sensível usa o
-- service role lido do env da própria function.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

SELECT cron.unschedule('wa-espelho')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'wa-espelho');

SELECT cron.schedule(
  'wa-espelho',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://ddfteoeehsticjhojpka.supabase.co/functions/v1/wa-espelho',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRkZnRlb2VlaHN0aWNqaG9qcGthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2NDA4MjcsImV4cCI6MjA5NzIxNjgyN30.FBVpoyMqMZXm9ARh0Do1IlhPuWQSVkhjf1E_uXsAPMM'
    ),
    body := '{}'::jsonb
  );
  $$
);
