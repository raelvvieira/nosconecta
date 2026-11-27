-- Base dos acessos por nível e por pessoa — vista do BANCO.
--
-- ── Por que isto existe ──────────────────────────────────────────────────
--
-- O nível de acesso (recepção, dentista, financeiro) só valia na TELA: o menu
-- escondia as áreas. Mas o navegador fala direto com o banco, e a regra de
-- acesso dele só perguntava "esta pessoa é do consultório?". Medido em
-- 26/11: um dentista, que só deveria ver agenda e pacientes, lia 666
-- lançamentos financeiros, 28 mil mensagens de WhatsApp e a chave da OpenAI.
--
-- Aqui nasce a pergunta que faltava, em SQL: `pode_ver_area('financeiro')`.
-- As travas por tabela (fases seguintes) usam esta função; esta migration só
-- cria a base. O que é mais urgente (a chave da IA) vem na migration seguinte,
-- que só é aplicada DEPOIS que o código novo está no ar.
--
-- ── O que NÃO muda ───────────────────────────────────────────────────────
-- Nenhuma política existente é alterada. O mapa nível→áreas daqui é um
-- ESPELHO de `AREAS_DO_NIVEL` (src/lib/auth/niveis-de-acesso.ts); o teste
-- `tests/areas-no-banco.ts` falha se os dois divergirem.

-- 1) Acessos extras: o administrador concede, a uma pessoa, áreas além do nível.
ALTER TABLE public.clinic_members
  ADD COLUMN IF NOT EXISTS acessos_extras text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.clinic_members DROP CONSTRAINT IF EXISTS clinic_members_acessos_extras_check;
ALTER TABLE public.clinic_members
  ADD CONSTRAINT clinic_members_acessos_extras_check
  CHECK (acessos_extras <@ ARRAY[
    'agenda', 'pacientes', 'atendimentos', 'financeiro', 'agente_ia',
    'club', 'estoque', 'configuracoes', 'gestao'
  ]::text[]);

COMMENT ON COLUMN public.clinic_members.acessos_extras IS
  'Áreas que o administrador concedeu a esta pessoa além do que o nível dela já dá. Só acrescenta. Quem escreve é o administrador (política clinic_members_admin_all); a própria pessoa só lê a sua linha.';

-- 2) As áreas de quem está logado: as do nível + as concedidas.
CREATE OR REPLACE FUNCTION public.areas_do_membro()
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    CASE m.role
      WHEN 'admin' THEN ARRAY['inicio','gestao','agenda','pacientes','atendimentos','financeiro','agente_ia','club','estoque','configuracoes','equipe']
      WHEN 'reception' THEN ARRAY['inicio','agenda','pacientes','atendimentos','agente_ia','club','estoque','configuracoes']
      WHEN 'dentist' THEN ARRAY['inicio','agenda','pacientes']
      WHEN 'finance' THEN ARRAY['inicio','financeiro']
      ELSE ARRAY['inicio']
    END || COALESCE(m.acessos_extras, '{}')
  FROM public.clinic_members m
  WHERE m.user_id = auth.uid() AND m.status = 'active'
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.pode_ver_area(_area text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(_area = ANY(public.areas_do_membro()), false)
$$;

REVOKE EXECUTE ON FUNCTION public.areas_do_membro() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.pode_ver_area(text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.areas_do_membro() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pode_ver_area(text) TO authenticated, service_role;
