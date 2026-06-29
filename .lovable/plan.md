# Plano: Auth, limpeza de dados e sync real

## 1. Banco de dados (migration única)

**Novas tabelas:**
- `profiles` — unificada (1:1 com `auth.users` via `id`): `full_name`, `phone`, `avatar_url`, `created_at`, `updated_at`. Trigger `handle_new_user` cria profile automaticamente no signup.
- `app_role` enum: `admin`, `reception`, `dentist`, `finance`.
- `user_roles` — separada (segurança): `user_id`, `role`. Função `has_role(uuid, app_role)` SECURITY DEFINER.
- `invitations` — `email`, `role`, `token` (uuid), `invited_by`, `expires_at`, `accepted_at`.

> Observação sobre "tabela única profile+users": no Supabase, `auth.users` é gerenciado pelo sistema (senhas, tokens, sessões) e não pode receber colunas custom. O padrão correto é `profiles` 1:1 com mesmo `id` de `auth.users` — funciona como extensão, não como tabela separada. Para o seu uso, ler "dados do usuário" é sempre `profiles` + `user_roles`. Roles em tabela separada é obrigatório por segurança (evita escalonamento de privilégio).

**Limpeza:** `TRUNCATE` em `patients`, `financial_transactions`, `financial_accounts`, `financial_categories`, `financial_goals`, `financial_scenarios`, `ledger_entries`, `professionals`, `patient_treatments`, `patient_care_events` (mantém estrutura, zera conteúdo).

**RLS:** todas as tabelas operacionais passam a exigir `auth.uid() IS NOT NULL` (empresa única — qualquer usuário autenticado vê tudo).

**GRANTs:** `authenticated` + `service_role` em todas as novas tabelas.

## 2. Primeiro usuário

Criado via Auth Admin API em server function de bootstrap (chamada uma vez):
- Email: `raelvvieira@gmail.com`
- Senha: `milhao1!buscaEu`
- `email_confirm: true`
- Role `admin` em `user_roles`.

## 3. Configuração de Auth

- Email/senha habilitado, `disable_signup: true` (só admin convida), `auto_confirm_email: true`, HIBP ligado.

## 4. Rotas

- `src/routes/auth.tsx` (público, SSR ligado) — abas Login e "Aceitar convite" (token + nova senha).
- Mover todas as rotas atuais para `src/routes/_authenticated/` (layout gerenciado pela integração, `ssr: false`, redireciona para `/auth`):
  - `index.tsx`, `agenda.tsx`, `pacientes.*`, `recebimentos.tsx`, `pagamentos.tsx`, `planejamento.tsx`, `configuracoes.tsx`.
- `__root.tsx` ganha listener `onAuthStateChange` (invalida router/queries em SIGNED_IN/OUT/USER_UPDATED).

## 5. Sidebar / Header

- Mostra nome do usuário logado (vindo de `profiles`).
- Botão "Sair" (signOut + cancelQueries + clear + navigate `/auth`).

## 6. Convites (admin only)

- Aba "Equipe" em `/configuracoes` (visível só para admin).
- Server function `createInvitation` (com `requireSupabaseAuth` + check `has_role admin`) gera token e retorna link `/auth?invite=<token>`.
- Página `/auth` aceita `?invite=<token>` → cria usuário com a senha digitada e marca convite como aceito.

## 7. Limpeza de código mock

Remover constantes `DEMO_*` e fallbacks `company_id = "demo"` de:
- `src/lib/patients/patients.functions.ts`
- `src/lib/settings/settings.functions.ts`
- `src/lib/finance/payables.functions.ts`
- `src/lib/finance/receivables.functions.ts`
- `src/lib/finance/planning.functions.ts`
- `src/lib/finance/queries.functions.ts`
- `src/components/agenda/mock-data.ts` (deletar + remover imports em `MobileAgenda`, `WeeklyCalendar`, `AppointmentDrawer`, etc.)

Server functions passam a usar `requireSupabaseAuth` (ler dados como usuário autenticado, RLS aplica). Sem filtro por `company_id` (empresa única — opcional manter coluna fixa `"default"` para compatibilidade com schema atual).

`src/start.ts` recebe `attachSupabaseAuth` no `functionMiddleware`.

## 8. GitHub

A sincronização com GitHub é feita pelo usuário no menu **+ → GitHub → Connect project** no editor Lovable. Não é uma ação que eu execute via código. Após conectar, todo push deste plano é automaticamente espelhado no repositório.

## O que fica fora deste plano

- Email real de convite (por enquanto link manual copiado da UI).
- Recuperação de senha (`/reset-password`) — pode adicionar depois.
- Multi-empresa.
- Import de dados antigos.
