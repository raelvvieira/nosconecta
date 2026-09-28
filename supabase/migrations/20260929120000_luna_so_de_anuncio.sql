-- A Luna começa atendendo SÓ quem chegou por anúncio, e só antes de a clínica
-- ter falado.
--
-- ── Por que esta é a porta mais estreita possível ────────────────────────
--
-- É como a clínica quis começar: "ela responde apenas contatos que vêm de
-- anúncios que não têm histórico de conversa ainda; depois, futuramente,
-- outros, como os que já são pacientes, ou leads abandonados". Quem clicou num
-- anúncio há trinta segundos não conhece a clínica e não tem tratamento em
-- curso — uma resposta imperfeita ali custa menos do que custaria na conversa
-- de alguém que está em tratamento.
--
-- Interruptor, e não regra fixa em código, pelo mesmo motivo dos dois que já
-- existem (`so_para_nao_paciente`, `so_para_conversa_nova`): afrouxar a regra
-- quando a clínica ganhar confiança vira um clique na tela, não um deploy. E a
-- posição DESLIGADO fica exercitável no teste — sem isso, "a IA não respondeu"
-- volta a ser mistério.

-- ── Os dois interruptores ────────────────────────────────────────────────
--
-- `DEFAULT true` e o código lendo com `!== false`: a linha do agente já existe
-- nesta base, e nasceria com `undefined` na memória de quem a lesse antes desta
-- migration rodar. Com `!!` o filtro nasceria DESLIGADO justamente na clínica
-- que já tem agente — o contrário do que este default promete.
ALTER TABLE public.ai_agents
  ADD COLUMN IF NOT EXISTS so_de_anuncio boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.ai_agents.so_de_anuncio IS
  'Só responde quem chegou clicando num anúncio (marcador ctwaClid do WhatsApp).';

ALTER TABLE public.ai_agents
  ADD COLUMN IF NOT EXISTS so_sem_historico boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.ai_agents.so_sem_historico IS
  'Só responde enquanto ninguém da clínica tiver falado nesta conversa. As mensagens da própria IA não contam como histórico.';

-- ── De qual anúncio a pessoa veio, guardado na sessão ────────────────────
--
-- O WhatsApp anexa o marcador de anúncio SÓ à primeira mensagem de quem
-- clicou. Se o agente fosse reler o marcador a cada mensagem, na segunda
-- mensagem da pessoa ele decidiria "não veio de anúncio" e abandonaria a
-- conversa depois de uma frase — o pior comportamento possível, porque é pior
-- que nunca ter respondido.
--
-- Por isso o anúncio é propriedade da CONVERSA e fica gravado aqui na primeira
-- vez que aparece. Guardado sem a miniatura: `externalAdReply` carrega a imagem
-- do anúncio como um objeto de mais de mil bytes numerados, que não serve para
-- nada aqui (ver `_shared/veio-de-anuncio.ts`).
ALTER TABLE public.ai_agent_sessions
  ADD COLUMN IF NOT EXISTS anuncio jsonb;

COMMENT ON COLUMN public.ai_agent_sessions.anuncio IS
  'O anúncio que trouxe esta pessoa: clickId, anuncioId, rede, copy, titulo, saudacao, url. Nulo = não veio de anúncio (ou ainda não se sabe).';
