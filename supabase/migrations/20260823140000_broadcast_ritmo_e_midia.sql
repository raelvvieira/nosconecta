-- Ritmo em faixa, pausa por bloco e imagem no disparo.
--
-- Até aqui o disparo tinha um único `interval_seconds` fixo. Cadência exata é
-- justamente o padrão que sistemas antispam reconhecem como robô — 200
-- mensagens a cada 8 segundos cravados não se parece com ninguém digitando. A
-- faixa (5 a 10s, sorteada a cada mensagem) e a pausa por bloco existiam no
-- formulário de campanhas do CRM, que nunca chegou a enviar nada; passam para o
-- disparo, que é o caminho que entrega.
--
-- `interval_seconds` FICA, e não vira lixo: é o que os disparos já gravados
-- usam, e a leitura cai nele quando a faixa é nula. Trocar a coluna por outra
-- reescreveria o histórico para um ritmo que aqueles envios não tiveram.

ALTER TABLE public.whatsapp_broadcasts
  -- Faixa de intervalo, em segundos. Nulas = usa `interval_seconds` (histórico).
  ADD COLUMN IF NOT EXISTS interval_min_seconds integer,
  ADD COLUMN IF NOT EXISTS interval_max_seconds integer,
  -- Pausa longa a cada N mensagens. 0 ou nulo = sem pausa.
  ADD COLUMN IF NOT EXISTS pause_after integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS resume_after_minutes integer NOT NULL DEFAULT 5,
  -- Imagem enviada JUNTO do texto, como legenda numa mensagem só. Guardamos o
  -- caminho no bucket `crm-campaign-media` (privado), não uma URL assinada: a
  -- assinatura expira, e a fila pode levar horas para chegar ao último alvo.
  ADD COLUMN IF NOT EXISTS media_path text;

-- Faixa coerente: máximo nunca abaixo do mínimo, e nada fora de 1–300s. O
-- mesmo limite que `_shared/ritmo.ts` aplica na aplicação — aqui é a rede que
-- pega qualquer escrita que não passe por lá.
ALTER TABLE public.whatsapp_broadcasts
  DROP CONSTRAINT IF EXISTS whatsapp_broadcasts_faixa_coerente;
ALTER TABLE public.whatsapp_broadcasts
  ADD CONSTRAINT whatsapp_broadcasts_faixa_coerente CHECK (
    (interval_min_seconds IS NULL AND interval_max_seconds IS NULL)
    OR (
      interval_min_seconds BETWEEN 1 AND 300
      AND interval_max_seconds BETWEEN 1 AND 300
      AND interval_max_seconds >= interval_min_seconds
    )
  );

ALTER TABLE public.whatsapp_broadcasts
  DROP CONSTRAINT IF EXISTS whatsapp_broadcasts_pausa_sana;
ALTER TABLE public.whatsapp_broadcasts
  ADD CONSTRAINT whatsapp_broadcasts_pausa_sana CHECK (
    pause_after >= 0 AND pause_after <= 500
    AND resume_after_minutes >= 0 AND resume_after_minutes <= 240
  );

-- Por que a imagem não chegou, quando não chegou. Preenchido só nesse caso, e
-- lido pelo painel de execuções: sem isto, "mandei com foto e a foto não foi"
-- viraria mistério em vez de linha explicada.
ALTER TABLE public.whatsapp_broadcast_targets
  ADD COLUMN IF NOT EXISTS media_skipped_reason text;
