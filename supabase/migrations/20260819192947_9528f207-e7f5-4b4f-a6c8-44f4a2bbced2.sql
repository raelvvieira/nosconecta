ALTER TABLE public.automation_rules
  ADD COLUMN IF NOT EXISTS nodes jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS edges jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.automation_rules
  DROP CONSTRAINT IF EXISTS automation_rules_nodes_max;
ALTER TABLE public.automation_rules
  ADD CONSTRAINT automation_rules_nodes_max
  CHECK (jsonb_array_length(nodes) <= 100 AND jsonb_array_length(edges) <= 200);

ALTER TABLE public.automation_pending_actions
  ADD COLUMN IF NOT EXISTS resume_node_id text,
  ADD COLUMN IF NOT EXISTS graph_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.automation_runs
  ADD COLUMN IF NOT EXISTS run_id uuid;

CREATE INDEX IF NOT EXISTS idx_automation_runs_run
  ON public.automation_runs (run_id);