ALTER TABLE public.ai_agents
  ADD COLUMN IF NOT EXISTS paciente_modelo_ate date;

COMMENT ON COLUMN public.ai_agents.paciente_modelo_ate IS
  'Último dia da edição aberta de paciente modelo. Vazio ou no passado = não há edição, e a IA não menciona a oferta. Expira sozinho de propósito: quem esquece de desligar convidaria gente para uma mentoria que já passou.';

ALTER TABLE public.ai_agents
  ADD COLUMN IF NOT EXISTS paciente_modelo_texto text;

COMMENT ON COLUMN public.ai_agents.paciente_modelo_texto IS
  'O que a IA pode dizer sobre a edição aberta: datas, o que inclui, como funciona. Só é usado enquanto paciente_modelo_ate não passou.';