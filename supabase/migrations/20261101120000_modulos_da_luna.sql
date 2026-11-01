-- Os módulos da Luna: capacidades comerciais ligadas por consultório e por
-- agente, com cadastro próprio. O primeiro é Paciente Modelo HOF; o segundo,
-- Mentoria para Profissionais, usa a mesma edição (a turma é a mesma).
--
-- As regras de como isso entra na instrução estão em
-- `supabase/functions/_shared/modulo-paciente-modelo.ts`.

-- ── Quais módulos cada agente tem, e a configuração de cada um ──────────
CREATE TABLE IF NOT EXISTS public.agente_modulos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  modulo text NOT NULL CHECK (modulo IN ('paciente_modelo', 'mentoria')),
  ativo boolean NOT NULL DEFAULT false,
  -- Como vender: o manual curto do módulo, no estilo do manual da Luna.
  manual text,
  -- Sinal, pagamento, cancelamento, credenciais, fotos, FAQ, lista de interesse.
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent_id, modulo)
);

-- ── Uma turma da mentoria ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mentoria_edicoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome text NOT NULL,
  cidade text,
  unit_id uuid REFERENCES public.clinic_units(id) ON DELETE SET NULL,
  -- Quando a edição não acontece numa unidade (o MedPlex não é unidade).
  endereco text,
  inicio date,
  fim date,
  status text NOT NULL DEFAULT 'rascunho'
    CHECK (status IN ('rascunho', 'inscricoes_abertas', 'esgotada', 'encerrada')),
  observacoes text,
  -- O lado das alunas (módulo Mentoria).
  vagas_alunos integer,
  matricula_valor numeric(12, 2),
  curso_valor numeric(12, 2),
  material_url text,
  dados_de_inscricao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mentoria_edicoes_owner ON public.mentoria_edicoes (owner_id, fim DESC);

-- ── Os dias de prática com pacientes, separados das datas do curso ──────
CREATE TABLE IF NOT EXISTS public.mentoria_praticas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  edicao_id uuid NOT NULL REFERENCES public.mentoria_edicoes(id) ON DELETE CASCADE,
  data date NOT NULL,
  hora_inicio time,
  hora_fim time,
  vagas integer NOT NULL DEFAULT 0,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mentoria_praticas_edicao ON public.mentoria_praticas (edicao_id, data);

-- ── O catálogo daquela edição ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mentoria_ofertas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  edicao_id uuid NOT NULL REFERENCES public.mentoria_edicoes(id) ON DELETE CASCADE,
  nome text NOT NULL,
  descricao text,
  ml numeric(6, 2),
  preco_vista numeric(12, 2) NOT NULL,
  preco_parcelado numeric(12, 2),
  parcelas_max integer,
  tipo text NOT NULL DEFAULT 'procedimento' CHECK (tipo IN ('procedimento', 'combo')),
  destaque boolean NOT NULL DEFAULT false,
  ordem integer NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mentoria_ofertas_edicao ON public.mentoria_ofertas (edicao_id, ordem);

-- ── Cada pessoa que quis uma vaga ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mentoria_reservas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  edicao_id uuid NOT NULL REFERENCES public.mentoria_edicoes(id) ON DELETE CASCADE,
  pratica_id uuid REFERENCES public.mentoria_praticas(id) ON DELETE SET NULL,
  oferta_id uuid REFERENCES public.mentoria_ofertas(id) ON DELETE SET NULL,
  fone text NOT NULL,
  crm_contact_id text,
  conversation_id text,
  patient_id uuid REFERENCES public.patients(id) ON DELETE SET NULL,
  nome_completo text,
  status text NOT NULL DEFAULT 'interesse'
    CHECK (status IN ('interesse', 'dia_escolhido', 'sinal_pendente', 'confirmada', 'cancelada', 'compareceu', 'faltou')),
  sinal_valor numeric(12, 2),
  sinal_pago_em timestamptz,
  comprovante_media_path text,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  transaction_id uuid REFERENCES public.financial_transactions(id) ON DELETE SET NULL,
  criado_por text NOT NULL DEFAULT 'luna' CHECK (criado_por IN ('luna', 'equipe')),
  anuncio_id text,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mentoria_reservas_edicao ON public.mentoria_reservas (edicao_id, status);
CREATE INDEX IF NOT EXISTS idx_mentoria_reservas_fone ON public.mentoria_reservas (owner_id, fone);

