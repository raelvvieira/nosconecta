-- Pagamento pelo Asaas: a assinatura do sistema e o pacote de conversas.
--
-- O Checkout do Asaas recebe (cartão e Pix) e avisa por webhook
-- (`asaas-webhook`). Nada aqui guarda cartão nem dado de pagamento: só o que
-- foi comprado, por quem, quanto, e o identificador do Asaas para conferir.
-- Todas as tabelas novas ficam fechadas para quem está logado (sem regra):
-- quem lê e grava é o servidor, com a chave de serviço.

-- ── Preços ───────────────────────────────────────────────────────────────
-- Os da página de vendas. Ficam aqui, e não no código, para a plataforma
-- mudar no painel sem publicar nada.
CREATE TABLE IF NOT EXISTS public.plataforma_precos (
  chave text PRIMARY KEY,
  nome text NOT NULL,
  valor_centavos integer NOT NULL CHECK (valor_centavos > 0),
  -- Só nos pacotes: quantas conversas o pacote dá.
  conversas integer CHECK (conversas IS NULL OR conversas > 0),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.plataforma_precos ENABLE ROW LEVEL SECURITY;

INSERT INTO public.plataforma_precos (chave, nome, valor_centavos, conversas) VALUES
  ('basico_mensal', 'NÓS Conecta Básico (mensal)', 24900, NULL),
  ('basico_anual', 'NÓS Conecta Básico (anual)', 249000, NULL),
  ('ia_mensal', 'NÓS Conecta com IA (mensal)', 54900, NULL),
  ('ia_anual', 'NÓS Conecta com IA (anual)', 549000, NULL),
  ('pacote_conversas', '+500 conversas da assistente', 4900, 500)
ON CONFLICT (chave) DO NOTHING;

-- ── A assinatura na ficha ────────────────────────────────────────────────
-- `pago_ate`: até quando o consultório está pago. Passou 7 dias disso sem
-- pagamento novo, o sistema para (ver `plano-do-consultorio.ts`). Nulo
-- (a NÓS, os testes) = a regra não se aplica.
ALTER TABLE public.clinicas
  ADD COLUMN IF NOT EXISTS ciclo text CHECK (ciclo IS NULL OR ciclo IN ('mensal', 'anual')),
  ADD COLUMN IF NOT EXISTS pago_ate timestamptz,
  ADD COLUMN IF NOT EXISTS asaas_subscription_id text UNIQUE;

-- ── O que foi comprado ───────────────────────────────────────────────────
-- Uma linha por checkout aberto (para ligar o pagamento ao consultório) e
-- uma por cobrança paga da assinatura.
CREATE TABLE IF NOT EXISTS public.asaas_pagamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.clinicas(owner_id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('assinatura', 'pacote')),
  plano text CHECK (plano IS NULL OR plano IN ('basico', 'ia')),
  ciclo text CHECK (ciclo IS NULL OR ciclo IN ('mensal', 'anual')),
  conversas integer,
  valor_centavos integer,
  checkout_id text UNIQUE,
  payment_id text UNIQUE,
  subscription_id text,
  link text,
  status text NOT NULL DEFAULT 'aberto',
  criado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS asaas_pagamentos_owner ON public.asaas_pagamentos (owner_id, criado_em DESC);
ALTER TABLE public.asaas_pagamentos ENABLE ROW LEVEL SECURITY;

-- ── Eventos já tratados ──────────────────────────────────────────────────
-- O Asaas entrega "pelo menos uma vez": o mesmo evento pode chegar duas. O
-- `id` do evento é o mesmo nas duas, e é ele que impede somar um pacote duas
-- vezes.
CREATE TABLE IF NOT EXISTS public.asaas_eventos_vistos (
  id text PRIMARY KEY,
  evento text NOT NULL,
  recebido_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.asaas_eventos_vistos ENABLE ROW LEVEL SECURITY;

-- Soma o pacote ao saldo extra numa conta só, sem ler e regravar: dois
-- pagamentos ao mesmo tempo não se apagam. Só a chave de serviço chama.
CREATE OR REPLACE FUNCTION public.somar_conversas_extras(_owner uuid, _conversas integer)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  UPDATE public.clinicas
  SET conversas_extras = conversas_extras + _conversas, atualizado_em = now()
  WHERE owner_id = _owner
  RETURNING conversas_extras
$function$;

REVOKE ALL ON FUNCTION public.somar_conversas_extras(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.somar_conversas_extras(uuid, integer) TO service_role;
