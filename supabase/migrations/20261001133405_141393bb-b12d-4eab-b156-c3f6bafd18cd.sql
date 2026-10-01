-- A Página do Facebook, para a conversão poder dizer de qual anúncio veio.
--
-- ── Como esta coluna foi descoberta ──────────────────────────────────────
--
-- Em 01/10 a venda de R$ 990 do Juliano foi reenviada já com o identificador
-- do clique (`ctwa_clid`) e com `action_source: business_messaging`. A Meta
-- recusou, e a mensagem dela é a especificação:
--
--   "Seu evento Purchase com a fonte da ação business_messaging do canal
--    whatsapp não tem page_id nem whatsapp_business_account_id. Um desses
--    parâmetros é necessário em user_data." (código 100, subcode 2804116)
--
-- **Um desses.** `page_id` é a Página do Facebook, que todo anunciante tem —
-- então a conta de WhatsApp Business da API oficial NÃO é obrigatória. Era a
-- dúvida que travava este conserto, e foi a própria Meta que respondeu.
--
-- ── Por que coluna e não constante ───────────────────────────────────────
--
-- A Página é de cada clínica, como o pixel e o token que já moram aqui. Uma
-- constante no código funcionaria hoje, com uma clínica, e seria a primeira
-- coisa a quebrar na segunda.
ALTER TABLE public.meta_capi_credentials
  ADD COLUMN IF NOT EXISTS page_id text;

COMMENT ON COLUMN public.meta_capi_credentials.page_id IS
  'Id da Página do Facebook dos anúncios. A Meta exige em todo evento de business_messaging; sem ele a conversão de conversa é recusada inteira.';