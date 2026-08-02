-- Diagnóstico apenas, nunca exposto ao frontend (diferente de last_error).
-- Guarda a resposta crua de GET /evolution/instances quando handleStatus não
-- reconhece nenhum formato de estado de conexão conhecido, pra permitir
-- diagnosticar um campo/formato errado com uma query no banco em vez de
-- pedir pro usuário reproduzir o pareamento de novo.
ALTER TABLE public.crm_credentials ADD COLUMN crm_status_debug jsonb;
