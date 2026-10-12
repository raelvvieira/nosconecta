-- A biblioteca de casos de antes e depois que a Luna pode enviar.
--
-- ── Por que existe ───────────────────────────────────────────────────────
--
-- O manual dela aposta em prova visual desde a V2: mostrar um resultado real
-- quando a pessoa tem medo de ficar artificial, ou não consegue imaginar o que
-- vai acontecer. Na V3 isso virou um mecanismo do motor de recuperação
-- (`SOCIAL_PROOF`), ao lado de verificar presença e isolar objeção.
--
-- Só que não havia onde guardar imagem nenhuma, e as duas seções do manual que
-- mandavam enviar um caso estavam marcadas como impossíveis. Pior: mandavam
-- escrever `[IMAGEM AUTORIZADA]` na conversa, o que escreveria isso literal no
-- WhatsApp de uma paciente.
--
-- O envio em si sempre existiu — é o mesmo `sendMedia` que o disparo de
-- campanha usa para mandar imagem com legenda. O que faltava era a biblioteca.
--
-- ── Por que o arquivo fica no bucket que já existe ───────────────────────
--
-- `crm-campaign-media`, o mesmo do disparo de campanha. Criar bucket é passo
-- manual no Lovable (Cloud → Storage), e este já é baixado pelo servidor com
-- service role — o caminho de download já está provado em produção.
--
-- O caminho dentro do bucket começa com o id do dono (`<owner_id>/<arquivo>`),
-- e não com uma pasta `casos/`: é o prefixo que a policy do bucket usa para
-- separar uma clínica da outra. Uma pasta por assunto quebraria essa regra e o
-- upload passaria a ser recusado.
--
-- A coluna guarda o CAMINHO, nunca uma URL assinada: URL assinada vence, e uma
-- biblioteca cheia de links mortos só se descobre quando a Luna tenta mandar.
--
-- ── Sobre a autorização ──────────────────────────────────────────────────
--
-- `autorizada_em` e `autorizada_por` são REGISTRO, não trava. O sistema não
-- verifica nada: a foto sai por decisão da IA, sozinha, para um desconhecido,
-- e quem responde por ter subido só o que podia é quem sobe.
--
-- Ficam aqui porque, no dia em que alguém perguntar "quem autorizou esta
-- foto?", a resposta precisa estar em algum lugar — e o lugar natural é ao
-- lado da imagem.

CREATE TABLE IF NOT EXISTS public.ai_agent_casos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- SET NULL e não CASCADE: apagar um procedimento do catálogo não pode apagar
  -- a foto junto. O caso continua válido, só deixa de ter procedimento ligado.
  procedure_id uuid REFERENCES public.clinic_procedures(id) ON DELETE SET NULL,
  titulo text NOT NULL,
  -- Caminho no bucket `crm-campaign-media`. Nunca chega ao modelo.
  media_path text NOT NULL,
  -- "quando a pessoa teme ficar artificial". É o que permite à Luna escolher o
  -- caso que combina com o que a pessoa disse, em vez do primeiro da lista —
  -- só o procedimento não basta para isso.
  quando_usar text,
  autorizada_em date,
  autorizada_por text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_agent_casos_titulo_nao_vazio CHECK (btrim(titulo) <> ''),
  CONSTRAINT ai_agent_casos_arquivo_nao_vazio CHECK (btrim(media_path) <> '')
);

-- A leitura é sempre "os casos ativos desta clínica", na hora de montar a
-- instrução — e ela acontece a cada mensagem respondida.
CREATE INDEX IF NOT EXISTS ai_agent_casos_do_dono
  ON public.ai_agent_casos (owner_id, ativo);

-- O mesmo arquivo cadastrado duas vezes vira dois códigos para a mesma imagem,
-- e a Luna poderia mandar "dois casos diferentes" que são a mesma foto.
CREATE UNIQUE INDEX IF NOT EXISTS ai_agent_casos_arquivo_unico
  ON public.ai_agent_casos (owner_id, media_path);

ALTER TABLE public.ai_agent_casos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_agent_casos_acesso ON public.ai_agent_casos;
CREATE POLICY ai_agent_casos_acesso ON public.ai_agent_casos
  FOR ALL USING (public.can_access_row(owner_id))
  WITH CHECK (public.can_access_row(owner_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_agent_casos TO authenticated;

COMMENT ON TABLE public.ai_agent_casos IS
  'Casos de antes e depois autorizados para a Luna enviar. O arquivo mora no bucket crm-campaign-media, sob o prefixo do id do dono.';
COMMENT ON COLUMN public.ai_agent_casos.media_path IS
  'Caminho no bucket, nunca URL assinada: URL assinada vence e vira link morto que só se descobre no envio.';
COMMENT ON COLUMN public.ai_agent_casos.quando_usar IS
  'Em que situação este caso ajuda. É o que deixa a Luna escolher o caso que combina com o que a pessoa disse.';
COMMENT ON COLUMN public.ai_agent_casos.autorizada_em IS
  'Registro de autorização, não trava: o sistema não verifica. A responsabilidade é de quem sobe a imagem.';

-- ── Qual caso foi com qual mensagem ──────────────────────────────────────
--
-- Duas coisas dependem disto.
--
-- A trava de UM caso por conversa: o modelo não lembra que já mandou, então
-- quem lembra é o banco. Sem a coluna, a segunda foto para a mesma pessoa
-- sairia na próxima mensagem — e prova social repetida vira insistência.
--
-- E a medição. O manual da Luna pede métrica por mecanismo de recuperação;
-- sem saber qual caso saiu em qual conversa, "prova visual funciona?" não tem
-- resposta.
--
-- `SET NULL` ao apagar o caso: a mensagem continua existindo no espelho, e
-- apagá-la junto seria reescrever o histórico de uma conversa real.
ALTER TABLE public.ai_agent_messages
  ADD COLUMN IF NOT EXISTS caso_id uuid REFERENCES public.ai_agent_casos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ai_agent_messages_com_caso
  ON public.ai_agent_messages (session_id)
  WHERE caso_id IS NOT NULL;

COMMENT ON COLUMN public.ai_agent_messages.caso_id IS
  'O caso de antes e depois que foi junto desta mensagem. É por ele que a trava de um caso por conversa funciona.';
