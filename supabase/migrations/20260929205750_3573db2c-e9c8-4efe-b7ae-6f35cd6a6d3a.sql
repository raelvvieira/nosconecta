-- `ai_uso` é gravado pelas Edge Functions (wa-webhook, ai-playbook e
-- agente-licoes), que usam a chave de serviço. O PostgREST não concede
-- privilégios padrão no schema public, então sem este GRANT a gravação do
-- consumo falharia com permission denied — e a medição inteira perderia o
-- sentido. Mesmo padrão de `ai_agent_messages` e `ai_agents`.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_uso TO service_role;