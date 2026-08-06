-- Diagnóstico apenas, nunca exposto ao frontend (mesmo padrão de
-- crm_status_debug). Guarda a resposta crua de pipeline_stages/
-- pipeline_items quando o formato não bate com nenhum candidato conhecido,
-- pra diagnosticar sem precisar o usuário reproduzir o problema de novo.
ALTER TABLE public.crm_credentials ADD COLUMN crm_pipeline_debug jsonb;
