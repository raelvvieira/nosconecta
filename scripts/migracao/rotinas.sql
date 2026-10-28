-- As 7 tarefas automáticas do sistema, para o projeto NOVO.
--
-- No Lovable, cada tarefa tem o endereço do projeto e a chave anon escritos
-- dentro do comando (ver as migrations de cron). Rodando as migrations num
-- banco novo, essas tarefas nasceriam chamando as funções DO LOVABLE. Este
-- arquivo apaga todas e recria as 7 vivas lendo endereço e chave do cofre do
-- banco (`rotinas_url`, `rotinas_chave`), que `aplicar-rotinas.mjs` grava.
--
-- Todas nascem DESLIGADAS: enquanto Lovable e casa nova coexistem, só uma
-- pode disparar lembrete e follow-up. `ligar-rotinas.mjs` liga na virada.
--
-- Os horários e corpos são os do banco do Lovable em 26/10/2026
-- (`select jobname, schedule, command from cron.job`).

CREATE OR REPLACE FUNCTION public.chamar_rotina(nome text, corpo jsonb DEFAULT '{}'::jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault
AS $$
DECLARE
  base text;
  chave text;
BEGIN
  SELECT decrypted_secret INTO base FROM vault.decrypted_secrets WHERE name = 'rotinas_url';
  SELECT decrypted_secret INTO chave FROM vault.decrypted_secrets WHERE name = 'rotinas_chave';
  IF base IS NULL OR chave IS NULL THEN
    RAISE WARNING 'chamar_rotina(%): rotinas_url/rotinas_chave ausentes no cofre', nome;
    RETURN NULL;
  END IF;
  RETURN net.http_post(
    url := base || '/functions/v1/' || nome,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || chave),
    body := corpo
  );
END;
$$;

REVOKE ALL ON FUNCTION public.chamar_rotina(text, jsonb) FROM PUBLIC, anon, authenticated;

-- Apaga tudo o que as migrations antigas agendaram (inclusive tarefas que o
-- Lovable já tinha removido, como wa-espelho e push-poll-conversations).
SELECT cron.unschedule(jobid) FROM cron.job;

SELECT cron.schedule('agente-followup', '* * * * *', $$SELECT public.chamar_rotina('agente-followup')$$);
SELECT cron.schedule('agente-licoes', '17 * * * *', $$SELECT public.chamar_rotina('agente-licoes')$$);
SELECT cron.schedule('ai-playbook-diario', '0 7 * * *', $$
  SELECT public.chamar_rotina('ai-playbook', jsonb_build_object('ownerId', a.owner_id::text, 'action', 'ciclo'))
  FROM public.ai_agents a
$$);
SELECT cron.schedule('atendimento-automations-tick', '* * * * *', $$SELECT public.chamar_rotina('atendimento-automations', '{"action":"tick"}'::jsonb)$$);
SELECT cron.schedule('automation-scheduled-daily', '0 11 * * *', $$SELECT public.chamar_rotina('automation-scheduled')$$);
SELECT cron.schedule('olho-de-deus-semanal', '38 11 * * 1', $$SELECT public.chamar_rotina('olho-de-deus')$$);
SELECT cron.schedule('whatsapp-broadcast-tick', '* * * * *', $$SELECT public.chamar_rotina('whatsapp-broadcast', '{"action":"tick"}'::jsonb)$$);

SELECT cron.alter_job(jobid, active := false) FROM cron.job;

SELECT jobname, schedule, active FROM cron.job ORDER BY jobname;
