-- O contador de não lidas passa a significar "não lidas".
--
-- ── O que estava acontecendo ─────────────────────────────────────────────
--
-- Medido em 29/09: das 1.154 conversas, as 359 com número na bolinha são TODAS
-- do CRM antigo (`origem = 'wavy'`), e em todas `unread_count = unread_at_sync`
-- — o contador que o Wavy tinha no instante da cópia, 21/09. As 103 conversas
-- da conexão própria têm `unread_count = 0` sempre: nada nunca escreveu nessa
-- coluna depois da migração.
--
-- Então a bolinha era um fóssil. Não subia quando chegava mensagem, não zerava
-- quando alguém abria a conversa, e aparecia ao lado de um horário de hoje
-- porque a lista agrupa as conversas da mesma pessoa e SOMA o contador — o
-- número velho da conversa do CRM ao lado da hora da mensagem nova.
--
-- ── O que passa a valer ──────────────────────────────────────────────────
--
-- Não lida é mensagem RECEBIDA depois da última vez que alguém da clínica abriu
-- aquela conversa. Igual ao WhatsApp.

-- ── Quando alguém daqui leu ──────────────────────────────────────────────
--
-- Uma marca por CONVERSA, e não por pessoa da equipe. Hoje a clínica tem um
-- membro ativo, e uma tabela de "lido por fulano" seria uma junção a mais em
-- toda abertura da caixa de entrada para responder a uma pergunta que ninguém
-- faz. Quando houver duas recepcionistas, o que muda é ESTA coluna virar
-- tabela; o resto do desenho continua.
ALTER TABLE public.wa_conversations
  ADD COLUMN IF NOT EXISTS read_at timestamptz;

COMMENT ON COLUMN public.wa_conversations.read_at IS
  'Última vez que alguém da clínica abriu esta conversa. Não lida = mensagem recebida depois disto.';

-- ── Quem falou por último ────────────────────────────────────────────────
--
-- Para o filtro "Sem resposta", que até agora era "tem bolinha". Com a bolinha
-- passando a zerar na leitura, esse filtro esconderia justamente quem mais se
-- esquece: a pessoa cuja mensagem você abriu, leu e não respondeu.
--
-- Agora ele é o que o nome diz, e não depende de leitura nenhuma.
ALTER TABLE public.wa_conversations
  ADD COLUMN IF NOT EXISTS last_message_from_me boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.wa_conversations.last_message_from_me IS
  'A última mensagem da conversa saiu da clínica? false = o contato falou por último e ninguém respondeu.';

-- ── O recálculo, com as duas contas novas ────────────────────────────────
--
-- Mantido em UMA função porque ela é o único lugar por onde todas as escritas
-- passam: a carga inicial, o delta do cron e o webhook da Evolution. Recalcular
-- no app significaria escrever a mesma regra em três caminhos e esquecer num.
CREATE OR REPLACE FUNCTION public.wa_recalc_conversa(p_owner uuid, p_conversa text)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_quando timestamptz;
  v_previa text;
  v_ultima RECORD;
  v_lida timestamptz;
  v_nao_lidas integer;
BEGIN
  SELECT max(sent_at) INTO v_quando
    FROM public.wa_messages
   WHERE owner_id = p_owner AND crm_conversation_id = p_conversa;

  SELECT m.body, m.attachments, m.from_me INTO v_ultima
    FROM public.wa_messages m
   WHERE m.owner_id = p_owner
     AND m.crm_conversation_id = p_conversa
     AND NOT m.is_private
   ORDER BY m.sent_at DESC, m.crm_message_id DESC
   LIMIT 1;

  IF v_ultima.body IS NOT NULL AND btrim(v_ultima.body) <> '' THEN
    v_previa := v_ultima.body;
  ELSE
    v_previa := CASE jsonb_extract_path_text(v_ultima.attachments -> 0, 'tipo')
                  WHEN 'image' THEN '📷 Foto'
                  WHEN 'audio' THEN '🎤 Áudio'
                  WHEN 'video' THEN '🎬 Vídeo'
                  WHEN 'file'  THEN '📎 Arquivo'
                  ELSE NULL
                END;
  END IF;

  SELECT c.read_at INTO v_lida
    FROM public.wa_conversations c
   WHERE c.owner_id = p_owner AND c.crm_conversation_id = p_conversa;

  -- Nota interna nunca conta: ela é rascunho da equipe, não mensagem do
  -- paciente esperando resposta.
  --
  -- `read_at` nulo é conversa que ninguém abriu desde que esta coluna existe.
  -- A carga abaixo marca todas como lidas, então nulo daqui em diante é
  -- conversa NOVA — e aí tudo que chegou nela é não lido, que é o certo.
  SELECT count(*) INTO v_nao_lidas
    FROM public.wa_messages m
   WHERE m.owner_id = p_owner
     AND m.crm_conversation_id = p_conversa
     AND NOT m.from_me
     AND NOT m.is_private
     AND (v_lida IS NULL OR m.sent_at > v_lida);

  UPDATE public.wa_conversations c
     SET last_message_at = v_quando,
         last_message_preview = v_previa,
         last_message_from_me = coalesce(v_ultima.from_me, false),
         unread_count = coalesce(v_nao_lidas, 0)
   WHERE c.owner_id = p_owner AND c.crm_conversation_id = p_conversa;
