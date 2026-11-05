-- A meta de faturamento do mês, que só aparece na Gestão.
--
-- Fica numa tabela à parte, e não em `clinicas` ou `financial_goals`, de
-- propósito: aquelas são lidas por mais gente (a equipe vê a ficha da clínica e
-- o Financeiro vê as metas do Planejamento). Esta só abre para quem é
-- administrador — a regra vale no banco, não só na tela.
CREATE TABLE IF NOT EXISTS public.gestao_metas (
  owner_id uuid PRIMARY KEY,
  faturamento_mensal numeric(12, 2) NOT NULL CHECK (faturamento_mensal > 0),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_por uuid
);
ALTER TABLE public.gestao_metas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gestao_metas_so_admin ON public.gestao_metas;
CREATE POLICY gestao_metas_so_admin ON public.gestao_metas
  FOR ALL TO authenticated
  USING (public.can_access_row(owner_id) AND public.is_clinic_admin())
  WITH CHECK (public.can_access_row(owner_id) AND public.is_clinic_admin());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gestao_metas TO authenticated;
GRANT ALL ON public.gestao_metas TO service_role;
COMMENT ON TABLE public.gestao_metas IS 'Meta de faturamento mensal; só o administrador lê e grava.';
