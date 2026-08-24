-- Tags de contato: o vocabulário e as atribuições.
--
-- Servem para categorizar quem está na base à mão — o oposto das etapas dos
-- funis, que são calculadas. É o que permite recortar "quem perguntou de
-- clareamento" para um disparo, e achar essa gente depois.
--
-- ── O problema que decide o formato ─────────────────────────────────────────
--
-- Uma tag precisa valer para duas espécies de pessoa que não moram no mesmo
-- lugar: o PACIENTE, que é linha nossa em `patients`, e o CONTATO DO WHATSAPP,
-- que mora no CRM externo e não tem linha aqui. E o CRM não tem etiquetas
-- próprias, então guardamos nós.
--
-- Por isso `contact_tags` tem DUAS colunas de destino, com exatamente uma
-- preenchida:
--
--   * `patient_id` — FK de verdade, com ON DELETE CASCADE. Excluir o paciente
--     leva as tags dele junto, sem lixo órfão.
--   * `crm_contact_id` — text, SEM FK, deliberadamente. É o mesmo arranjo de
--     `pipeline_deals.item_id`, pelo mesmo motivo: a entidade referida vive
--     fora deste banco, e uma FK apontaria para nada.
--
-- A alternativa era uma chave de texto única ("paciente:uuid" / "crm:id"), que
-- cobriria os dois casos com uma coluna só — mas perderia o CASCADE, e tag de
-- paciente excluído ficaria para sempre.
--
-- Quem costura as duas identidades numa pessoa só é `patients.crm_contact_id`,
-- na camada de aplicação (`src/lib/tags/tags.functions.ts`): a escrita prefere
-- `patient_id` quando o vínculo existe, e a leitura de um paciente também traz
-- o que foi gravado sob o `crm_contact_id` dele.

-- ── O vocabulário ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.clinic_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  -- Uma das 8 da paleta (ver src/components/tags/cores.ts). Guardado como
  -- chave, não como hex: assim a paleta pode ser reafinada sem sair reescrevendo
  -- linha, e nenhuma tag fica com uma cor ilegível gravada para sempre.
  color text NOT NULL DEFAULT 'coral',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- "Clareamento" e "clareamento" seriam duas tags que ninguém consegue
-- distinguir na tela. O índice recusa a segunda antes de ela existir.
CREATE UNIQUE INDEX IF NOT EXISTS idx_clinic_tags_nome_unico
  ON public.clinic_tags (owner_id, lower(name));

DROP TRIGGER IF EXISTS set_clinic_tags_updated_at ON public.clinic_tags;
CREATE TRIGGER set_clinic_tags_updated_at
  BEFORE UPDATE ON public.clinic_tags
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.clinic_tags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS clinic_tags_scoped ON public.clinic_tags;
-- Escopo de clínica inteira, não de unidade: a mesma tag serve a NÓS Floripa e
-- a NÓS Porto Alegre, e duplicá-la por unidade só faria o quadro sujar.
CREATE POLICY clinic_tags_scoped ON public.clinic_tags
  FOR ALL TO authenticated
  USING (public.can_access_row(owner_id))
  WITH CHECK (public.can_access_row(owner_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinic_tags TO authenticated;
GRANT ALL ON public.clinic_tags TO service_role;

-- ── As atribuições ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.contact_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.clinic_tags(id) ON DELETE CASCADE,
  patient_id uuid REFERENCES public.patients(id) ON DELETE CASCADE,
  crm_contact_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Exatamente uma das duas. Sem isto caberia uma linha com as duas (que
  -- apareceria duplicada na leitura) ou com nenhuma (tag pendurada em ninguém).
  CONSTRAINT contact_tags_um_destino
    CHECK ((patient_id IS NOT NULL) <> (crm_contact_id IS NOT NULL))
);

-- Únicos PARCIAIS, um por destino: um índice só sobre as duas colunas não
-- serviria, porque NULL não conflita com NULL no Postgres — a mesma tag poderia
-- ser aplicada dez vezes ao mesmo paciente sem o banco reclamar.
CREATE UNIQUE INDEX IF NOT EXISTS idx_contact_tags_paciente_unico
  ON public.contact_tags (tag_id, patient_id) WHERE patient_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_contact_tags_crm_unico
  ON public.contact_tags (tag_id, crm_contact_id) WHERE crm_contact_id IS NOT NULL;

-- As duas perguntas de leitura: "as tags desta pessoa" e "quem tem esta tag".
CREATE INDEX IF NOT EXISTS idx_contact_tags_por_paciente
  ON public.contact_tags (owner_id, patient_id) WHERE patient_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contact_tags_por_crm
  ON public.contact_tags (owner_id, crm_contact_id) WHERE crm_contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contact_tags_por_tag
  ON public.contact_tags (owner_id, tag_id);

ALTER TABLE public.contact_tags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS contact_tags_scoped ON public.contact_tags;
CREATE POLICY contact_tags_scoped ON public.contact_tags
  FOR ALL TO authenticated
  USING (public.can_access_row(owner_id))
  WITH CHECK (public.can_access_row(owner_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_tags TO authenticated;
GRANT ALL ON public.contact_tags TO service_role;
