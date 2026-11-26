-- Duas origens a mais para marcar à mão: "Google" (quem achou a clínica
-- pesquisando, diferente do anúncio do Google Ads) e "ChatGPT" (quem veio por
-- uma indicação do assistente). Só alarga a lista aceita; nenhuma linha muda.
DO $$
DECLARE nome text;
BEGIN
  FOR nome IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'public.lead_origem'::regclass AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%origem%IN%'
  LOOP
    EXECUTE format('ALTER TABLE public.lead_origem DROP CONSTRAINT %I', nome);
  END LOOP;
END $$;

ALTER TABLE public.lead_origem
  ADD CONSTRAINT lead_origem_origem_check
  CHECK (origem IN (
    'meta_ads', 'google_ads', 'google', 'chatgpt', 'instagram',
    'indicacao', 'site', 'organico', 'outro'
  ));
