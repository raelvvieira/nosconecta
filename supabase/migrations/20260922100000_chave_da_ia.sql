-- A chave da IA passa a caber na tela.
--
-- ── O que ela era ────────────────────────────────────────────────────────
--
-- Um segredo do Supabase (`ANTHROPIC_API_KEY`), configurado em Lovable →
-- Cloud → Secrets. Funciona, mas quem cuida da clínica não tem por que
-- aprender onde fica o painel do Lovable para trocar uma chave — e a tela do
-- agente só sabia dizer "falta a chave", sem poder fazer nada a respeito.
--
-- ── Por que no banco, e o que isso custa ────────────────────────────────
--
-- Mesmo lugar em que `meta_capi_credentials.access_token` já mora: uma coluna
-- protegida pela política de acesso da clínica. Quem pode ler é quem já podia
-- ler tudo da própria clínica.
--
-- O cuidado que precisa ser mantido está no código, não aqui: a chave **nunca
-- volta inteira para a tela**. O que sobe é um `••••••••` com os quatro
-- últimos caracteres, igual ao token da Meta. Escrever é possível; ler de
-- volta, não.
--
-- O segredo do Supabase continua valendo como reserva: quem já o tem
-- configurado não precisa fazer nada, e a chave do banco tem precedência
-- quando existe.

ALTER TABLE public.ai_agents
  ADD COLUMN IF NOT EXISTS api_key text;

COMMENT ON COLUMN public.ai_agents.api_key IS
  'Chave da API de IA desta clínica. Nunca é devolvida inteira para a tela — '
  'ver getAtendimento em src/lib/agente-ia/agente.functions.ts, que só expõe '
  'se existe e os quatro últimos caracteres. Vazio = usa o segredo '
  'ANTHROPIC_API_KEY do ambiente.';
