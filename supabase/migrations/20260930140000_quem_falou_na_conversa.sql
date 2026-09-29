-- O id da mensagem que a IA mandou, para saber quem escreveu quando ela volta.
--
-- ── O caso que trouxe esta coluna ────────────────────────────────────────
--
-- Em 29/09, às 18:40, a Dra. Mariane digitou "Oii", "Boa tarde", "Tudo bem?"
-- numa conversa. A Luna respondeu por cima dela às 18:40:17 e seguiu
-- respondendo por cinco minutos, até a Dra. escrever de novo e pedir desculpas
-- ao paciente: "Desculpa nossa ia".
--
-- Para a IA se calar quando uma pessoa assume, ela precisa distinguir a
-- mensagem da equipe da sua própria — e as duas saem do mesmo número, as duas
-- chegam como `from_me`.
--
-- ── O que se sabe hoje, e por que não basta ──────────────────────────────
--
-- Medido em 48 horas: o motivo "eco da própria IA" apareceu ZERO vezes contra
-- 5 de "mensagem da própria clínica". A Evolution não devolve pelo webhook as
-- mensagens que a própria API dela envia — então, hoje, toda `from_me` que
-- chega pelo webhook foi digitada por uma pessoa.
--
-- Isso é comportamento de fornecedor. Muda numa atualização, sem aviso, e no
-- dia em que mudar a IA passa a responder a si mesma em laço. A comparação por
-- TEXTO, que já existe, também erra: a recepção repete frases da IA.
--
-- O id não erra. A Evolution devolve o id no instante do envio (é ele que vai
-- para `wa_messages.crm_message_id`), e guardá-lo aqui transforma "fui eu?" em
-- comparação exata.
ALTER TABLE public.ai_agent_messages
  ADD COLUMN IF NOT EXISTS wa_message_id text;

COMMENT ON COLUMN public.ai_agent_messages.wa_message_id IS
  'O id que o WhatsApp deu à mensagem que a IA enviou. Serve para reconhecer a própria mensagem quando ela volta pelo webhook.';

-- A pergunta é sempre "este id é meu?", dentro de uma sessão e das últimas
-- horas. Índice parcial porque só as linhas de saída têm id.
CREATE INDEX IF NOT EXISTS idx_ai_messages_wa_id
  ON public.ai_agent_messages (session_id, wa_message_id)
  WHERE wa_message_id IS NOT NULL;
