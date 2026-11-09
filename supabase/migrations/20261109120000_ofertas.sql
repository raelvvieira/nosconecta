-- Ofertas: a camada entre o catálogo de procedimentos e os disparos.
--
--   Procedimentos  o que a clínica faz, com o preço normal;
--   Ofertas        algo especial, com destaque e regras próprias (Paciente
--                  Modelo, Mentoria, uma promoção de preço como a Black Estética);
--   Campanhas      os disparos e anúncios que levam as pessoas até uma oferta.
--
-- Esta tabela é o ÍNDICE comum das ofertas: o que a Luna precisa para decidir
-- qual delas serve ao que a pessoa pediu (para quem é, como reconhecer, regras
-- comerciais). O detalhe das edições com vagas (horários, reservas, sinal)
-- continua nas tabelas `agente_modulos` e `mentoria_*`, que já funcionam.
--
-- Aditiva: `campanhas` não é tocada (fica como cópia e como reserva enquanto o
-- código lê `ofertas`). Tudo por `owner_id`: nenhuma linha atravessa consultórios.

CREATE TABLE IF NOT EXISTS public.ofertas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('promocao', 'edicao')),
  nome text NOT NULL,
  estado text NOT NULL DEFAULT 'rascunho'
    CHECK (estado IN ('rascunho', 'teste', 'ligado', 'encerrada')),
  -- Promoção tem período. Edição usa as datas das próprias edições.
  inicio date,
  fim date,
  para_quem text NOT NULL DEFAULT 'todos' CHECK (para_quem IN ('paciente', 'profissional', 'todos')),
  -- Palavras e situações que indicam esta oferta, em texto livre.
  como_reconhecer text,
  -- Como conduzir. Curto, e nunca vale mais que dado cadastrado nem que as regras fixas.
  instrucoes_comerciais text,
  -- Só promoção: [{ "nome": "Toxina", "precoVista": 950, "parcelas": 6, "valorParcela": 179 }]
  itens jsonb NOT NULL DEFAULT '[]'::jsonb,
  observacoes text,
  -- Só edição: de qual módulo vem o cadastro de edições.
  modulo text CHECK (modulo IN ('paciente_modelo', 'mentoria')),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (inicio IS NULL OR fim IS NULL OR fim >= inicio),
  CHECK (tipo <> 'promocao' OR (inicio IS NOT NULL AND fim IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS ofertas_owner_idx ON public.ofertas (owner_id, estado);
CREATE UNIQUE INDEX IF NOT EXISTS ofertas_modulo_unico
  ON public.ofertas (owner_id, modulo) WHERE modulo IS NOT NULL;

ALTER TABLE public.ofertas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ofertas_do_consultorio ON public.ofertas;
CREATE POLICY ofertas_do_consultorio ON public.ofertas
  FOR ALL TO authenticated
  USING (public.can_access_row(owner_id))
  WITH CHECK (public.can_access_row(owner_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ofertas TO authenticated;
GRANT ALL ON public.ofertas TO service_role;

-- ── Promoções que já existiam em `campanhas` viram ofertas ────────────────
-- Mesmo id: rodar de novo não duplica.
INSERT INTO public.ofertas
  (id, owner_id, tipo, nome, estado, inicio, fim, para_quem, itens, observacoes, created_at, updated_at)
SELECT c.id, c.owner_id, 'promocao', c.nome,
       CASE WHEN c.ativo THEN 'ligado' ELSE 'rascunho' END,
       c.inicio, c.fim, 'paciente', c.itens, c.observacoes, c.created_at, c.updated_at
  FROM public.campanhas c
 WHERE EXISTS (SELECT 1 FROM auth.users u WHERE u.id = c.owner_id)
ON CONFLICT (id) DO NOTHING;

-- ── Uma oferta de edição por módulo já cadastrado ─────────────────────────
-- Guarda o que a Luna usa para reconhecer e separar os públicos. O estado
-- acompanha o do módulo; quem manda no módulo continua sendo `agente_modulos`.
INSERT INTO public.ofertas
  (owner_id, tipo, nome, estado, para_quem, como_reconhecer, modulo)
SELECT DISTINCT ON (m.owner_id, m.modulo)
       m.owner_id, 'edicao',
       CASE m.modulo WHEN 'paciente_modelo' THEN 'Paciente Modelo HOF'
                     ELSE 'Mentoria para profissionais' END,
       CASE m.estado WHEN 'ligado' THEN 'ligado' WHEN 'teste' THEN 'teste' ELSE 'rascunho' END,
       CASE m.modulo WHEN 'paciente_modelo' THEN 'paciente' ELSE 'profissional' END,
       CASE m.modulo
         WHEN 'paciente_modelo' THEN 'paciente modelo, ser paciente modelo, atendimento feito por aluno, prática supervisionada'
         ELSE 'mentoria, curso, quero ser aluna, vaga de aluna, turma, formação de profissional'
       END,
       m.modulo
  FROM public.agente_modulos m
 WHERE EXISTS (SELECT 1 FROM auth.users u WHERE u.id = m.owner_id)
ON CONFLICT DO NOTHING;
