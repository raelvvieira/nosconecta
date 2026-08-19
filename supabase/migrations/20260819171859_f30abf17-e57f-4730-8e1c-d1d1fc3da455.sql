-- Migration: adiciona estrutura de grafo (nodes/edges) às automações
-- e converte as regras existentes do modelo antigo para o novo formato.

-- 1. Adiciona colunas nodes e edges na tabela automation_rules.
ALTER TABLE public.automation_rules
  ADD COLUMN IF NOT EXISTS nodes jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS edges jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 2. Converte regras legadas (nodes/edges vazios) para o grafo padrão.
DO $$
DECLARE
  r record;
  trigger_node jsonb;
  config_node jsonb;
  action_nodes jsonb;
  all_nodes jsonb;
  edge1 jsonb;
  edge2 jsonb;
  action_index int;
  action jsonb;
BEGIN
  FOR r IN
    SELECT id, trigger_event, trigger_conditions, actions, schedule_window
    FROM public.automation_rules
    WHERE (nodes = '[]'::jsonb OR nodes IS NULL)
      AND trigger_event IS NOT NULL
  LOOP
    trigger_node := jsonb_build_object(
      'id', 'trigger-' || r.id,
      'type', 'trigger',
      'data', jsonb_build_object('event', r.trigger_event)
    );

    config_node := jsonb_build_object(
      'id', 'config-' || r.id,
      'type', 'config',
      'data', jsonb_build_object(
        'conditions', COALESCE(r.trigger_conditions, '{}'::jsonb),
        'scheduleWindow', COALESCE(r.schedule_window, '{}'::jsonb)
      )
    );

    action_nodes := '[]'::jsonb;
    action_index := 0;
    FOR action IN SELECT * FROM jsonb_array_elements(COALESCE(r.actions, '[]'::jsonb))
    LOOP
      action_nodes := action_nodes || jsonb_build_object(
        'id', 'action-' || r.id || '-' || action_index,
        'type', 'action',
        'data', action
      );
      action_index := action_index + 1;
    END LOOP;

    all_nodes := trigger_node || config_node || action_nodes;

    edge1 := jsonb_build_object(
      'id', 'edge-trigger-config-' || r.id,
      'source', 'trigger-' || r.id,
      'target', 'config-' || r.id
    );

    edge2 := '[]'::jsonb;
    FOR action_index IN 0 .. (jsonb_array_length(action_nodes) - 1)
    LOOP
      edge2 := edge2 || jsonb_build_object(
        'id', 'edge-config-action-' || r.id || '-' || action_index,
        'source', 'config-' || r.id,
        'target', 'action-' || r.id || '-' || action_index
      );
    END LOOP;

    UPDATE public.automation_rules
    SET nodes = all_nodes,
        edges = edge1 || edge2
    WHERE id = r.id;
  END LOOP;
END $$;

-- 3. Garante permissões de acesso via Data API.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.automation_rules TO authenticated;
GRANT ALL ON public.automation_rules TO service_role;
