-- Nome curto do procedimento: como ele aparece na agenda, nos avisos e no recibo.
-- Opcional. Sem ele, vale o nome completo, como sempre. Aditiva.
ALTER TABLE public.clinic_procedures ADD COLUMN IF NOT EXISTS short_name text;
