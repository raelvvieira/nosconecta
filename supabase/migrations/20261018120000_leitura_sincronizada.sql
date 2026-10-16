-- A bolinha de não lidas passa a saber do celular.
--
-- ── O que ela sabia até aqui ─────────────────────────────────────────────
--
-- "Mensagem que chegou depois da última vez que alguém abriu esta conversa NO
-- SISTEMA". Nada sobre o aparelho: quem lia no WhatsApp do celular continuava
-- vendo a bolinha acesa aqui, e quem lia aqui continuava vendo a bolinha acesa
-- lá.
--
-- Em 16/10/2026: 211 conversas com bolinha, somando 1.452 mensagens.
--
-- ── O que passa a valer ──────────────────────────────────────────────────
--
-- `read_at` deixa de ser "abriu aqui" e passa a ser "leu em algum lugar". É a
-- mesma coluna de propósito: um segundo campo obrigaria todas as contas a
-- perguntar por dois, e a primeira que esquecesse de um voltaria a mostrar
-- bolinha para conversa lida.
COMMENT ON COLUMN public.wa_conversations.read_at IS
  'Última vez que alguém da clínica leu esta conversa — no sistema OU no celular. Não lida = mensagem recebida depois disto.';

-- ── O que a Evolution manda, de verdade ──────────────────────────────────
--
-- O webhook trata três eventos e descarta o resto sem registrar. Então não há
-- como saber, olhando o banco, se o evento de leitura chega — e a resposta
-- depende de como a instância foi configurada no servidor, que não é coisa
-- deste repositório.
--
-- Esta tabela é o jeito barato de descobrir: o webhook anota o NOME de cada
-- evento que chega e as chaves de primeiro nível do corpo. Em algumas horas de
-- movimento normal, ela responde.
--
-- ── O que ela NÃO guarda ─────────────────────────────────────────────────
--
-- Conteúdo. Nem texto de mensagem, nem telefone, nem nome. Só o nome do evento
-- e a LISTA DE CHAVES do objeto — o suficiente para ver se `unreadCount` vem
-- junto, e nada que seja dado de paciente.
CREATE TABLE IF NOT EXISTS public.wa_eventos_vistos (
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  instancia text NOT NULL DEFAULT '',
  evento text NOT NULL,
  quantos bigint NOT NULL DEFAULT 0,
  chaves text[] NOT NULL DEFAULT '{}',
  primeiro_em timestamptz NOT NULL DEFAULT now(),
  ultimo_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, instancia, evento)
);

ALTER TABLE public.wa_eventos_vistos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wa_eventos_vistos_acesso ON public.wa_eventos_vistos;
CREATE POLICY wa_eventos_vistos_acesso ON public.wa_eventos_vistos
  FOR ALL USING (public.can_access_row(owner_id))
  WITH CHECK (public.can_access_row(owner_id));

GRANT SELECT ON public.wa_eventos_vistos TO authenticated;

COMMENT ON TABLE public.wa_eventos_vistos IS
  'Quais eventos a Evolution manda para esta clínica, e com que chaves. Só nome e estrutura — nunca conteúdo. Existe para responder se o evento de leitura chega sem precisar adivinhar.';
COMMENT ON COLUMN public.wa_eventos_vistos.chaves IS
  'As chaves de primeiro nível do corpo do último evento deste tipo. É por aqui que se vê se unreadCount vem junto.';

-- A contagem precisa ser atômica: o webhook recebe eventos em paralelo, e
-- ler-somar-gravar no aplicativo perderia contagem exatamente quando há
-- movimento — que é quando a medição importa.
CREATE OR REPLACE FUNCTION public.wa_anotar_evento(
  _owner uuid, _instancia text, _evento text, _chaves text[]
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.wa_eventos_vistos (owner_id, instancia, evento, quantos, chaves)
  VALUES (_owner, COALESCE(_instancia, ''), _evento, 1, COALESCE(_chaves, '{}'))
  ON CONFLICT (owner_id, instancia, evento) DO UPDATE
    SET quantos = public.wa_eventos_vistos.quantos + 1,
        chaves = COALESCE(EXCLUDED.chaves, public.wa_eventos_vistos.chaves),
        ultimo_em = now();
$$;

-- Só o service_role: quem chama é o webhook, e `SECURITY DEFINER` sem esta
-- linha deixaria qualquer sessão logada escrever a contagem de qualquer
-- clínica.
REVOKE EXECUTE ON FUNCTION public.wa_anotar_evento(uuid, text, text, text[]) FROM anon, public, authenticated;
GRANT EXECUTE ON FUNCTION public.wa_anotar_evento(uuid, text, text, text[]) TO service_role;

-- ── Marcar lida porque o celular leu ─────────────────────────────────────
--
-- Gêmea de `wa_marcar_lidas`, com duas diferenças que justificam a separação.
--
-- Quem chama é o webhook, com service role e sem sessão: a checagem de acesso
-- da outra função (`can_access_row`) recusaria. O dono aqui vem da instância,
-- que o webhook já resolveu.
--
-- E ela NÃO move `read_at` para trás. O evento pode chegar fora de ordem, ou
-- depois de alguém já ter aberto a conversa no sistema — e um `read_at` que
-- anda para trás acende de novo uma bolinha que já estava certa.
CREATE OR REPLACE FUNCTION public.wa_marcar_lida_pelo_celular(
  _owner uuid, _conversa text, _quando timestamptz DEFAULT now()
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quantas integer;
BEGIN
  UPDATE public.wa_conversations
     SET read_at = GREATEST(COALESCE(read_at, _quando), _quando),
         unread_count = 0
   WHERE owner_id = _owner
     AND crm_conversation_id = _conversa
     -- Só a conexão própria: o id de uma conversa herdada do CRM não existe no
     -- aparelho, e casar por ele seria casar por coincidência.
     AND origem = 'evolution';

  GET DIAGNOSTICS v_quantas = ROW_COUNT;
  RETURN v_quantas;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.wa_marcar_lida_pelo_celular(uuid, text, timestamptz) FROM anon, public, authenticated;
GRANT EXECUTE ON FUNCTION public.wa_marcar_lida_pelo_celular(uuid, text, timestamptz) TO service_role;

COMMENT ON FUNCTION public.wa_marcar_lida_pelo_celular(uuid, text, timestamptz) IS
  'Zera a bolinha porque o aparelho disse que a conversa foi lida. Nunca move read_at para trás: evento fora de ordem não pode reacender bolinha já apagada.';
