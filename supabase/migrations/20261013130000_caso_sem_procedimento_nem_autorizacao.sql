-- A biblioteca de casos fica com três campos: imagem, título e "quando usar".
--
-- ── Por que o procedimento saiu ──────────────────────────────────────────
--
-- Amarrar a foto a um item do catálogo parecia preciso e era estreito. O
-- primeiro caso cadastrado de verdade mostrou isso em cinco minutos: a clínica
-- subiu fotos de limpeza e clareamento e teve de ligá-las a "Clareamento em
-- consultório (limpeza + 2 sessões)", que é o nome de um combo da tabela de
-- preços. Na instrução, a Luna lia aquilo como se a foto só servisse para quem
-- falasse daquele combo exato — e quem perguntasse só de clareamento ficaria
-- sem prova visual, com a imagem certa parada na biblioteca.
--
-- A saída seria cadastrar a mesma foto uma vez por procedimento vizinho. O
-- campo `quando_usar` já resolve isso numa frase: "quando o assunto for limpeza
-- ou clareamento" cobre as duas conversas e mais as que ninguém previu.
--
-- O `procedure_id` também nunca filtrou nada em código — era só um rótulo na
-- lista que o modelo lê. Um rótulo estreito é pior que rótulo nenhum.
--
-- ── Por que a autorização saiu ───────────────────────────────────────────
--
-- `autorizada_em` e `autorizada_por` eram registro, nunca trava: o sistema não
-- verificava nada. Dois campos opcionais que ninguém preenche são piores do que
-- não existir, porque a tela passa a sugerir que existe um controle que não
-- existe. A responsabilidade continua inteira de quem sobe a imagem, e o aviso
-- na tela continua dizendo isso.
--
-- Se um dia for preciso guardar quem autorizou, a coluna volta — e aí com uma
-- regra de verdade por trás, não com um campo de texto livre.

ALTER TABLE public.ai_agent_casos
  DROP COLUMN IF EXISTS procedure_id,
  DROP COLUMN IF EXISTS autorizada_em,
  DROP COLUMN IF EXISTS autorizada_por;

COMMENT ON TABLE public.ai_agent_casos IS
  'Casos de antes e depois que a Luna pode enviar. Imagem, título e o assunto que o caso cobre — nada amarra a foto a um item do catálogo de preços.';
