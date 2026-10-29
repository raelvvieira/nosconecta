-- Cupons de desconto, do lado do sistema.
--
-- O Checkout do Asaas não tem campo de cupom. O consultório digita o cupom na
-- tela de Plano; o sistema confere e já abre o checkout com o valor com
-- desconto. Quem cria e desliga cupons é a plataforma, no `/plataforma`.
-- Fechada para quem está logado: só o servidor (chave de serviço) lê.
CREATE TABLE IF NOT EXISTS public.plataforma_cupons (
  codigo text PRIMARY KEY CHECK (codigo = upper(codigo) AND codigo ~ '^[A-Z0-9_-]{3,30}$'),
  descricao text,
  tipo text NOT NULL CHECK (tipo IN ('percentual', 'valor')),
  -- Percentual: 1 a 99. Valor: em centavos.
  valor integer NOT NULL CHECK (valor > 0),
  aplica_em text NOT NULL DEFAULT 'tudo' CHECK (aplica_em IN ('assinatura', 'pacote', 'tudo')),
  -- Na assinatura: o desconto vale só na primeira cobrança; da segunda em
  -- diante, o valor cheio (o webhook ajusta a assinatura no Asaas).
  so_primeira boolean NOT NULL DEFAULT false,
  valido_ate timestamptz,
  max_usos integer CHECK (max_usos IS NULL OR max_usos > 0),
  usos integer NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.plataforma_cupons ENABLE ROW LEVEL SECURITY;

-- O checkout guarda o cupom e o valor cheio: é o que permite contar o uso só
-- quando paga, e voltar a assinatura ao valor cheio depois da primeira.
ALTER TABLE public.asaas_pagamentos
  ADD COLUMN IF NOT EXISTS cupom text,
  ADD COLUMN IF NOT EXISTS valor_cheio_centavos integer,
  ADD COLUMN IF NOT EXISTS so_primeira boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS valor_restaurado boolean NOT NULL DEFAULT false;

-- Conta um uso, numa conta só (dois pagamentos juntos não se apagam). Só a
-- chave de serviço chama.
CREATE OR REPLACE FUNCTION public.usar_cupom(_codigo text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  UPDATE public.plataforma_cupons SET usos = usos + 1 WHERE codigo = upper(_codigo)
$function$;

REVOKE ALL ON FUNCTION public.usar_cupom(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.usar_cupom(text) TO service_role;
