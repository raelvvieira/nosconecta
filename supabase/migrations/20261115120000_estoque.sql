-- Estoque: o que a clínica tem guardado, por unidade, e para onde vai.
--
--   estoque_itens       o cadastro: nome, a embalagem (caixa) e quantas unidades
--                       vêm em cada uma;
--   estoque_movimentos  TODA entrada e saída, uma linha por fato. É o livro-razão:
--                       o saldo nunca é digitado, é a soma dos movimentos;
--   estoque_saldos      o saldo de cada item em cada unidade, mantido por gatilho
--                       a partir dos movimentos (para a tela não somar tudo).
--
-- Tudo em UNIDADES (a menor peça: uma seringa, uma luva). A caixa é só a forma de
-- falar: "3 caixas + 12 unidades" é a mesma coisa que 156 se a caixa tem 48.
--
-- Aditiva: nada existente muda. Tudo por `owner_id`, e o saldo e os movimentos
-- também por unidade, com a mesma regra das contas e dos lançamentos.

CREATE TABLE IF NOT EXISTS public.estoque_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome text NOT NULL,
  categoria text,
  -- Como a peça solta se chama: unidade, seringa, ampola, par, folha…
  rotulo_unidade text NOT NULL DEFAULT 'unidade',
  -- Como o item é comprado: caixa, pacote, frasco, kit…
  rotulo_embalagem text NOT NULL DEFAULT 'caixa',
  unidades_por_embalagem numeric(12, 3) NOT NULL DEFAULT 1
    CHECK (unidades_por_embalagem > 0),
  -- Abaixo disto o item pede reposição (em unidades). 0 = sem mínimo definido.
  minimo_unidades numeric(12, 3) NOT NULL DEFAULT 0 CHECK (minimo_unidades >= 0),
  ativo boolean NOT NULL DEFAULT true,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS estoque_itens_nome_unico
  ON public.estoque_itens (owner_id, lower(nome)) WHERE ativo;

CREATE TABLE IF NOT EXISTS public.estoque_movimentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.estoque_itens(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES public.clinic_units(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('entrada', 'saida', 'ajuste', 'perda')),
  -- COM SINAL, em unidades: entrada positiva, saída e perda negativas, ajuste
  -- pode ser os dois (é a diferença entre o contado e o que o sistema tinha).
  quantidade numeric(14, 3) NOT NULL CHECK (quantidade <> 0),
  -- Só na entrada: o que foi pago. Total e por unidade, para o histórico de preço.
  custo_total numeric(12, 2) CHECK (custo_total IS NULL OR custo_total >= 0),
  custo_unitario numeric(14, 4) CHECK (custo_unitario IS NULL OR custo_unitario >= 0),
  fornecedor text,
  motivo text,
  -- Reservado para a baixa automática pelo atendimento (fase seguinte).
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  ocorreu_em timestamptz NOT NULL DEFAULT now(),
  criado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS estoque_movimentos_item_idx
  ON public.estoque_movimentos (owner_id, item_id, ocorreu_em DESC);
CREATE INDEX IF NOT EXISTS estoque_movimentos_unidade_idx
  ON public.estoque_movimentos (owner_id, unit_id, ocorreu_em DESC);

CREATE TABLE IF NOT EXISTS public.estoque_saldos (
  item_id uuid NOT NULL REFERENCES public.estoque_itens(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES public.clinic_units(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quantidade numeric(14, 3) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, unit_id)
);

-- O saldo acompanha cada movimento, na mesma transação. SECURITY DEFINER porque
-- quem registra um movimento pode não ter permissão de escrever no saldo, e o
-- saldo só deve mudar por aqui. O dono vem do próprio movimento.
CREATE OR REPLACE FUNCTION public.estoque_aplicar_movimento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.estoque_saldos (item_id, unit_id, owner_id, quantidade, updated_at)
  VALUES (NEW.item_id, NEW.unit_id, NEW.owner_id, NEW.quantidade, now())
  ON CONFLICT (item_id, unit_id)
  DO UPDATE SET quantidade = public.estoque_saldos.quantidade + EXCLUDED.quantidade,
                updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS estoque_movimento_aplica_saldo ON public.estoque_movimentos;
CREATE TRIGGER estoque_movimento_aplica_saldo
  AFTER INSERT ON public.estoque_movimentos
  FOR EACH ROW EXECUTE FUNCTION public.estoque_aplicar_movimento();

-- Movimento não se edita nem se apaga: errou, lança o contrário. Sem isto o
-- saldo e o histórico divergiriam em silêncio.
CREATE OR REPLACE FUNCTION public.estoque_movimento_imutavel()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Movimento de estoque não pode ser alterado nem apagado: lance um ajuste.';
END;
$$;

DROP TRIGGER IF EXISTS estoque_movimento_sem_update ON public.estoque_movimentos;
CREATE TRIGGER estoque_movimento_sem_update
  BEFORE UPDATE ON public.estoque_movimentos
  FOR EACH ROW EXECUTE FUNCTION public.estoque_movimento_imutavel();

ALTER TABLE public.estoque_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estoque_movimentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estoque_saldos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS estoque_itens_do_consultorio ON public.estoque_itens;
CREATE POLICY estoque_itens_do_consultorio ON public.estoque_itens
  FOR ALL TO authenticated
  USING (public.can_access_row(owner_id))
  WITH CHECK (public.can_access_row(owner_id));

-- Movimentos: lê e cria; nunca altera nem apaga (o gatilho acima também barra).
DROP POLICY IF EXISTS estoque_movimentos_ler ON public.estoque_movimentos;
CREATE POLICY estoque_movimentos_ler ON public.estoque_movimentos
  FOR SELECT TO authenticated
  USING (public.can_access_row(owner_id, unit_id));
DROP POLICY IF EXISTS estoque_movimentos_criar ON public.estoque_movimentos;
CREATE POLICY estoque_movimentos_criar ON public.estoque_movimentos
  FOR INSERT TO authenticated
  WITH CHECK (public.can_access_row(owner_id, unit_id));

-- Saldo: só leitura para o app; quem escreve é o gatilho.
DROP POLICY IF EXISTS estoque_saldos_ler ON public.estoque_saldos;
CREATE POLICY estoque_saldos_ler ON public.estoque_saldos
  FOR SELECT TO authenticated
  USING (public.can_access_row(owner_id, unit_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.estoque_itens TO authenticated;
GRANT SELECT, INSERT ON public.estoque_movimentos TO authenticated;
GRANT SELECT ON public.estoque_saldos TO authenticated;
GRANT ALL ON public.estoque_itens, public.estoque_movimentos, public.estoque_saldos
  TO service_role;
REVOKE ALL ON public.estoque_itens, public.estoque_movimentos, public.estoque_saldos
  FROM anon;
