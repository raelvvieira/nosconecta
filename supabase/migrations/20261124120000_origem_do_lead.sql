-- De onde veio a pessoa que está conversando com a clínica.
--
-- Duas fontes, que a tela combina:
--
--   1. AUTOMÁTICA (a view `conversa_origem_automatica`): o que o próprio
--      WhatsApp prova.
--        - 'meta_ads': a primeira mensagem trouxe `externalAdReply` (o anúncio
--          "Enviar mensagem" do Instagram/Facebook) ou a sessão da Luna guardou
--          o código do clique (`anuncio.clickId`).
--        - 'site': a mensagem pronta do botão da página de vendas ("Olá! Tenho
--          interesse em ser paciente modelo…"). A página não manda código de
--          clique; a frase é o único rastro.
--      Quem não aparece na view é orgânico — a tela decide, a view só afirma o
--      que tem prova.
--
--   2. MANUAL (`lead_origem`): a recepção escolhe a origem na conversa, e essa
--      escolha vale mais que a automática. É por pessoa (telefone), não por
--      conversa, para valer em todas as conversas do mesmo número.
--
-- Só ADICIONA: nenhuma tabela existente muda.

CREATE TABLE IF NOT EXISTS public.lead_origem (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Telefone canônico da pessoa; sem telefone, "conv:<id da conversa>".
  chave text NOT NULL,
  origem text NOT NULL
    CHECK (origem IN ('meta_ads', 'google_ads', 'instagram', 'indicacao', 'site', 'organico', 'outro')),
  definido_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, chave)
);

ALTER TABLE public.lead_origem ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lead_origem_da_clinica ON public.lead_origem;
CREATE POLICY lead_origem_da_clinica ON public.lead_origem
  FOR ALL TO authenticated
  USING (public.can_access_row(owner_id))
  WITH CHECK (public.can_access_row(owner_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_origem TO authenticated;
GRANT ALL ON public.lead_origem TO service_role;
REVOKE ALL ON public.lead_origem FROM anon;

-- Índices parciais com o MESMO critério da view: sem eles, cada abertura da
-- caixa de entrada leria o JSON de todas as mensagens (73 MB hoje).
CREATE INDEX IF NOT EXISTS wa_messages_com_anuncio_idx
  ON public.wa_messages (owner_id, crm_conversation_id)
  WHERE from_me = false
    AND (payload -> 'contextInfo' -> 'externalAdReply' IS NOT NULL
      OR payload -> 'message' -> 'extendedTextMessage' -> 'contextInfo' -> 'externalAdReply' IS NOT NULL);

CREATE INDEX IF NOT EXISTS wa_messages_frase_do_site_idx
  ON public.wa_messages (owner_id, crm_conversation_id)
  WHERE from_me = false
    AND (body ILIKE 'Olá! Tenho interesse em ser paciente modelo%'
      OR body ILIKE 'Olá! Tenho interesse na mentoria%');

CREATE OR REPLACE VIEW public.conversa_origem_automatica
WITH (security_invoker = true) AS
  SELECT owner_id, crm_conversation_id AS conversation_id, 'meta_ads'::text AS origem
    FROM public.wa_messages
   WHERE from_me = false
     AND (payload -> 'contextInfo' -> 'externalAdReply' IS NOT NULL
       OR payload -> 'message' -> 'extendedTextMessage' -> 'contextInfo' -> 'externalAdReply' IS NOT NULL)
   GROUP BY owner_id, crm_conversation_id
  UNION
  SELECT owner_id, conversation_id, 'meta_ads'::text
    FROM public.ai_agent_sessions
   WHERE anuncio ? 'clickId'
  UNION
  SELECT owner_id, crm_conversation_id, 'site'::text
    FROM public.wa_messages
   WHERE from_me = false
     AND (body ILIKE 'Olá! Tenho interesse em ser paciente modelo%'
       OR body ILIKE 'Olá! Tenho interesse na mentoria%')
   GROUP BY owner_id, crm_conversation_id;

GRANT SELECT ON public.conversa_origem_automatica TO authenticated, service_role;
