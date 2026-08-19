-- Automações v3: fluxo em grafo (cards e ligações editáveis) no lugar da
-- lista plana de ações.
--
-- Tudo ADD COLUMN IF NOT EXISTS de propósito: a v2
-- (20260819120000_automations_v2.sql) pode ou não ter sido aplicada quando
-- esta rodar, e esta precisa funcionar nos dois casos.

-- Grafo do fluxo.
--
-- nodes: [{ id, type: "trigger"|"action"|"condition"|"randomizer",
--           position: {x,y}, data: {...} }]
-- edges: [{ id, source, target, sourceHandle: "sim"|"nao"|"a"|"b"|null }]
--
-- O nó "trigger" é só âncora de layout e de ligação — o CONTEÚDO do gatilho
-- (evento, condições, janela) continua nas colunas trigger_event /
-- trigger_conditions / schedule_window, que é o que o executor filtra usando
-- idx_automation_rules_owner_event. Assim o grafo não custa nada na consulta.
--
-- `actions` continua sendo escrita como espelho derivado por um release: a
-- tela de lista usa pro resumo, e um rollback da Edge Function deixa de ser
-- um no-op silencioso. Depreciada — o executor lê `nodes`.
ALTER TABLE public.automation_rules
  ADD COLUMN IF NOT EXISTS nodes jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS edges jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Teto de tamanho: um fluxo legítimo não passa disso, e sem limite um bug de
-- UI conseguiria gravar um jsonb gigante que o executor teria que percorrer.
ALTER TABLE public.automation_rules
  DROP CONSTRAINT IF EXISTS automation_rules_nodes_max;
ALTER TABLE public.automation_rules
  ADD CONSTRAINT automation_rules_nodes_max
  CHECK (jsonb_array_length(nodes) <= 100 AND jsonb_array_length(edges) <= 200);

-- Fila de execução adiada: retomar passa a ser "continue a partir deste nó",
-- e não mais "execute o resto desta lista".
--
-- graph_snapshot congela nodes+edges no momento do enfileiramento. Sem ele, a
-- linha viraria uma referência para a regra viva — e editar o fluxo durante
-- uma espera de 3 dias deixaria o pendente apontando para um nó que já não
-- existe. Com o snapshot, a linha continua autossuficiente, que é a
-- propriedade que remaining_actions já dava.
ALTER TABLE public.automation_pending_actions
  ADD COLUMN IF NOT EXISTS resume_node_id text,
  ADD COLUMN IF NOT EXISTS graph_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Agrupa as linhas de uma mesma execução. Num fluxo com ramificação, "por que
-- não mandou?" é indecifrável sem saber qual caminho foi percorrido.
ALTER TABLE public.automation_runs
  ADD COLUMN IF NOT EXISTS run_id uuid;

CREATE INDEX IF NOT EXISTS idx_automation_runs_run
  ON public.automation_runs (run_id);
