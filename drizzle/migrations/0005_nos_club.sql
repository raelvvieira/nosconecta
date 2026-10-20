-- O NÓS Club: indicação, nível e créditos.
--
-- ── O que este desenho recusa ────────────────────────────────────────────
--
-- Três tentações, e por que nenhuma entrou:
--
--   **Guardar o nível na ficha do paciente.** Nível é consequência de quantas
--   indicações foram confirmadas; guardar os dois cria duas verdades, e o dia
--   em que elas discordarem ninguém vai saber qual vale. O nível é CALCULADO,
--   sempre, a partir das indicações confirmadas. A tabela de níveis aqui é a
--   régua, não o registro.
--
--   **Guardar o saldo de créditos.** Mesma coisa, e pior: saldo é dinheiro.
--   A clínica pediu explicitamente lançamentos positivos e negativos em vez de
--   um campo editável, "porque isso deixa auditoria". O saldo é a soma do
--   extrato.
--
--   **Uma tela de "validar indicação".** O sistema já sabe que o paciente
--   compareceu: é o agendamento virando `completed`, que a recepção já faz
--   hoje e que já dispara conversão para a Meta, recebimento no financeiro e
--   automação de WhatsApp. A indicação se confirma no mesmo lugar, sem pedir
--   mais um clique de ninguém.

