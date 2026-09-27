-- A instrução da Luna passa a ser um documento que a clínica escreve.
--
-- ── O que muda ───────────────────────────────────────────────────────────
--
-- Até aqui `montarInstrucao` gerava o método a partir do manual aprendido: dez
-- campos que a IA preenchia lendo as conversas. Aquilo continua valendo como
-- aprendizado, mas nunca produziu nada — `learned` está vazio desde sempre,
-- porque não havia chave de IA configurada até 27/09.
--
-- Nesse meio tempo a clínica escreveu o LUNA V1 à mão: 43 seções, na segunda
-- pessoa, com identidade, tom, etapas, limites clínicos, política de preço e
-- máquina de follow-up. É melhor do que o que eu extraí das conversas, e é
-- melhor do que o modelo escreveria sozinho, porque tem decisões que só quem
-- atende conhece.
--
-- ── Por que ela SUBSTITUI o método gerado, e não soma ────────────────────
--
-- Somar os dois daria duas fontes dizendo como falar de preço, como abrir a
-- conversa e como conduzir para a avaliação. O próprio LUNA V1 trata disso na
-- hierarquia de fontes: dado atual do sistema ganha de exemplo histórico. Duas
-- instruções em paralelo é exatamente o caso em que ninguém sabe qual valeu.
--
-- O que continua sendo anexado pelo sistema, porque é dado vivo e não texto:
-- tabela de preços liberados, horários reais da agenda, oferta de paciente
-- modelo, e as regras invioláveis.
--
-- ── Onde vive a verdade ──────────────────────────────────────────────────
--
-- Aqui. `docs/LUNA_V1.md` no repositório é o retrato de quando entrou, para
-- haver histórico; a clínica edita na tela, e o que roda é esta coluna.

ALTER TABLE public.ai_agents
  ADD COLUMN IF NOT EXISTS instrucao_base text;

COMMENT ON COLUMN public.ai_agents.instrucao_base IS
  'O manual de condução escrito pela clínica (LUNA V1). Quando preenchido, substitui o método gerado pelo aprendizado; preços, horários, paciente modelo e regras invioláveis continuam anexados pelo sistema.';
