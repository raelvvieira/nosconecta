-- Em que cidade a pessoa está, e em que dias a unidade daquela cidade atende.
--
-- ── O defeito ────────────────────────────────────────────────────────────
--
-- A clínica atende em duas cidades. A Dra. Mariane mora em Florianópolis e
-- viaja a Porto Alegre de tempo em tempo para atender no consultório de lá, e
-- os anúncios rodam para as duas cidades.
--
-- A Luna não sabia nada disso. Ela não perguntava de onde a pessoa estava
-- falando, e a agenda de Porto Alegre está cadastrada ABERTA de segunda a
-- sábado, 08:00 às 19:00, igual à de Florianópolis — com duas cadeiras. Ou
-- seja: havia vaga livre em Porto Alegre todo dia do calendário, em dias em
-- que ninguém está lá.
--
-- Com isso, ensinar a Luna a perguntar a cidade sem mais nada seria pior do
-- que o silêncio de hoje: ela confirmaria "sou de Porto Alegre" e ofereceria
-- terça às 10h, num dia em que a Dra. está a 470 km de distância.
--
-- Então são duas coisas, e as duas vêm nesta migration:
--
--   1. os DIAS em que uma unidade atende, quando ela não atende toda semana;
--   2. a CIDADE que a pessoa confirmou, guardada na conversa.
--
-- ── 1. Os dias de uma unidade ────────────────────────────────────────────
--
-- `clinic_business_hours` é por (unidade, dia da SEMANA): ela responde "a
-- unidade abre nas terças", e não "a unidade abre na terça dia 3". Não há
-- exceção por data em lugar nenhum do sistema — `blocked_times` tem
-- `start_time`/`end_time` NOT NULL e não fecha um dia inteiro, além de exigir
-- profissional na tela que a cadastra.
--
-- Por isso a coluna `schedule_mode` na unidade, em vez de inferir. Inferir
-- seria "a unidade que tem datas marcadas só atende nelas", e isso muda o
-- comportamento de Florianópolis no dia em que alguém marcar uma data lá por
-- engano. Explícito na unidade, a tela mostra o que está valendo e a conta não
-- depende de haver linha na outra tabela.
ALTER TABLE public.clinic_units
  ADD COLUMN IF NOT EXISTS schedule_mode text NOT NULL DEFAULT 'weekly';

DO $$
BEGIN
  -- Idempotente à mão: o Lovable recombina as migrations, e `ADD CONSTRAINT`
  -- não tem `IF NOT EXISTS`.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'clinic_units_schedule_mode_valido'
  ) THEN
    ALTER TABLE public.clinic_units
      ADD CONSTRAINT clinic_units_schedule_mode_valido
      CHECK (schedule_mode IN ('weekly', 'by_date'));
  END IF;
END $$;

COMMENT ON COLUMN public.clinic_units.schedule_mode IS
  'weekly: a agenda vem de clinic_business_hours, toda semana. by_date: a unidade só atende nas datas de clinic_unit_dates — é a unidade de viagem.';

-- As datas em que uma unidade `by_date` atende.
--
-- Uma linha por dia de atendimento. A hora continua vindo de
-- `clinic_business_hours`: o que muda numa viagem é QUE DIA, não o horário de
-- funcionamento — e repetir abre/fecha aqui criaria dois lugares com a mesma
-- informação, que é como se chega a dois horários diferentes para o mesmo dia.
CREATE TABLE IF NOT EXISTS public.clinic_unit_dates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- CASCADE: a data é da unidade e não existe sem ela.
  unit_id uuid NOT NULL REFERENCES public.clinic_units(id) ON DELETE CASCADE,
  date date NOT NULL,
  -- "volta no mesmo dia", "só de manhã". Para quem lê a tela, não para a Luna:
  -- nada daqui entra na instrução do modelo.
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- A mesma data duas vezes na mesma unidade não quer dizer nada, e na tela
-- apareceria como duas linhas iguais que ninguém sabe qual remover.
CREATE UNIQUE INDEX IF NOT EXISTS clinic_unit_dates_sem_repetir
  ON public.clinic_unit_dates (owner_id, unit_id, date);

-- A leitura é sempre "as datas desta clínica daqui para a frente", a cada
-- mensagem de paciente que a Luna responde.
CREATE INDEX IF NOT EXISTS clinic_unit_dates_do_dono
  ON public.clinic_unit_dates (owner_id, date);

ALTER TABLE public.clinic_unit_dates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clinic_unit_dates_acesso ON public.clinic_unit_dates;
CREATE POLICY clinic_unit_dates_acesso ON public.clinic_unit_dates
  FOR ALL USING (public.can_access_row(owner_id))
  WITH CHECK (public.can_access_row(owner_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinic_unit_dates TO authenticated;

COMMENT ON TABLE public.clinic_unit_dates IS
  'Os dias em que uma unidade com schedule_mode = by_date atende. É a viagem da Dra. a Porto Alegre: fora destas datas, a agenda daquela unidade não tem vaga.';
COMMENT ON COLUMN public.clinic_unit_dates.note IS
  'Observação para quem lê a tela. Não entra na instrução da Luna.';

-- ── 2. A cidade que a pessoa confirmou ───────────────────────────────────
--
-- Guardada na SESSÃO, e não deduzida do texto a cada mensagem, por dois
-- motivos.
--
-- O modelo não lembra o que respondeu na mensagem anterior: sem um lugar para
-- guardar, a Luna perguntaria a cidade de novo a cada mensagem — o mesmo laço
-- que `duvida_pendente` existe para impedir.
--
-- E porque é a cidade confirmada que escolhe QUAIS horários entram na
-- instrução. Ela precisa estar em mãos ANTES de montar a instrução, o que
-- significa lida do banco, não lida da resposta que ainda não existe.
--
-- `SET NULL` ao apagar a unidade: a conversa continua, só deixa de ter cidade
-- confirmada — e a Luna volta a perguntar, que é o comportamento certo quando
-- a unidade saiu do cadastro.
ALTER TABLE public.ai_agent_sessions
  ADD COLUMN IF NOT EXISTS unidade_id uuid REFERENCES public.clinic_units(id) ON DELETE SET NULL;

ALTER TABLE public.ai_agent_sessions
  ADD COLUMN IF NOT EXISTS unidade_em timestamptz;

COMMENT ON COLUMN public.ai_agent_sessions.unidade_id IS
  'A unidade da cidade que a pessoa confirmou nesta conversa. Enquanto for nula, a Luna pergunta antes de oferecer horário.';
COMMENT ON COLUMN public.ai_agent_sessions.unidade_em IS
  'Quando a cidade foi confirmada. Serve para auditar uma conversa que acabou na unidade errada.';