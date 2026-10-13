-- O grupo do WhatsApp que registra despesa no financeiro.
--
-- ── O que isto resolve ───────────────────────────────────────────────────
--
-- Lançar gasto hoje é abrir o sistema, achar a tela, preencher cinco campos.
-- Na prática ninguém faz isso na hora — faz no fim da semana, de memória, e o
-- que não lembrou some. Setembro mostrou o tamanho disso: o painel acusava
-- prejuízo de R$ 16 mil que não existia, porque a receita entrou pela agenda e
-- a despesa entrou inteira de uma vez.
--
-- Escrever "paguei 240 na conta de luz" num grupo é o que as pessoas já fazem.
--
-- ── Duas tabelas, e por que a segunda é a importante ─────────────────────
--
-- `financeiro_grupos` é só configuração: qual grupo, de qual unidade.
--
-- `financeiro_do_grupo` é a espinha. Guarda o que o robô leu em cada mensagem,
-- em que estado aquilo está e qual linha do financeiro nasceu dali. Sem ela
-- não existe desfazer ("apaga"), não existe a pergunta pendente que espera um
-- "sim", e não existe resposta para "de onde veio esta despesa?".
--
-- ── A trava que importa mais que todas ───────────────────────────────────
--
-- O índice único de `wa_message_id`.
--
-- A Evolution REENVIA evento quando o webhook demora ou devolve erro. Sem essa
-- trava, a mesma mensagem viraria duas despesas iguais, no mesmo dia, pelo
-- mesmo valor — e despesa duplicada é exatamente o erro que ninguém percebe,
-- porque parece um lançamento legítimo ao lado de outro legítimo.
--
-- É uma trava de BANCO, não de código, porque dois eventos podem chegar ao
-- mesmo tempo: qualquer verificação feita antes do insert tem uma fresta entre
-- o "já existe?" e o "então grava". O índice não tem fresta.

CREATE TABLE IF NOT EXISTS public.financeiro_grupos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- O id do grupo no WhatsApp ("120363431085189966@g.us"). É o que chega no
  -- webhook, e é por ele que o robô sabe que a mensagem é para ele.
  group_jid text NOT NULL,
  -- Para a tela: o WhatsApp não manda o nome do grupo no evento de mensagem,
  -- então quem escreve aqui é quem configura.
  apelido text,
  -- A unidade onde a despesa cai. Vem do grupo, não da mensagem: "#NÓS Floripa
  -- - Financeiro" já diz de qual unidade se trata, e ninguém precisa repetir
  -- isso em cada gasto. Um grupo por unidade é a forma natural de separar.
  unit_id uuid NOT NULL REFERENCES public.clinic_units(id) ON DELETE CASCADE,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT financeiro_grupos_jid_nao_vazio CHECK (btrim(group_jid) <> '')
);

-- Um grupo só pode apontar para uma unidade. Dois cadastros do mesmo grupo
-- fariam a mesma mensagem virar duas despesas, em unidades diferentes.
CREATE UNIQUE INDEX IF NOT EXISTS financeiro_grupos_jid_unico
  ON public.financeiro_grupos (owner_id, group_jid);

ALTER TABLE public.financeiro_grupos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS financeiro_grupos_acesso ON public.financeiro_grupos;
CREATE POLICY financeiro_grupos_acesso ON public.financeiro_grupos
  FOR ALL USING (public.can_access_row(owner_id))
  WITH CHECK (public.can_access_row(owner_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.financeiro_grupos TO authenticated;

COMMENT ON TABLE public.financeiro_grupos IS
  'Quais grupos de WhatsApp registram despesa no financeiro, e em qual unidade cada um cai.';

-- ── O que o robô fez em cada mensagem ────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.financeiro_do_grupo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  group_jid text NOT NULL,
  -- O id da mensagem no WhatsApp. Ver o índice único abaixo.
  wa_message_id text NOT NULL,
  -- O nome que a pessoa tem no WhatsApp. Serve para o recado no grupo dizer
  -- quem lançou, e para alguém saber a quem perguntar quando a linha estiver
  -- estranha. Não é identidade: é o que o aparelho informou.
  quem text,
  -- pendente  = li, perguntei, estou esperando um "sim"
  -- lancado   = virou linha no financeiro
  -- cancelado = alguém respondeu "apaga", ou disse que não
  -- ignorado  = li e não era gasto; fica registrado para dar para auditar o
  --             que o robô decidiu NÃO fazer, que é metade do comportamento
  estado text NOT NULL DEFAULT 'pendente',
  -- O que o robô entendeu, como entendeu. Guardado inteiro de propósito: no
  -- dia em que uma linha estiver errada, a pergunta é "ele leu errado ou
  -- gravou errado?", e sem isto não há como responder.
  proposta jsonb,
  -- `SET NULL` ao apagar a despesa: o registro de que o robô agiu continua, e
  -- apagá-lo junto esconderia justamente o lançamento que alguém removeu.
  transaction_id uuid REFERENCES public.financial_transactions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT financeiro_do_grupo_estado_valido
    CHECK (estado IN ('pendente', 'lancado', 'cancelado', 'ignorado'))
);

-- A trava contra a despesa em dobro. Ver o cabeçalho.
CREATE UNIQUE INDEX IF NOT EXISTS financeiro_do_grupo_mensagem_unica
  ON public.financeiro_do_grupo (owner_id, wa_message_id);

-- "Qual foi o último lançamento deste grupo?" — é a pergunta do "apaga" e a
-- do "sim", e as duas acontecem no meio de uma conversa, com alguém esperando.
CREATE INDEX IF NOT EXISTS financeiro_do_grupo_recentes
  ON public.financeiro_do_grupo (owner_id, group_jid, created_at DESC);

ALTER TABLE public.financeiro_do_grupo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS financeiro_do_grupo_acesso ON public.financeiro_do_grupo;
CREATE POLICY financeiro_do_grupo_acesso ON public.financeiro_do_grupo
  FOR ALL USING (public.can_access_row(owner_id))
  WITH CHECK (public.can_access_row(owner_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.financeiro_do_grupo TO authenticated;

COMMENT ON TABLE public.financeiro_do_grupo IS
  'O que o robô leu em cada mensagem do grupo do financeiro e o que fez com aquilo. É daqui que saem o desfazer e a auditoria.';
COMMENT ON COLUMN public.financeiro_do_grupo.wa_message_id IS
  'Id da mensagem no WhatsApp. O índice único sobre ele é o que impede a Evolution, ao reenviar um evento, de criar a mesma despesa duas vezes.';
COMMENT ON COLUMN public.financeiro_do_grupo.proposta IS
  'O que o robô entendeu, inteiro. Sem isto não dá para saber se uma linha errada veio de leitura errada ou de gravação errada.';
