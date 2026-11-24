-- Duas correções na leitura das frases prontas do WhatsApp:
--
--   1. "Olá! Tenho interesse em ser paciente modelo…" e "Olá! Tenho interesse
--      na mentoria…" são de ANÚNCIO: o anúncio da Meta não abre o WhatsApp
--      direto, leva a uma página e a página abre o WhatsApp com essa frase.
--      Por isso não chega código de clique, e a frase é o rastro. Passam a
--      contar como 'meta_ads' (antes contavam como 'site').
--   2. "Olá! Vim pelo site e gostaria de mais informações…" (às vezes seguida
--      do assunto: "…sobre clareamento dental") é o botão do site, fora de
--      campanha. Continua sendo 'site'.
--
-- Só troca a lista de frases: a view mantém as mesmas colunas e o índice
-- parcial é refeito com o mesmo critério da view.

DROP INDEX IF EXISTS public.wa_messages_frase_do_site_idx;
CREATE INDEX IF NOT EXISTS wa_messages_frase_do_site_idx
  ON public.wa_messages (owner_id, crm_conversation_id)
  WHERE from_me = false
    AND (body ILIKE 'Olá! Tenho interesse em ser paciente modelo%'
      OR body ILIKE 'Olá! Tenho interesse na mentoria%'
      OR body ILIKE 'Olá! Vim pelo site%');

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
  SELECT owner_id, crm_conversation_id, 'meta_ads'::text
    FROM public.wa_messages
   WHERE from_me = false
     AND (body ILIKE 'Olá! Tenho interesse em ser paciente modelo%'
       OR body ILIKE 'Olá! Tenho interesse na mentoria%')
   GROUP BY owner_id, crm_conversation_id
  UNION
  SELECT owner_id, crm_conversation_id, 'site'::text
    FROM public.wa_messages
   WHERE from_me = false
     AND body ILIKE 'Olá! Vim pelo site%'
   GROUP BY owner_id, crm_conversation_id;

GRANT SELECT ON public.conversa_origem_automatica TO authenticated, service_role;
