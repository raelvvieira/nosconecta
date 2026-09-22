-- 20260921230000_desligar_crons_do_crm.sql
SELECT cron.unschedule('wa-espelho')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'wa-espelho');

SELECT cron.unschedule('push-poll-conversations')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'push-poll-conversations');

-- 20260922100000_chave_da_ia.sql
ALTER TABLE public.ai_agents
  ADD COLUMN IF NOT EXISTS api_key text;

COMMENT ON COLUMN public.ai_agents.api_key IS
  'Chave da API de IA desta clínica. Nunca é devolvida inteira para a tela — '
  'ver getAtendimento em src/lib/agente-ia/agente.functions.ts, que só expõe '
  'se existe e os quatro últimos caracteres. Vazio = usa o segredo '
  'ANTHROPIC_API_KEY do ambiente.';

-- 20260922110000_apagar_credenciais_do_crm.sql
DROP TABLE IF EXISTS public.crm_credentials;

DROP INDEX IF EXISTS public.idx_wa_contacts_crm;
DROP INDEX IF EXISTS public.idx_wa_conversations_crm;
DROP INDEX IF EXISTS public.idx_wa_messages_crm;