-- Avisos do cadastro do Club para a recepção.
--
-- O telefone é a chave do cadastro: quem tem ficha com esse telefone E nome
-- igual ou parecido entra nela (e as fichas repetidas da mesma pessoa viram uma
-- só, com o nome mais completo). Quem nunca passou pela clínica ganha uma ficha
-- nova. O nome não trava ninguém.
--
-- Quando o telefone é de OUTRA pessoa da clínica (a mãe e os filhos dividem o
-- celular, por exemplo), a pessoa ganha ficha própria — nada da ficha dos
-- outros é mexido — e a divergência cai aqui para a recepção conferir se, na
-- verdade, é a mesma pessoa cadastrada de outro jeito.
--
-- O terceiro caso: o telefone já tem conta no Club e a pessoa tentou criar outra
-- (esqueceu o e-mail ou a senha). Ela não é barrada com um erro — recebe a
-- boa notícia de que já está no Club — e a recepção ganha o aviso para ajudar a
-- recuperar o acesso.
--
-- Só o servidor grava (chave de serviço, no cadastro público); a equipe lê e
-- marca como resolvido.
CREATE TABLE IF NOT EXISTS public.club_avisos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  patient_id uuid,
  nome text NOT NULL,
  telefone text NOT NULL,
  ficha_nome text,
  motivo text NOT NULL CHECK (motivo IN ('nome_diferente', 'ja_tinha_conta')),
  resolvida boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS club_avisos_abertos
  ON public.club_avisos (owner_id, resolvida, created_at DESC);

ALTER TABLE public.club_avisos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS club_avisos_do_consultorio ON public.club_avisos;
CREATE POLICY club_avisos_do_consultorio ON public.club_avisos
  FOR SELECT TO authenticated
  USING (public.can_access_row(owner_id));
DROP POLICY IF EXISTS club_avisos_resolver ON public.club_avisos;
CREATE POLICY club_avisos_resolver ON public.club_avisos
  FOR UPDATE TO authenticated
  USING (public.can_access_row(owner_id))
  WITH CHECK (public.can_access_row(owner_id));
GRANT SELECT, UPDATE ON public.club_avisos TO authenticated;
GRANT ALL ON public.club_avisos TO service_role;
COMMENT ON TABLE public.club_avisos IS 'Entradas no Club com nome diferente da ficha, para a recepção conferir.';
