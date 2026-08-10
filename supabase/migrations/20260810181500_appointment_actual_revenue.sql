-- Valor efetivamente cobrado no dia do atendimento.
--
-- Separado de expected_revenue de propósito. O previsto é preenchido semanas
-- antes, a partir do preço de catálogo do procedimento; o cobrado é o que a
-- pessoa pagou, e é ele que deve ir como valor da conversão para a Meta.
--
-- Anulável, e é isso que importa: expected_revenue é NOT NULL DEFAULT 0, então
-- lá o zero é ambíguo — não dá para saber se o atendimento foi gratuito ou se
-- ninguém preencheu. Aqui NULL significa "ainda não confirmado" e 0 significa
-- "foi de graça", que é o que sustenta a regra de não concluir sem valor.
alter table public.appointments
  add column if not exists actual_revenue numeric(12,2);

comment on column public.appointments.actual_revenue is
  'Valor cobrado no atendimento. NULL = atendimento ainda não confirmado como realizado; 0 = gratuito.';
