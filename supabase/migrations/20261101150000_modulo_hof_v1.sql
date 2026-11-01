-- Módulo Paciente Modelo HOF V1: o que a MD especializada precisa do cadastro.
--
--  - estado do módulo em três posições: desligado, só no teste, ligado;
--  - edição publicada (data divulgada, reserva fechada) e cancelada;
--  - reserva por HORÁRIO: cada dia de prática tem a duração do atendimento,
--    e `vagas` passa a ser "pacientes por horário";
--  - pagamento em análise (a pessoa disse que pagou; a equipe confere);
--  - casos da biblioteca marcados para uso em paciente modelo.

ALTER TABLE public.agente_modulos ADD COLUMN IF NOT EXISTS estado text NOT NULL DEFAULT 'desligado'
  CHECK (estado IN ('desligado', 'teste', 'ligado'));
-- Quem estava ligado vai para "só no teste": a MD nova muda o comportamento,
-- e quem decide ligar nas conversas reais é a clínica, depois de testar.
UPDATE public.agente_modulos SET estado = CASE WHEN ativo THEN 'teste' ELSE 'desligado' END;
UPDATE public.agente_modulos SET ativo = (estado = 'ligado');
ALTER TABLE public.agente_modulos ADD COLUMN IF NOT EXISTS manual_versao text;
ALTER TABLE public.agente_modulos ADD COLUMN IF NOT EXISTS manual_em timestamptz;

ALTER TABLE public.mentoria_edicoes DROP CONSTRAINT IF EXISTS mentoria_edicoes_status_check;
ALTER TABLE public.mentoria_edicoes ADD CONSTRAINT mentoria_edicoes_status_check
  CHECK (status IN ('rascunho', 'publicada', 'inscricoes_abertas', 'esgotada', 'encerrada', 'cancelada'));
ALTER TABLE public.mentoria_edicoes ADD COLUMN IF NOT EXISTS orientacoes_chegada text;

ALTER TABLE public.mentoria_praticas ADD COLUMN IF NOT EXISTS duracao_min integer NOT NULL DEFAULT 60;

ALTER TABLE public.mentoria_reservas ADD COLUMN IF NOT EXISTS hora time;
ALTER TABLE public.mentoria_reservas ADD COLUMN IF NOT EXISTS pagamento_informado_em timestamptz;
ALTER TABLE public.mentoria_reservas DROP CONSTRAINT IF EXISTS mentoria_reservas_status_check;
ALTER TABLE public.mentoria_reservas ADD CONSTRAINT mentoria_reservas_status_check
  CHECK (status IN ('interesse', 'dia_escolhido', 'sinal_pendente', 'pagamento_em_analise', 'confirmada', 'cancelada', 'compareceu', 'faltou'));

ALTER TABLE public.ai_agent_casos ADD COLUMN IF NOT EXISTS uso text NOT NULL DEFAULT 'geral'
  CHECK (uso IN ('geral', 'paciente_modelo'));
