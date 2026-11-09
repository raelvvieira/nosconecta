-- Ofertas, parte 2: o que a assistente sabe de cada oferta.
--
--   ofertas.resumo           o texto curto que vai em TODA conversa (a vitrine);
--   oferta_conhecimento      blocos de texto livre (o que é, quem aplica, FAQ,
--                            objeções, políticas…) que só entram na conversa
--                            quando ela é sobre aquela oferta;
--   ai_agent_casos.oferta_id fotos e vídeos autorizados ligados a uma oferta;
--   ai_agent_sessions.oferta_em_foco  em qual oferta a conversa está.
--
-- Aditiva: nada existente muda. O código tolera as colunas ausentes (erro de
-- coluna vira só aviso), então o deploy não depende da ordem exata.

ALTER TABLE public.ofertas ADD COLUMN IF NOT EXISTS resumo text;

CREATE TABLE IF NOT EXISTS public.oferta_conhecimento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  oferta_id uuid NOT NULL REFERENCES public.ofertas(id) ON DELETE CASCADE,
  titulo text NOT NULL,
  -- Em que situação a assistente deve consultar este bloco.
  quando_usar text,
  texto text NOT NULL DEFAULT '',
  ordem integer NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS oferta_conhecimento_oferta_idx
  ON public.oferta_conhecimento (oferta_id, ordem);

ALTER TABLE public.oferta_conhecimento ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS oferta_conhecimento_do_consultorio ON public.oferta_conhecimento;
CREATE POLICY oferta_conhecimento_do_consultorio ON public.oferta_conhecimento
  FOR ALL TO authenticated
  USING (public.can_access_row(owner_id))
  WITH CHECK (public.can_access_row(owner_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oferta_conhecimento TO authenticated;
GRANT ALL ON public.oferta_conhecimento TO service_role;

ALTER TABLE public.ai_agent_casos
  ADD COLUMN IF NOT EXISTS oferta_id uuid REFERENCES public.ofertas(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS ai_agent_casos_oferta_idx ON public.ai_agent_casos (oferta_id)
  WHERE oferta_id IS NOT NULL;

ALTER TABLE public.ai_agent_sessions
  ADD COLUMN IF NOT EXISTS oferta_em_foco uuid REFERENCES public.ofertas(id) ON DELETE SET NULL;