-- ── A régua ──────────────────────────────────────────────────────────────
--
-- Em tabela, e não em código, porque a clínica foi explícita: "Gold de 10 para
-- 12 indicações sem chamar desenvolvedor".
CREATE TABLE IF NOT EXISTS public.club_niveis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome text NOT NULL,
  -- Quantas indicações CONFIRMADAS este nível exige.
  indicacoes integer NOT NULL,
  -- Quanto em créditos ele desbloqueia, uma vez, ao ser alcançado.
  credito numeric(12, 2) NOT NULL DEFAULT 0,
  ordem integer NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT club_niveis_nome_nao_vazio CHECK (btrim(nome) <> ''),
  CONSTRAINT club_niveis_indicacoes_positivas CHECK (indicacoes > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS club_niveis_sem_empate
  ON public.club_niveis (owner_id, indicacoes);
CREATE INDEX IF NOT EXISTS club_niveis_do_dono
  ON public.club_niveis (owner_id, ordem);

ALTER TABLE public.club_niveis ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS club_niveis_acesso ON public.club_niveis;
CREATE POLICY club_niveis_acesso ON public.club_niveis
  FOR ALL USING (public.can_access_row(owner_id))
  WITH CHECK (public.can_access_row(owner_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_niveis TO authenticated;

COMMENT ON TABLE public.club_niveis IS
  'A régua do NÓS Club: quantas indicações confirmadas cada nível exige e quanto ele desbloqueia. Editável pela clínica.';

-- ── Quem é do Club ───────────────────────────────────────────────────────
--
-- Uma data, e não um booleano: "participa" e "desde quando" são a mesma
-- pergunta, e a segunda é a que a tela do membro mostra.
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS club_desde timestamptz;

COMMENT ON COLUMN public.patients.club_desde IS
  'Quando o paciente entrou no NÓS Club. Nulo = não participa. Nível e saldo NÃO ficam aqui: são calculados das indicações e do extrato.';

-- ── As indicações ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.club_indicacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Quem indicou: o membro do Club.
  indicador_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  -- Quem foi indicado. Pode não ter ficha ainda (agendamento de paciente novo
  -- sem cadastro), e por isso o nome viaja junto.
  indicado_id uuid REFERENCES public.patients(id) ON DELETE SET NULL,
  indicado_nome text NOT NULL,
  -- O agendamento que vai confirmar esta indicação. É por ele que a conclusão
  -- do atendimento encontra a indicação, sem ninguém procurar nada.
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pendente',
  confirmada_em timestamptz,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT club_indicacoes_status_valido
    CHECK (status IN ('pendente', 'confirmada', 'cancelada')),
  -- Ninguém indica a si mesmo.
  CONSTRAINT club_indicacoes_nao_e_voce CHECK (indicador_id IS DISTINCT FROM indicado_id)
);

-- Uma pessoa é indicada UMA vez. Sem isto, dois agendamentos do mesmo paciente
-- novo contariam dois pontos para quem indicou — e a régua de níveis é feita
-- de "novos clientes", não de consultas.
CREATE UNIQUE INDEX IF NOT EXISTS club_indicacoes_um_indicado
  ON public.club_indicacoes (owner_id, indicado_id)
  WHERE indicado_id IS NOT NULL AND status <> 'cancelada';

CREATE INDEX IF NOT EXISTS club_indicacoes_do_indicador
  ON public.club_indicacoes (owner_id, indicador_id, status);
CREATE INDEX IF NOT EXISTS club_indicacoes_do_agendamento
  ON public.club_indicacoes (appointment_id)
  WHERE appointment_id IS NOT NULL;

ALTER TABLE public.club_indicacoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS club_indicacoes_acesso ON public.club_indicacoes;
CREATE POLICY club_indicacoes_acesso ON public.club_indicacoes
  FOR ALL USING (public.can_access_row(owner_id))
  WITH CHECK (public.can_access_row(owner_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_indicacoes TO authenticated;

COMMENT ON TABLE public.club_indicacoes IS
  'Quem indicou quem. Nasce pendente no agendamento e vira confirmada quando aquele agendamento é concluído — o mesmo clique que a recepção já dá.';

-- ── O extrato de créditos ────────────────────────────────────────────────
--
-- Lançamentos, nunca saldo. Entrada positiva, uso negativo, e o saldo é a
-- soma — é o que permite responder "de onde veio esse crédito?" meses depois.
CREATE TABLE IF NOT EXISTS public.club_creditos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  -- Positivo libera, negativo consome. Nunca zero: lançamento de zero é ruído
  -- no extrato de alguém.
  valor numeric(12, 2) NOT NULL,
  tipo text NOT NULL,
  -- O nível que desbloqueou este crédito, quando `tipo = 'nivel'`.
  nivel_id uuid REFERENCES public.club_niveis(id) ON DELETE SET NULL,
  descricao text NOT NULL,
  -- O atendimento em que o crédito foi usado, quando houver.
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT club_creditos_valor_nao_zero CHECK (valor <> 0),
  CONSTRAINT club_creditos_tipo_valido
    CHECK (tipo IN ('nivel', 'boas_vindas', 'uso', 'ajuste'))
);

-- O crédito de um nível entra UMA vez por pessoa. É a trava contra o membro
-- que chega ao Gold, tem uma indicação cancelada e volta ao Gold depois —
-- desbloqueando R$ 1.000 de novo.
CREATE UNIQUE INDEX IF NOT EXISTS club_creditos_um_por_nivel
  ON public.club_creditos (owner_id, patient_id, nivel_id)
  WHERE tipo = 'nivel' AND nivel_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS club_creditos_do_paciente
  ON public.club_creditos (owner_id, patient_id, created_at DESC);

ALTER TABLE public.club_creditos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS club_creditos_acesso ON public.club_creditos;
CREATE POLICY club_creditos_acesso ON public.club_creditos
  FOR ALL USING (public.can_access_row(owner_id))
  WITH CHECK (public.can_access_row(owner_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_creditos TO authenticated;

COMMENT ON TABLE public.club_creditos IS
  'Extrato de créditos do NÓS Club. O saldo é a soma destes lançamentos — não existe campo de saldo, de propósito.';

-- ── A régua inicial ──────────────────────────────────────────────────────
--
-- Os quatro níveis que a clínica definiu, para cada dono que já tem paciente
-- cadastrado. Idempotente: rodar de novo não duplica nem desfaz uma régua que
-- a clínica já tenha ajustado.
INSERT INTO public.club_niveis (owner_id, nome, indicacoes, credito, ordem)
SELECT d.owner_id, n.nome, n.indicacoes, n.credito, n.ordem
FROM (SELECT DISTINCT owner_id FROM public.patients WHERE owner_id IS NOT NULL) d
CROSS JOIN (
  VALUES
    ('Start', 1, 50.00, 1),
    ('Premium', 5, 500.00, 2),
    ('Gold', 10, 1000.00, 3),
    ('Diamond', 20, 2000.00, 4)
) AS n(nome, indicacoes, credito, ordem)
ON CONFLICT (owner_id, indicacoes) DO NOTHING;
