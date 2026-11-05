-- Quem tentou criar a conta do Club e foi recusado.
--
-- A tela de cadastro só diz "não encontramos seu cadastro": nome diferente da
-- ficha, telefone antigo ou pessoa que ainda não é paciente dão a MESMA
-- resposta (de propósito: respostas diferentes revelariam quais telefones são
-- de pacientes). Sem registro, quem desistia sumia sem a clínica saber. Esta
-- tabela guarda a tentativa para a recepção chamar a pessoa e resolver.
--
-- Só o servidor grava (chave de serviço, no cadastro público); a equipe lê e
-- marca como resolvida.
CREATE TABLE IF NOT EXISTS public.club_tentativas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  patient_id uuid,
  nome text NOT NULL,
  telefone text NOT NULL,
  ficha_nome text,
  motivo text NOT NULL CHECK (motivo IN ('sem_ficha', 'nome_diferente')),
  resolvida boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS club_tentativas_abertas
  ON public.club_tentativas (owner_id, resolvida, created_at DESC);

ALTER TABLE public.club_tentativas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS club_tentativas_do_consultorio ON public.club_tentativas;
CREATE POLICY club_tentativas_do_consultorio ON public.club_tentativas
  FOR SELECT TO authenticated
  USING (public.can_access_row(owner_id));
DROP POLICY IF EXISTS club_tentativas_resolver ON public.club_tentativas;
CREATE POLICY club_tentativas_resolver ON public.club_tentativas
  FOR UPDATE TO authenticated
  USING (public.can_access_row(owner_id))
  WITH CHECK (public.can_access_row(owner_id));
GRANT SELECT, UPDATE ON public.club_tentativas TO authenticated;
GRANT ALL ON public.club_tentativas TO service_role;
COMMENT ON TABLE public.club_tentativas IS 'Cadastros do Club recusados, para a recepção resolver.';