-- ── A lista de interesse da próxima edição ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.mentoria_interesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fone text NOT NULL,
  crm_contact_id text,
  cidade text,
  edicao_id uuid REFERENCES public.mentoria_edicoes(id) ON DELETE SET NULL,
  avisado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, fone)
);

-- ── O público da sessão e o elo do horário com a reserva ────────────────
ALTER TABLE public.ai_agent_sessions ADD COLUMN IF NOT EXISTS publico text
  CHECK (publico IN ('atendimento', 'paciente_modelo', 'mentoria'));
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS reserva_id uuid
  REFERENCES public.mentoria_reservas(id) ON DELETE SET NULL;

-- ── Permissões: a equipe lê e escreve no próprio consultório ────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['agente_modulos','mentoria_edicoes','mentoria_praticas','mentoria_ofertas','mentoria_reservas','mentoria_interesses'] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_equipe', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.can_access_row(owner_id)) WITH CHECK (public.can_access_row(owner_id))',
      t || '_equipe', t
    );
  END LOOP;
END $$;

-- ── O histórico: a edição de outubro, que vivia em três campos do agente ──
--
-- Migra para o cadastro, como edição ENCERRADA, com as 12 ofertas da tabela
-- de preços que a Dra. mandava à mão. Os campos antigos ficam no agente, mas
-- o código deixa de lê-los.
DO $$
DECLARE a record; e uuid;
BEGIN
  FOR a IN SELECT id, owner_id, paciente_modelo_ate, paciente_modelo_texto, paciente_modelo_local
           FROM public.ai_agents WHERE paciente_modelo_ate IS NOT NULL LOOP
    INSERT INTO public.agente_modulos (owner_id, agent_id, modulo, ativo, config)
    VALUES (a.owner_id, a.id, 'paciente_modelo', true, jsonb_build_object(
      'sinal', jsonb_build_object('valor', 150, 'abatido', false, 'prazoHoras', 24, 'titular', 'Mariane Domingues Botti', 'chavePix', ''),
      'pagamento', jsonb_build_object('formas', jsonb_build_array('pix', 'cartao', 'cartao_parcelado'), 'parcelasMax', 4, 'boleto', false),
      'retornoDias', 15,
      'fotos', 'Fotos de antes e depois ficam no prontuário, para comparação e segurança jurídica. Divulgação só com autorização da pessoa.',
      'listaDeInteresse', true
    ))
    ON CONFLICT (agent_id, modulo) DO NOTHING;

    INSERT INTO public.mentoria_edicoes (owner_id, nome, cidade, endereco, inicio, fim, status, observacoes)
    VALUES (a.owner_id, 'Outubro 2026 · Porto Alegre', 'Porto Alegre', a.paciente_modelo_local,
            a.paciente_modelo_ate - 2, a.paciente_modelo_ate, 'encerrada', a.paciente_modelo_texto)
    RETURNING id INTO e;

    INSERT INTO public.mentoria_praticas (owner_id, edicao_id, data, vagas) VALUES
      (a.owner_id, e, a.paciente_modelo_ate - 1, 0),
      (a.owner_id, e, a.paciente_modelo_ate, 0);

    INSERT INTO public.mentoria_ofertas (owner_id, edicao_id, nome, ml, preco_vista, preco_parcelado, parcelas_max, tipo, destaque, ordem) VALUES
      (a.owner_id, e, 'Harmonização Full Face', 3, 1200, 1300, 4, 'procedimento', true, 1),
      (a.owner_id, e, 'Preenchimento labial', NULL, 600, 650, 4, 'procedimento', false, 2),
      (a.owner_id, e, 'Preenchimento (demais regiões)', NULL, 500, 550, 4, 'procedimento', false, 3),
      (a.owner_id, e, 'Bioestimulador de colágeno (Radiesse)', NULL, 980, 1100, 4, 'procedimento', false, 4),
      (a.owner_id, e, 'Bioestimulador de colágeno (DIAMOND)', NULL, 780, 990, 4, 'procedimento', false, 5),
      (a.owner_id, e, 'Botox global (testa + glabela + olhos)', NULL, 600, 650, 4, 'procedimento', false, 6),
      (a.owner_id, e, 'Lábio + Botox Global', NULL, 1150, 1250, 4, 'combo', false, 7),
      (a.owner_id, e, 'Harmonização Natural (1ml + Botox)', 1, 1050, 1150, 4, 'combo', false, 8),
      (a.owner_id, e, 'Protocolo Avançado (3ml + Bioestimulador DIAMOND)', 3, 1950, 2100, 4, 'combo', false, 9);
  END LOOP;
END $$;
