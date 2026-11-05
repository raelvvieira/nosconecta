-- O card de avisos do Club passa a guardar TODA tentativa que não funcionou,
-- não só as de nome diferente e conta repetida: telefone incompleto, e-mail que
-- já tem outra conta e erro técnico. Sem o telefone certo não há WhatsApp para
-- chamar a pessoa, então guarda também o e-mail digitado.
ALTER TABLE public.club_avisos ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.club_avisos ADD COLUMN IF NOT EXISTS detalhe text;
ALTER TABLE public.club_avisos DROP CONSTRAINT IF EXISTS club_avisos_motivo_check;
ALTER TABLE public.club_avisos ADD CONSTRAINT club_avisos_motivo_check
  CHECK (motivo IN ('nome_diferente', 'ja_tinha_conta', 'telefone_invalido', 'email_em_uso', 'erro'));
