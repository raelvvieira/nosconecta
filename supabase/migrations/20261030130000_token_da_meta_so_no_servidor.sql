-- O token da Conversions API (Meta) só no servidor.
--
-- A regra de `meta_capi_credentials` era `can_access_row(owner_id)` para
-- tudo: qualquer pessoa da equipe do consultório, recepção inclusive,
-- conseguia ler o token em claro direto pelo banco com o próprio login. A
-- tela nunca precisou disso: ela fala com a Edge Function `meta-capi`, que
-- usa a chave de serviço e só devolve o token mascarado.
--
-- Sem regra nenhuma, com a RLS ligada, a tabela fica fechada para quem está
-- logado e aberta só para a chave de serviço. Cada consultório continua com
-- o próprio Pixel e o próprio token (uma linha por `owner_id`).
DROP POLICY IF EXISTS meta_capi_credentials_scoped ON public.meta_capi_credentials;
ALTER TABLE public.meta_capi_credentials ENABLE ROW LEVEL SECURITY;
