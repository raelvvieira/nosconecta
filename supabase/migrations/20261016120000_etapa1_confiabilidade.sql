-- Etapa 1 da V4: a conversa volta para a Luna, a dúvida encaminhada chega em
-- alguém, e o endereço do evento deixa de ser o da clínica.
--
-- ── O que a auditoria mediu, e que estas três colunas endereçam ──────────
--
-- Entre 28/09 e 15/10, 2.910 mensagens foram descartadas com o motivo "humano
-- assumiu a conversa" — o maior motivo de todos, com folga. São 171 das 291
-- conversas, e elas NUNCA voltam: `human_took_over_at` é gravado na primeira
-- mensagem que sai da clínica e não tem fim. A função que o limpa existe desde
-- o começo (`devolverParaIa`) e nunca foi ligada a um botão.
--
-- No mesmo período a Luna disse 50 vezes que ia encaminhar uma dúvida para a
-- equipe. Nenhuma dessas 50 virou aviso para ninguém: "vou encaminhar" era uma
-- frase no texto e nada mais.
--
-- E em 15/10, 01:48, numa conversa de mentoria em PORTO ALEGRE, ela respondeu
-- o endereço de Florianópolis quando perguntaram onde ficava. Não foi engano
-- de raciocínio: o endereço do local da mentoria não existia em coluna nenhuma
-- deste banco, e a instrução manda cair na unidade principal quando não há
-- horário combinado.

-- ── A dúvida que está com a equipe ──────────────────────────────────────
--
-- É o `QUESTION_ESCALATED` do manual V4, e a diferença em relação ao
-- `human_took_over_at` que já existe é justamente a que faltava: uma dúvida
-- específica esperando confirmação NÃO tira a conversa da Luna. Ela continua
-- respondendo o resto, e para de repetir a mesma pergunta porque a instrução
-- passa a dizer que aquela já está com alguém.
ALTER TABLE public.ai_agent_sessions
  ADD COLUMN IF NOT EXISTS duvida_pendente text,
  ADD COLUMN IF NOT EXISTS duvida_pendente_em timestamptz;

COMMENT ON COLUMN public.ai_agent_sessions.duvida_pendente IS
  'A dúvida que a Luna encaminhou para a equipe e ainda não foi respondida. Diferente de human_took_over_at: a conversa continua sendo dela, só esta pergunta está com alguém.';
COMMENT ON COLUMN public.ai_agent_sessions.duvida_pendente_em IS
  'Quando a dúvida foi encaminhada. Serve para a tela dizer há quanto tempo alguém está esperando.';

-- Índice só das que estão pendentes: é sempre essa a pergunta ("o que está
-- esperando a equipe?"), e um índice cheio das milhares de linhas sem dúvida
-- seria peso sem uso.
CREATE INDEX IF NOT EXISTS ai_agent_sessions_duvida_pendente_idx
  ON public.ai_agent_sessions (owner_id, duvida_pendente_em DESC)
  WHERE duvida_pendente IS NOT NULL;

-- ── O endereço do evento, que não é o da clínica ─────────────────────────
--
-- A edição de paciente modelo acontece onde a mentoria acontece, e isso pode
-- ser outra cidade e um prédio que não é da NÓS. Em outubro de 2026 é o
-- MedPlex Santana, em Porto Alegre — e as duas unidades cadastradas são as
-- clínicas, nenhuma delas esse endereço.
--
-- Coluna à parte, e não uma terceira unidade em `clinic_units`, porque um
-- local de evento não é uma unidade: não tem cadeira, não tem jornada, não
-- entra no cálculo de vaga e não deve aparecer no seletor de unidade do
-- sistema. Fosse uma unidade, a agenda passaria a oferecer horário lá.
ALTER TABLE public.ai_agents
  ADD COLUMN IF NOT EXISTS paciente_modelo_local text;

COMMENT ON COLUMN public.ai_agents.paciente_modelo_local IS
  'O endereço onde esta edição da mentoria acontece. É o que a Luna responde a "onde fica?" numa conversa de paciente modelo — e NÃO o endereço da clínica. Vazio = ela diz que vai confirmar e passa para uma pessoa.';

-- ── O aviso de dúvida encaminhada ───────────────────────────────────────
--
-- Tipo próprio, e não reaproveitando `whatsapp_message`, pelo mesmo motivo que
-- `automation` ganhou o dele: a preferência de um não pode silenciar o outro.
-- Quem desliga o aviso de mensagem nova porque o celular vibra demais não está
-- pedindo para deixar de saber que a Luna travou numa pergunta.
--
-- `DEFAULT true` e a leitura de `_shared/push.ts` tratando linha ausente como
-- "recebe tudo": os dois caminhos concordam, então a clínica que nunca abriu a
-- tela de avisos recebe este.
ALTER TABLE public.push_preferences
  ADD COLUMN IF NOT EXISTS luna_duvida boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.push_preferences.luna_duvida IS
  'Avisar quando a Luna encaminhar uma dúvida para a equipe. Ligado por padrão: sem este aviso, as 50 dúvidas encaminhadas entre 28/09 e 15/10 não chegaram a ninguém.';
