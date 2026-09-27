-- A oferta de paciente modelo, que expira sozinha.
--
-- ── Por que ela estava desligada ─────────────────────────────────────────
--
-- O manual da Luna a desativa até existir regra escrita. A clínica passou a
-- regra em 28/09, e as conversas confirmam:
--
--   Sinal de R$ 150 para reservar a vaga, abatível nos procedimentos. E o motivo
--   é dito com franqueza: "não pode faltar se não os alunos ficam sem a prática".
--   Não é taxa de reserva, é garantia de comparecimento — e essa diferença é o
--   que faz o pedido soar justo em vez de soar cobrança.
--
--   Os valores saem de uma avaliação das necessidades da pessoa, abaixo do preço
--   de mercado, durante a prática supervisionada da mentoria.
--
-- ── Por que uma DATA, e não um interruptor ───────────────────────────────
--
-- A mentoria acontece em dias marcados: a edição de agosto foi 28 e 29, e o
-- anúncio diz "valores exclusivos para essa mentoria". Uma oferta com data é
-- diferente de uma oferta permanente.
--
-- Com um booleano de "ativo", a clínica ligaria a oferta em agosto e esqueceria
-- de desligar — e a IA seguiria convidando gente para uma mentoria que já
-- aconteceu, com preços que não valem mais. Isso não daria erro em lugar nenhum:
-- daria uma pessoa chegando na clínica achando que tinha vaga.
--
-- Com a data do último dia, a oferta morre sozinha. Vazio = não há edição
-- aberta, e a IA não menciona.
--
-- ── O que a IA nunca faz aqui ────────────────────────────────────────────
--
-- Mandar dados de pagamento. A chave pix da clínica é o CPF pessoal da doutora;
-- quem manda isso é uma pessoa, olhando para a conversa. A IA explica a regra e
-- passa adiante.

ALTER TABLE public.ai_agents
  ADD COLUMN IF NOT EXISTS paciente_modelo_ate date;

COMMENT ON COLUMN public.ai_agents.paciente_modelo_ate IS
  'Último dia da edição aberta de paciente modelo. Vazio ou no passado = não há edição, e a IA não menciona a oferta. Expira sozinho de propósito: quem esquece de desligar convidaria gente para uma mentoria que já passou.';

ALTER TABLE public.ai_agents
  ADD COLUMN IF NOT EXISTS paciente_modelo_texto text;

COMMENT ON COLUMN public.ai_agents.paciente_modelo_texto IS
  'O que a IA pode dizer sobre a edição aberta: datas, o que inclui, como funciona. Só é usado enquanto paciente_modelo_ate não passou.';
