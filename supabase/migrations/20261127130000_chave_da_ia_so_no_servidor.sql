-- A chave da IA deixa de ser legível pelo navegador.
--
-- ⚠️ ORDEM: aplicar só DEPOIS de o código novo estar publicado. O código novo lê
-- a chave no servidor (chave de serviço); o antigo a lia com a sessão da pessoa
-- e quebraria ("permission denied") entre esta migration e o deploy.
--
-- (Contexto em 20261127120000_acessos_base.sql: medido em 26/11, qualquer membro
-- lia a chave pela API.)

-- `ai_agents.api_key` é a chave da OpenAI da clínica. Qualquer membro a lia pela
-- API. Passa a ser lida só pelo servidor (chave de serviço), que já confere a
-- área antes de usá-la; o navegador recebe no máximo os 4 últimos caracteres,
-- montados no servidor.
--
-- Privilégio por COLUNA: tira o SELECT da tabela inteira e devolve, coluna a
-- coluna, tudo menos `api_key`. ⚠️ Coluna NOVA em `ai_agents` precisa de
-- `GRANT SELECT (coluna) ON public.ai_agents TO authenticated;` na migration
-- que a cria — senão o navegador não a lê.
REVOKE SELECT ON public.ai_agents FROM authenticated;
DO $$
DECLARE colunas text;
BEGIN
  SELECT string_agg(format('%I', column_name), ', ' ORDER BY ordinal_position)
    INTO colunas
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'ai_agents' AND column_name <> 'api_key';
  EXECUTE format('GRANT SELECT (%s) ON public.ai_agents TO authenticated', colunas);
END $$;
