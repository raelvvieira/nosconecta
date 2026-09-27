ALTER TABLE public.ai_agents
  ADD COLUMN IF NOT EXISTS instrucao_base text;

COMMENT ON COLUMN public.ai_agents.instrucao_base IS
  'O manual de condução escrito pela clínica (LUNA V1). Quando preenchido, substitui o método gerado pelo aprendizado; preços, horários, paciente modelo e regras invioláveis continuam anexados pelo sistema.';