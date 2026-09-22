-- A IA passa a aprender lendo as conversas, e não o funil.
--
-- ── Por que isto é necessário ────────────────────────────────────────────
--
-- O aprendizado nunca rodou. `coletarVendas` procura conversas em
-- `pipeline_deals (status='won')` e `pipeline_deal_events`, cruzando com
-- `funnel_cards`. O funil começou do zero quando saímos do CRM: 0 cards, 1
-- etapa, e os 5 "won" que sobraram apontam para ids de cards do CRM que não
-- existem mais.
--
-- Então `novas` dá sempre 0, o modelo nunca é chamado, e `ai_sales_playbooks`
-- está com `learned = {}` desde o primeiro dia. A tela do Manual mostra sete
-- seções vazias — e ia continuar mostrando, porque nada no funil vai aparecer
-- tão cedo.
--
-- O material sempre esteve do outro lado: 5.251 mensagens, 318 conversas com
-- troca de verdade, 32 delas de gente que virou paciente.
--
-- ── A trava ──────────────────────────────────────────────────────────────
--
-- `source` tinha um CHECK aceitando só ('ganho','etapa') — as duas maneiras de
-- reconhecer venda PELO FUNIL. As fontes novas dizem de onde a conversa veio:
-- `paciente` (a pessoa virou paciente, que é o desfecho que se pode comprovar
-- sem funil) e `conversa` (teve troca real dos dois lados).
--
-- A coluna continua importando depois da coleta: é ela que diz, na tela, de
-- onde ele aprendeu.

ALTER TABLE public.ai_playbook_sources
  DROP CONSTRAINT IF EXISTS ai_playbook_sources_origem_da_fonte;

ALTER TABLE public.ai_playbook_sources
  ADD CONSTRAINT ai_playbook_sources_origem_da_fonte
  CHECK (source IN ('ganho', 'etapa', 'paciente', 'conversa'));

-- ── Quem é "contato novo" ────────────────────────────────────────────────
--
-- Quando a chave de resposta automática for ligada, a IA responde só quem
-- ainda não é paciente E está chegando agora. "Agora" precisa de um número, e
-- o número precisa caber na tela: uma clínica que anuncia todo dia quer uma
-- janela curta; uma que anuncia por temporada, mais longa.
--
-- 7 dias é o padrão porque é o caso que motivou a regra — o contato que chegou
-- pelo anúncio e ninguém atendeu ainda. Com a base de hoje isso são 63
-- conversas, de 400 que não são de paciente.
--
-- O teto de 90 existe para a janela não virar "qualquer um": lead de três meses
-- atrás não é contato novo, é lead esquecido, e quem fala com ele é gente.

ALTER TABLE public.ai_agents
  ADD COLUMN IF NOT EXISTS novo_ate_dias integer NOT NULL DEFAULT 7;

ALTER TABLE public.ai_agents
  DROP CONSTRAINT IF EXISTS ai_agents_janela_de_contato_novo;

ALTER TABLE public.ai_agents
  ADD CONSTRAINT ai_agents_janela_de_contato_novo
  CHECK (novo_ate_dias >= 1 AND novo_ate_dias <= 90);

COMMENT ON COLUMN public.ai_agents.novo_ate_dias IS
  'Por quantos dias uma conversa ainda conta como nova. Fora desta janela a IA '
  'não responde sozinha, mesmo que a pessoa não seja paciente — ver '
  'decidirSeResponde em supabase/functions/_shared/filtros-do-agente.ts.';

-- Os dois filtros são INTERRUPTORES, não regra fixa em código.
--
-- Dois motivos. Na tela, afrouxar a regra ("quero que ela responda paciente
-- também") passa a ser um clique em vez de um deploy. E no teste, a posição
-- "desligado" vira um caso exercitável: sem isso não há como provar que o
-- filtro é o que está calando o agente, e "a IA não respondeu" volta a ser
-- mistério.
ALTER TABLE public.ai_agents
  ADD COLUMN IF NOT EXISTS so_para_nao_paciente boolean NOT NULL DEFAULT true;

ALTER TABLE public.ai_agents
  ADD COLUMN IF NOT EXISTS so_para_conversa_nova boolean NOT NULL DEFAULT true;

-- ── O índice que a decisão exige ─────────────────────────────────────────
--
-- "Essa pessoa já é paciente?" roda A CADA MENSAGEM que entra, antes de
-- qualquer resposta. É a mesma pergunta que `getPatientByCrmContact` faz para
-- escrever "Paciente da clínica" no painel — e é de propósito que as duas
-- usem a mesma fonte: se o agente olhasse outra coluna, a tela e ele
-- discordariam sobre a mesma pessoa e não haveria como saber qual das duas
-- está certa.
--
-- (`wa_contacts.patient_id` parecia servir e não serve: nada no código a
-- escreve. Foi preenchida uma vez por backfill e congelou, então ficha criada
-- hoje não aparece lá — e o filtro deixaria a IA responder justamente os
-- pacientes mais novos.)
CREATE INDEX IF NOT EXISTS idx_patients_contato_do_whatsapp
  ON public.patients (owner_id, crm_contact_id)
  WHERE crm_contact_id IS NOT NULL;
