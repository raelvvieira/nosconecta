-- Nome do disparo.
--
-- A lista de Campanhas identificava cada disparo pelo começo da mensagem
-- enviada. Duas campanhas com abertura parecida ("Oi! Te perguntar uma
-- coisinha…") ficavam indistinguíveis justamente quando mais importa: quando há
-- várias em andamento e é preciso saber qual está em qual ponto.
--
-- Nulo é permitido de propósito: os disparos já gravados não têm nome, e
-- inventar um agora seria escrever histórico que ninguém digitou. A tela cai no
-- trecho da mensagem nesse caso, como fazia antes.
ALTER TABLE public.whatsapp_broadcasts
  ADD COLUMN IF NOT EXISTS name text;
