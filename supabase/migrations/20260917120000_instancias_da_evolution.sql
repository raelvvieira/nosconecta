-- De quem é cada instância da Evolution.
--
-- ── Por que uma tabela, e não uma variável de ambiente ───────────────────
--
-- O webhook da Evolution chega sem dono: o corpo traz o NOME da instância
-- ("nos-odontologia-5548...") e mais nada que diga a qual clínica ela
-- pertence. Sem essa tradução, a função não sabe em qual `owner_id` gravar.
--
-- Poderia ser um segredo com um nome fixo, e funcionaria hoje — com uma
-- clínica. Na segunda, alguém teria que lembrar de editar o segredo, e o
-- esquecimento apareceria como mensagem gravada na clínica errada. Numa
-- tabela, instância sem dono simplesmente não é aceita.

CREATE TABLE IF NOT EXISTS public.wa_instances (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- O nome da instância dentro da Evolution. Único no servidor inteiro, e é
  -- a única coisa que o webhook traz para se identificar.
  instance_name  text NOT NULL,
  -- O número conectado, quando já houve conexão. Serve para conferir na tela
  -- que a instância é a que se pensa que é, antes de virar a chave.
  phone_e164     text,
  status         text NOT NULL DEFAULT 'desconhecido'
                   CHECK (status IN ('open', 'connecting', 'close', 'desconhecido')),
  connected_at   timestamptz,
  -- Quando o último evento chegou. É o sinal de vida da conexão: parou de
  -- chegar evento há horas significa que o WhatsApp caiu e ninguém viu.
  last_event_at  timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_instances_nome
  ON public.wa_instances (instance_name);

ALTER TABLE public.wa_instances ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies
              WHERE schemaname='public' AND tablename='wa_instances' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.wa_instances;', pol.policyname);
  END LOOP;
  -- Só leitura pelo dono. Quem cria e atualiza é a Edge Function com service
  -- role, mesmo padrão do resto do espelho: a linha reflete o estado de um
  -- servidor externo, e não é editável pela tela.
  EXECUTE 'CREATE POLICY wa_instances_owner_read ON public.wa_instances '
       || 'FOR SELECT TO authenticated USING (owner_id = auth.uid());';
END $$;

GRANT SELECT ON public.wa_instances TO authenticated;
GRANT ALL ON public.wa_instances TO service_role;
