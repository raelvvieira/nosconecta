-- O grupo de cada categoria no DRE.
--
-- É o que separa o aluguel (despesa fixa) da cadeira odontológica
-- (investimento, fora do resultado). As regras e o palpite por nome estão em
-- `src/lib/finance/dre.ts`; aqui só a coluna, com os valores que ela aceita,
-- e um primeiro preenchimento pelo nome para as categorias que já existem —
-- a tela deixa trocar.
ALTER TABLE public.financial_categories
  ADD COLUMN IF NOT EXISTS grupo_dre text
  CHECK (grupo_dre IN ('receita', 'custo_variavel', 'despesa_fixa', 'financeiro', 'investimento'));

UPDATE public.financial_categories SET grupo_dre = CASE
  WHEN type = 'income' THEN 'receita'
  WHEN translate(lower(name), 'áàâãéêíóôõúç', 'aaaaeeiooouc') ~ '(constru|obra|movei|mobili|equipamento|reforma|instalacao|cadeira)' THEN 'investimento'
  WHEN translate(lower(name), 'áàâãéêíóôõúç', 'aaaaeeiooouc') ~ '(juro|imposto|tarifa|taxa banc|multa|iof)' THEN 'financeiro'
  WHEN translate(lower(name), 'áàâãéêíóôõúç', 'aaaaeeiooouc') ~ '(insumo|laborat|comiss|material de consumo|protese|descart|maquininha|taxa de cart)' THEN 'custo_variavel'
  ELSE 'despesa_fixa'
END
WHERE grupo_dre IS NULL;
