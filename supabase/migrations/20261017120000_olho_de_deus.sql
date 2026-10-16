-- O Olho de Deus: a semana da Luna somada num relatório, toda segunda-feira.
--
-- ── Por que um olho novo, tendo um ───────────────────────────────────────
--
-- `ai_agent_licoes` já existe e funciona: desde 29/09, de hora em hora, a Luna
-- avalia cada conversa encerrada e grava o que funcionou, o que faltou e o que
-- mudar no manual. Em 16/10 eram 117 lições, e elas são boas — 72 das 117
-- sugestões dizem a MESMA coisa (depois do preço, oferecer dois horários em
-- vez de fazer outra pergunta), que é exatamente o gargalo que a auditoria
-- confirmou.
--
-- O que falta não é inteligência: é soma. Ninguém lê 117 linhas, e o padrão só
-- aparece agrupando. Fora isso, o olho antigo tem dois limites estruturais:
--
--   Ele olha UMA conversa por vez. "Preço citado 109 vezes, horário oferecido
--   12" não existe dentro de nenhuma conversa; existe entre elas.
--
--   Ele olha só a conversa, nunca o sistema. As 2.910 mensagens que a Luna
--   deixou de responder, com o motivo gravado em `ai_agent_messages`, eram
--   invisíveis para ele — e era lá que estava o maior gargalo de todos.
--
-- Este olho lê os dois lados e escreve UM documento por semana.

-- ── O relatório ─────────────────────────────────────────────────────────
--
-- Guardado inteiro: os números como foram contados (`numeros`), o texto que o
-- modelo escreveu a partir deles (`relatorio`), e o markdown montado (que é o
-- que a clínica baixa). Os três, e não só o markdown, porque a comparação
-- entre semanas é feita sobre os NÚMEROS — e reextraí-los de um texto depois
-- seria adivinhar o que já se sabia.
CREATE TABLE IF NOT EXISTS public.ai_olho_relatorios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- A janela, em dias de calendário. `date` e não `timestamptz`: a semana da
  -- clínica começa na segunda de manhã no fuso dela, não às 00:00 em UTC.
  de date NOT NULL,
  ate date NOT NULL,
  numeros jsonb NOT NULL DEFAULT '{}'::jsonb,
  relatorio jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- As práticas de fora, quando a busca na internet rodou. `NULL` quando não
  -- rodou, e aí `motivo_sem_praticas` diz por quê — as duas nunca estão
  -- preenchidas juntas.
  praticas jsonb,
  motivo_sem_praticas text,
  markdown text NOT NULL DEFAULT '',
  modelo text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_olho_relatorios_janela CHECK (ate >= de)
);

-- Uma semana, um relatório. Rodar de novo a mesma semana ATUALIZA em vez de
-- empilhar: o cron pode repetir (reenvio, rodada manual depois da automática),
-- e duas versões da mesma semana fariam a tela mostrar duas verdades.
CREATE UNIQUE INDEX IF NOT EXISTS ai_olho_relatorios_semana_unica
  ON public.ai_olho_relatorios (owner_id, de, ate);

-- A leitura é sempre "os últimos desta clínica".
CREATE INDEX IF NOT EXISTS ai_olho_relatorios_recentes
  ON public.ai_olho_relatorios (owner_id, ate DESC);

ALTER TABLE public.ai_olho_relatorios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_olho_relatorios_acesso ON public.ai_olho_relatorios;
CREATE POLICY ai_olho_relatorios_acesso ON public.ai_olho_relatorios
  FOR ALL USING (public.can_access_row(owner_id))
  WITH CHECK (public.can_access_row(owner_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_olho_relatorios TO authenticated;

COMMENT ON TABLE public.ai_olho_relatorios IS
  'Um relatório por semana do Olho de Deus: os números contados no banco, o texto que o modelo escreveu a partir deles, e o markdown para baixar.';
COMMENT ON COLUMN public.ai_olho_relatorios.numeros IS
  'As contagens, como saíram de numerosDaSemana. Guardadas cruas porque é sobre elas que a comparação entre semanas é feita — reextraí-las do texto depois seria adivinhar o que já se sabia.';
COMMENT ON COLUMN public.ai_olho_relatorios.praticas IS
  'O que se faz fora desta clínica, quando a busca na internet rodou. É referência, nunca medição: onde contradisser os números, os números ganham.';
COMMENT ON COLUMN public.ai_olho_relatorios.motivo_sem_praticas IS
  'Por que a busca não rodou. A busca é uma chamada separada justamente para a semana inteira não se perder quando ela falha.';

-- ── A configuração do olho ──────────────────────────────────────────────
--
-- Três interruptores em `ai_agents`, ao lado dos da Luna, e não numa tabela
-- própria: é a mesma clínica e o mesmo agente, e uma tabela de uma linha só
-- seria mais um lugar para a configuração divergir.
ALTER TABLE public.ai_agents
  ADD COLUMN IF NOT EXISTS olho_ligado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS olho_modelo text,
  ADD COLUMN IF NOT EXISTS olho_na_web boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.ai_agents.olho_ligado IS
  'O Olho de Deus gera o relatório semanal. Nasce DESLIGADO: é uma coisa nova que gasta chamada de modelo sobre a semana inteira, e isso se liga de propósito.';
COMMENT ON COLUMN public.ai_agents.olho_modelo IS
  'O modelo que lê a semana. Vazio = usa o mesmo da Luna. Separado porque ler a semana inteira e responder a um paciente são trabalhos diferentes, e quem lê pode valer um modelo melhor.';
COMMENT ON COLUMN public.ai_agents.olho_na_web IS
  'Deixar o olho buscar boas práticas na internet. Nasce desligado: depende de o modelo escolhido suportar busca, o que varia por conta, e o relatório sai completo sem isso.';

-- ── O aviso de que o relatório chegou ───────────────────────────────────
--
-- Tipo próprio, como `luna_duvida`. Um relatório semanal que ninguém sabe que
-- chegou é a mesma falha das 50 dúvidas que a Luna encaminhou para o vazio.
ALTER TABLE public.push_preferences
  ADD COLUMN IF NOT EXISTS olho_relatorio boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.push_preferences.olho_relatorio IS
  'Avisar quando o relatório semanal do Olho de Deus ficar pronto.';

-- ── O cron NÃO é agendado aqui ──────────────────────────────────────────
--
-- Mesmo motivo de `20261002120000_followup_do_agente.sql`: `cron.schedule`
-- guarda a chave de autorização DENTRO do comando (`cron.job.command`), porque
-- é assim que `net.http_post` a envia. Uma chave escrita num arquivo de
-- migration fica no git para sempre.
--
-- Agendado em 16/10/2026, a partir do comando do job que já existia — trocando
-- só o nome da função, para a chave não ser copiada à mão:
--
--   SELECT cron.schedule(
--     'olho-de-deus-semanal',
--     '38 11 * * 1',
--     replace(
--       (SELECT command FROM cron.job WHERE jobname = 'agente-licoes'),
--       '/functions/v1/agente-licoes',
--       '/functions/v1/olho-de-deus'
--     )
--   );
--
-- Segunda-feira, 11:38 UTC — 08:38 em Brasília. Segunda porque a janela é a
-- semana que acabou de fechar; 08:38 e não 09:00 porque a maioria dos
-- agendamentos do mundo cai em minuto redondo e a fila do servidor atrasa
-- quem está lá.
