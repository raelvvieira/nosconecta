-- A conversa em tempo real.
--
-- ── O que isto muda ─────────────────────────────────────────────────────
--
-- Hoje a tela PERGUNTA se chegou mensagem: de 5 em 5 segundos a thread, de 15
-- em 15 a lista. A mensagem entra nesta tabela em cerca de um segundo — o
-- webhook grava com menos de 800ms entre a hora do WhatsApp e a da gravação.
-- O atraso todo está na pergunta, não na chegada.
--
-- Cinco segundos numa conversa ao vivo é o tempo de quem está do outro lado
-- achar que ninguém está lendo.
--
-- Publicando a tabela, o Postgres EMPURRA a linha nova pelo WebSocket do
-- Supabase e a tela reage na hora.
--
-- ── Sobre quem vê o quê ─────────────────────────────────────────────────
--
-- A política de acesso da tabela continua valendo: o Realtime do Supabase a
-- aplica por inscrito, então cada clínica recebe só as próprias mensagens.
-- Não há filtro a acrescentar do lado do cliente — e acrescentar um criaria
-- um segundo lugar para errar quem vê o quê.
--
-- ── Por que REPLICA IDENTITY FULL ───────────────────────────────────────
--
-- Sem isso, o evento de UPDATE e DELETE chega só com a chave primária, e o
-- que a tela precisa (a conversa a que a linha pertence) não vem junto. Para
-- INSERT não faria falta hoje, mas quando a marca de "lida" chegar por UPDATE
-- a diferença apareceria como aviso que não atualiza nada — e descobrir isso
-- depois custa mais do que a linha custa agora.

ALTER TABLE public.wa_messages REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename = 'wa_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.wa_messages;
  END IF;
END $$;
