-- A primeira mensagem RECEBIDA de cada conversa.
--
-- É o que o painel de Atendimento usa para dizer quantas pessoas chamaram pela
-- primeira vez num período. A data de criação da conversa (`wa_conversations.
-- created_at`) não serve: metade das conversas foi criada pelo espelho DEPOIS
-- da primeira mensagem (backfill), e "nova" por essa data contaria conversa
-- antiga como novidade.
--
-- `security_invoker`: a visão roda com as permissões de quem consulta, e a regra
-- de acesso de `wa_messages` (`can_access_row`) continua valendo — sem isso,
-- qualquer consultório leria a primeira mensagem de qualquer outro.
CREATE OR REPLACE VIEW public.wa_primeira_entrada
WITH (security_invoker = true) AS
SELECT
  owner_id,
  crm_conversation_id,
  min(sent_at) AS primeira_em
FROM public.wa_messages
WHERE NOT from_me
  AND NOT COALESCE(is_private, false)
GROUP BY owner_id, crm_conversation_id;

GRANT SELECT ON public.wa_primeira_entrada TO authenticated, service_role;

COMMENT ON VIEW public.wa_primeira_entrada IS
  'Primeira mensagem recebida de cada conversa (painel de Atendimento).';
