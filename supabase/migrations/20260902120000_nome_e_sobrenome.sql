-- Nome e sobrenome separados em `patients`, para a Meta receber `fn` e `ln`
-- certos.
--
-- ── Por que a coluna `name` continua existindo ────────────────────────────
--
-- Ela é lida em dezenas de lugares: busca de paciente, lista, iniciais do
-- avatar, contato empurrado pro CRM, variável {{nome_completo}} do disparo.
-- Trocá-la pelas duas partes seria refazer tudo isso para ganhar nada — o
-- nome completo continua sendo o que se mostra na tela.
--
-- Então: `name` segue como o que se lê, `first_name`/`last_name` como o que se
-- envia. O gatilho abaixo é quem garante que os dois nunca discordem.

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text;

-- A MESMA regra que a Edge Function da Meta já usava: primeira palavra no
-- nome, todo o resto no sobrenome. Mudar a regra agora mudaria o hash de quem
-- já foi enviado, e o casamento na Meta se perderia sem nenhum aviso.
CREATE OR REPLACE FUNCTION public.person_name_parts(
  raw text,
  OUT first_name text,
  OUT last_name text
)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  limpo text;
  corte integer;
BEGIN
  limpo := btrim(regexp_replace(coalesce(raw, ''), '\s+', ' ', 'g'));
  IF limpo = '' THEN
    first_name := NULL;
    last_name := NULL;
    RETURN;
  END IF;

  corte := position(' ' in limpo);
  IF corte = 0 THEN
    first_name := limpo;
    last_name := NULL;
  ELSE
    first_name := left(limpo, corte - 1);
    last_name := substr(limpo, corte + 1);
  END IF;
END;
$$;

-- Mantém as três colunas coerentes venha a escrita de onde vier: do
-- formulário com dois campos, de uma conversa de WhatsApp que só tem o nome
-- inteiro, de uma importação ou da própria interface do Lovable.
--
-- Quem escreveu as PARTES manda — foi alguém que sabe onde é a divisão.
-- Só quando elas não vêm é que o nome completo é dividido automaticamente.
CREATE OR REPLACE FUNCTION public.patients_sync_name()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  partes record;
  montado text;
  veio_das_partes boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    veio_das_partes := NEW.first_name IS NOT NULL OR NEW.last_name IS NOT NULL;
  ELSE
    veio_das_partes :=
      NEW.first_name IS DISTINCT FROM OLD.first_name
      OR NEW.last_name IS DISTINCT FROM OLD.last_name;
  END IF;

  IF veio_das_partes THEN
    montado := btrim(concat_ws(
      ' ',
      NULLIF(btrim(coalesce(NEW.first_name, '')), ''),
      NULLIF(btrim(coalesce(NEW.last_name, '')), '')
    ));
    -- Partes apagadas não apagam o nome: preferir a linha que já existe a
    -- gravar um paciente sem nome nenhum, que some da busca e da lista.
    IF montado <> '' THEN
      NEW.name := montado;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' OR NEW.name IS DISTINCT FROM OLD.name THEN
    SELECT * INTO partes FROM public.person_name_parts(NEW.name);
    NEW.first_name := partes.first_name;
    NEW.last_name := partes.last_name;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS patients_sync_name ON public.patients;
CREATE TRIGGER patients_sync_name
  BEFORE INSERT OR UPDATE OF name, first_name, last_name ON public.patients
  FOR EACH ROW EXECUTE FUNCTION public.patients_sync_name();

-- Fichas que já existem: divide o que está gravado. É exatamente o que a Meta
-- já recebia dessas pessoas, então nenhum hash muda — a diferença é que agora
-- a divisão está no banco, visível e corrigível na tela.
DO $$
DECLARE
  afetados integer;
BEGIN
  UPDATE public.patients p
  SET
    first_name = (public.person_name_parts(p.name)).first_name,
    last_name  = (public.person_name_parts(p.name)).last_name
  WHERE p.name IS NOT NULL
    AND p.first_name IS NULL
    AND p.last_name IS NULL;

  GET DIAGNOSTICS afetados = ROW_COUNT;
  RAISE NOTICE 'Pacientes com nome e sobrenome preenchidos: %', afetados;
END;
$$;
