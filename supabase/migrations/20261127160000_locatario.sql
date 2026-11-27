-- Nível "Locatário": quem aluga salas por hora e não é da equipe.
--
-- A segurança vem antes da tela: o locatário é um membro ativo da clínica, e
-- TODA política do banco decide pelo `current_owner_id()`. Então a primeira
-- coisa aqui é fazer essas funções não reconhecerem o locatário — sem isso ele
-- leria pacientes, conversas e financeiro como qualquer membro lê. Depois
-- disso ele não enxerga linha nenhuma pelo navegador; as reservas dele passam
-- só por funções do servidor, que filtram por ele e por nada mais.

-- 1) O papel novo.
ALTER TABLE public.clinic_members DROP CONSTRAINT IF EXISTS clinic_members_role_check;
ALTER TABLE public.clinic_members
  ADD CONSTRAINT clinic_members_role_check
  CHECK (role IS NULL OR role = ANY (ARRAY['admin','reception','dentist','finance','tenant']));
ALTER TABLE public.clinic_invites DROP CONSTRAINT IF EXISTS clinic_invites_role_valido;
ALTER TABLE public.clinic_invites
  ADD CONSTRAINT clinic_invites_role_valido
  CHECK (role = ANY (ARRAY['admin','reception','dentist','finance','tenant']));

-- 2) O locatário não tem clínica para as políticas.
CREATE OR REPLACE FUNCTION public.current_owner_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT owner_id FROM public.clinic_members
  WHERE user_id = auth.uid() AND status = 'active' AND role IS DISTINCT FROM 'tenant'
  LIMIT 1
$$;
CREATE OR REPLACE FUNCTION public.current_unit_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT unit_id FROM public.clinic_members
  WHERE user_id = auth.uid() AND status = 'active' AND role IS DISTINCT FROM 'tenant'
  LIMIT 1
$$;

-- 3) As áreas: o locatário só tem a página de locação, e extras não valem.
CREATE OR REPLACE FUNCTION public.areas_do_membro()
RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT
    CASE m.role
      WHEN 'admin' THEN ARRAY['inicio','gestao','agenda','pacientes','atendimentos','financeiro','agente_ia','club','estoque','configuracoes','equipe']
      WHEN 'reception' THEN ARRAY['inicio','agenda','pacientes','atendimentos','agente_ia','club','estoque','configuracoes']
      WHEN 'dentist' THEN ARRAY['inicio','agenda','pacientes']
      WHEN 'finance' THEN ARRAY['inicio','financeiro']
      WHEN 'tenant' THEN ARRAY['locacao']
      ELSE ARRAY['inicio']
    END || CASE WHEN m.role = 'tenant' THEN '{}'::text[] ELSE COALESCE(m.acessos_extras, '{}') END
  FROM public.clinic_members m
  WHERE m.user_id = auth.uid() AND m.status = 'active'
  LIMIT 1
$$;

-- 4) Preço da hora por unidade (padrão R$ 50), ajustável na confirmação.
ALTER TABLE public.clinic_units
  ADD COLUMN IF NOT EXISTS preco_hora_locacao numeric(10,2) NOT NULL DEFAULT 50;

-- 5) As locações. Horários em hora local da clínica (sem fuso), como a agenda.
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS public.locacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  unit_id uuid NOT NULL REFERENCES public.clinic_units(id) ON DELETE CASCADE,
  room_id uuid NOT NULL REFERENCES public.clinic_chairs(id) ON DELETE CASCADE,
  tenant_user_id uuid NOT NULL,
  tenant_nome text NOT NULL DEFAULT '',
  inicio timestamp without time zone NOT NULL,
  fim timestamp without time zone NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','cancelled','completed')),
  observacao text,
  horas_reais numeric(6,2),
  valor_hora numeric(10,2),
  total numeric(12,2),
  transaction_id uuid,
  decidido_em timestamptz,
  decidido_por uuid,
  concluido_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (fim > inicio),
  -- Duas locações vivas na mesma sala não se sobrepõem, nem numa corrida
  -- entre dois cliques: quem barra é o banco.
  CONSTRAINT locacoes_sem_sobreposicao
    EXCLUDE USING gist (room_id WITH =, tsrange(inicio, fim) WITH &&)
    WHERE (status IN ('pending','approved'))
);
CREATE INDEX IF NOT EXISTS locacoes_owner_inicio ON public.locacoes (owner_id, inicio);
CREATE INDEX IF NOT EXISTS locacoes_tenant ON public.locacoes (tenant_user_id, inicio);

ALTER TABLE public.locacoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS locacoes_equipe ON public.locacoes;
CREATE POLICY locacoes_equipe ON public.locacoes FOR ALL TO authenticated
  USING (public.can_access_row(owner_id, unit_id) AND public.pode_ver_area('agenda'))
  WITH CHECK (public.can_access_row(owner_id, unit_id) AND public.pode_ver_area('agenda'));
-- O locatário NÃO tem política aqui, de propósito: a leitura e a reserva dele
-- passam pelo servidor, que filtra pelo próprio login.

-- 6) Duas buscas por telefone que rodam com privilégio total, recebem o dono
-- por parâmetro e não conferiam nada: qualquer login lia nome, data e
-- procedimento dos agendamentos de QUALQUER clínica. Quem chama são as
-- funções de borda (chave de serviço); o app não as usa.
REVOKE EXECUTE ON FUNCTION public.agendamento_criado_apos(uuid, text[], timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.agendamento_por_telefone(uuid, text[], date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agendamento_criado_apos(uuid, text[], timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.agendamento_por_telefone(uuid, text[], date) TO service_role;
