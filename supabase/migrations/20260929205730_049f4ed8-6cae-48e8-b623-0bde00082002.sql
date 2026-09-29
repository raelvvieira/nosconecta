-- Quanto a IA consumiu, e quanto isso custa.
--
-- ── O que não existia ────────────────────────────────────────────────────
--
-- A OpenAI devolve, em toda resposta, quantos tokens a chamada gastou.
-- `chamarModelo` lia só o texto e jogava esse número fora. Medido em 30/09: 19
-- chamadas desde 28/09, e zero registro de consumo. A clínica só descobria o
-- gasto abrindo o painel da OpenAI — onde o valor vem junto, sem separar o que
-- é resposta ao paciente do que é aprendizado ou card de sugestão no chat.

-- ── O livro ──────────────────────────────────────────────────────────────
--
-- Uma linha por CHAMADA ao modelo, não por mensagem: uma resposta partida em
-- três pedaços no WhatsApp é uma chamada só, e contá-la três vezes triplicaria
-- a conta.
CREATE TABLE IF NOT EXISTS public.ai_uso (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quando         timestamptz NOT NULL DEFAULT now(),
  -- O nome do modelo como a OpenAI o conhece. Guardado por linha, e não lido
  -- do agente na hora de somar: a clínica troca de modelo, e o mês passado tem
  -- de continuar valendo o preço do modelo que de fato rodou.
  modelo         text NOT NULL,
  -- Para que serviu. É o que deixa a tela responder "quem está gastando".
  -- SEM `CHECK`: um tipo novo de chamada não pode fazer a gravação falhar e
  -- perder a medição. Quem normaliza é `ParaQue`, em `_shared/consumo-da-ia.ts`.
  para           text NOT NULL,
  session_id     uuid REFERENCES public.ai_agent_sessions(id) ON DELETE SET NULL,
  -- Entrada COBRADA como nova, já sem os tokens servidos do cache.
  -- `prompt_tokens` da OpenAI inclui os do cache; somar os dois contaria a
  -- mesma entrada duas vezes. Ver `usoDaResposta`.
  tokens_entrada integer NOT NULL DEFAULT 0,
  -- Entrada servida do cache, cobrada bem mais barato. Separada porque é a
  -- MAIOR parte do consumo aqui: a instrução da Luna passa de 42 mil letras e
  -- vai inteira em toda chamada.
  tokens_cache   integer NOT NULL DEFAULT 0,
  tokens_saida   integer NOT NULL DEFAULT 0,
  -- Linha calculada por cima, e não medida. Ver a seção da estimativa no fim.
  estimado       boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Não há coluna de custo, de propósito. O modelo desta clínica (`gpt-6-luna`)
-- não é de catálogo público, então o preço vai ser digitado por quem lê a
-- fatura — DEPOIS de as chamadas já terem acontecido. Congelando o custo na
-- gravação, tudo que rodou antes disso valeria zero para sempre. Guardando só
-- os tokens, cadastrar o preço hoje acerta o mês inteiro que já passou.
COMMENT ON TABLE public.ai_uso IS
  'Uma linha por chamada ao modelo: quantos tokens custou e para que serviu. O custo em dinheiro é calculado na leitura, a partir de ai_precos_modelo.';

-- A pergunta da tela é sempre "quanto neste mês", por dono.
CREATE INDEX IF NOT EXISTS idx_ai_uso_por_mes
  ON public.ai_uso (owner_id, quando DESC);

ALTER TABLE public.ai_uso ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_uso_acesso ON public.ai_uso;
CREATE POLICY ai_uso_acesso ON public.ai_uso
  FOR ALL USING (public.can_access_row(owner_id))
  WITH CHECK (public.can_access_row(owner_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_uso TO authenticated;

-- ── O preço, digitado por quem lê a fatura ───────────────────────────────
--
-- Os modelos públicos têm preço no código (`PRECOS_DE_CATALOGO`), porque são
-- iguais para todo mundo e ninguém quer digitá-los. Esta tabela existe para o
-- que NÃO está lá — e é o caso desta clínica — e tem precedência sobre o
-- catálogo, porque quem digitou está com a fatura na mão.
CREATE TABLE IF NOT EXISTS public.ai_precos_modelo (
  owner_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  modelo       text NOT NULL,
  -- Dólares por MILHÃO de tokens, que é a unidade em que a OpenAI publica. Em
  -- qualquer outra, conferir contra a página de preços vira conta de cabeça.
  usd_entrada  numeric(12,4) NOT NULL CHECK (usd_entrada >= 0),
  -- Nulo quando o modelo não tem desconto de cache, ou quando não se sabe:
  -- aí o token de cache é cobrado como entrada cheia, que é o lado caro.
  -- Estimar barato esconderia gasto.
  usd_cache    numeric(12,4) CHECK (usd_cache IS NULL OR usd_cache >= 0),
  usd_saida    numeric(12,4) NOT NULL CHECK (usd_saida >= 0),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, modelo)
);

ALTER TABLE public.ai_precos_modelo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_precos_modelo_acesso ON public.ai_precos_modelo;
CREATE POLICY ai_precos_modelo_acesso ON public.ai_precos_modelo
  FOR ALL USING (public.can_access_row(owner_id))
  WITH CHECK (public.can_access_row(owner_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_precos_modelo TO authenticated;

COMMENT ON TABLE public.ai_precos_modelo IS
  'Preço em dólares por milhão de tokens, digitado pela clínica. Vale para modelos fora do catálogo público e tem precedência sobre ele.';

-- ── A cotação do dólar ───────────────────────────────────────────────────
--
-- Uma linha por dia, buscada quando a tela abre. NÃO é por clínica: a cotação
-- do dólar é a mesma para todo mundo, e uma tabela por dono faria cada clínica
-- buscar o mesmo número.
--
-- Guardar em vez de buscar toda vez não é só economia de chamada: é o que
-- permite a conta de um mês passado continuar usando a cotação DAQUELE dia em
-- vez da de hoje.
CREATE TABLE IF NOT EXISTS public.cotacao_dolar (
  dia        date PRIMARY KEY,
  valor      numeric(10,4) NOT NULL CHECK (valor > 0),
  buscado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cotacao_dolar ENABLE ROW LEVEL SECURITY;

-- Sem `can_access_row`: não há dono. É informação pública (a mesma que o Banco
-- Central publica), e qualquer conta autenticada pode ler e gravar a do dia.
-- O risco de alguém gravar uma cotação errada existe e é aceito: a tela mostra
-- de que dia é o número, e o pior caso é um valor em reais visivelmente torto,
-- não um vazamento.
DROP POLICY IF EXISTS cotacao_dolar_leitura ON public.cotacao_dolar;
CREATE POLICY cotacao_dolar_leitura ON public.cotacao_dolar
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON public.cotacao_dolar TO authenticated;

COMMENT ON TABLE public.cotacao_dolar IS
  'Cotação do dólar por dia, buscada uma vez ao abrir a tela. Compartilhada entre todas as clínicas: o dólar é o mesmo para todas.';

-- ── A estimativa do que já passou ────────────────────────────────────────
--
-- A clínica pediu um número para o que já foi gasto antes de a medição
-- existir. Ele NÃO é medido, é calculado por cima, e a tela diz isso.
--
-- A conta, e de onde sai cada peça:
--
--   **Uma chamada por resposta gerada.** Cada linha `direction = 'entrada'` em
--   `ai_agent_messages` é uma mensagem que a IA de fato respondeu, ou seja uma
--   chamada ao modelo. As linhas `'saida'` são os PEDAÇOS de uma resposta, e
--   contá-las daria três chamadas onde houve uma.
--
--   **Entrada = a instrução inteira.** É o que domina: o manual da Luna, mais
--   a tabela de preços dos procedimentos ativos, mais as regras fixas. Os dois
--   primeiros são medíveis agora, em SQL; o terceiro é constante e cabe em
--   ~3.500 letras.
--
--   **Saída = o texto que saiu**, somado dos pedaços da mesma sessão.
--
--   **4 letras por token.** É a razão usual em português. Erra para os dois
--   lados e não passa de uns 15%.
--
-- O erro grande e conhecido: a instrução mudou de tamanho várias vezes desde
-- 28/09 (o manual nasceu neste período), e aqui ela é medida como está HOJE.
-- Para as chamadas antigas isso superestima. É o preço de ter um número, e é
-- por isso que ele fica marcado.
--
-- Idempotente pelo `NOT EXISTS`: o Lovable recombina migrations, e uma segunda
-- passada não pode dobrar a estimativa.
INSERT INTO public.ai_uso (owner_id, quando, modelo, para, session_id, tokens_entrada, tokens_cache, tokens_saida, estimado)
SELECT
  m.owner_id,
  m.created_at,
  coalesce(a.model, 'desconhecido'),
  'resposta',
  m.session_id,
  -- Tudo como entrada NOVA: não dá para saber o que teria vindo do cache, e
  -- entrada nova é a mais cara. A estimativa erra para cima, que é o lado
  -- seguro quando o número vai virar decisão de custo.
  ceil((
    coalesce(length(a.instrucao_base), 0)
    + coalesce((SELECT sum(length(p.name) + 40) FROM public.clinic_procedures p
                 WHERE p.owner_id = m.owner_id AND p.active), 0)
    + 3500
  ) / 4.0)::int,
  0,
  ceil(coalesce((
    SELECT sum(length(s.content))
      FROM public.ai_agent_messages s
     WHERE s.session_id = m.session_id
       AND s.direction = 'saida'
       AND s.created_at >= m.created_at
       AND s.created_at < m.created_at + interval '2 minutes'
  ), 0) / 4.0)::int,
  true
FROM public.ai_agent_messages m
LEFT JOIN public.ai_agents a ON a.owner_id = m.owner_id
WHERE m.direction = 'entrada'
  AND NOT EXISTS (
    SELECT 1 FROM public.ai_uso u
     WHERE u.estimado
       AND u.session_id IS NOT DISTINCT FROM m.session_id
       AND u.quando = m.created_at
  );