END;
$$;

-- ── Marcar como lida ─────────────────────────────────────────────────────
--
-- Recebe a lista de conversas porque quem abre uma conversa na tela abre a
-- PESSOA: um número de WhatsApp costuma ter uma linha do CRM antigo e outra da
-- conexão nova, e a thread mostra as duas juntas. Zerar só a que foi clicada
-- deixaria a bolinha acesa com a mensagem que a pessoa acabou de ler.
CREATE OR REPLACE FUNCTION public.wa_marcar_lidas(_owner uuid, _conversas text[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quantas integer;
BEGIN
  -- O dono vem do middleware da server function, mas a checagem fica aqui
  -- também: `SECURITY DEFINER` passa por cima da RLS, e uma função assim sem
  -- checagem própria lê e escreve a caixa de entrada de qualquer clínica.
  IF NOT public.can_access_row(_owner) THEN
    RAISE EXCEPTION 'sem acesso a estas conversas';
  END IF;

  UPDATE public.wa_conversations
     SET read_at = now(),
         unread_count = 0
   WHERE owner_id = _owner
     AND crm_conversation_id = ANY (_conversas);

  GET DIAGNOSTICS v_quantas = ROW_COUNT;
  RETURN v_quantas;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.wa_marcar_lidas(uuid, text[]) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.wa_marcar_lidas(uuid, text[]) TO authenticated, service_role;

COMMENT ON FUNCTION public.wa_marcar_lidas(uuid, text[]) IS
  'Zera as não lidas das conversas informadas. Chamada quando alguém abre a conversa na tela.';

-- ── A carga: tudo que existe hoje nasce lido ─────────────────────────────
--
-- A alternativa seria deixar `read_at` nulo e contar TODAS as recebidas como
-- não lidas — a caixa de entrada abriria com bolinha de 339 num grupo e de 77
-- numa conversa de setembro. O fóssil seria substituído por um número maior e
-- igualmente falso.
--
-- Marcar tudo como lido agora é a única opção honesta: ninguém sabe o que a
-- clínica já leu no CRM antigo. Daqui em diante a bolinha diz a verdade.
--
-- `WHERE read_at IS NULL` faz a migration poder rodar de novo sem apagar a
-- leitura de quem já usou a tela — o Lovable recombina migrations, e uma
-- segunda passada não pode zerar o que a clínica marcou.
UPDATE public.wa_conversations
   SET read_at = now(),
       unread_count = 0
 WHERE read_at IS NULL;

-- E `last_message_from_me` para o que já está no espelho, para o filtro "Sem
-- resposta" começar certo em vez de dizer que ninguém está esperando.
UPDATE public.wa_conversations c
   SET last_message_from_me = coalesce((
         SELECT m.from_me
           FROM public.wa_messages m
          WHERE m.owner_id = c.owner_id
            AND m.crm_conversation_id = c.crm_conversation_id
            AND NOT m.is_private
          ORDER BY m.sent_at DESC, m.crm_message_id DESC
          LIMIT 1
       ), false)
 WHERE c.last_message_at IS NOT NULL;

-- A consulta da caixa de entrada filtra por dono e ordena por recência; a
-- bolinha e o "sem resposta" viajam junto. Índice parcial porque a pergunta
-- quente é "quem tem não lida", e são poucas.
CREATE INDEX IF NOT EXISTS idx_wa_conversations_nao_lidas
  ON public.wa_conversations (owner_id, last_message_at DESC)
  WHERE unread_count > 0;