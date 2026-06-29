## Problema

1. **Configurações não persistem**: `settings.functions.ts` grava em tabelas `clinic_chairs`, `clinic_procedures`, `clinic_members` que **não existem** no banco. Usa cliente anônimo + `company_id = "demo"` (não passa por RLS do usuário logado). Resultado: criar/excluir falha silenciosamente ou volta o DEMO.
2. **Pacientes**: mesma estrutura — `company_id = "demo"`, sem auth, com fallback hard-coded de pacientes fictícios (João, Maria, Pedro) e tabelas auxiliares (`patient_treatments`) inexistentes.
3. **Tabelas existentes** (`patients`, `professionals`) só têm 4–5 colunas (`id, company_id, name, …`) — faltam todos os campos que os formulários enviam (email, telefone, especialidade, etc.).
4. **Saudação fixa "Dr. Guilherme"** no `MobileHome.tsx` (string literal), e o avatar mostra "G". Precisa ler o usuário logado.

## Solução

### 1. Migração de banco
- Adicionar colunas faltantes em `patients` (email, phone, birthdate, document, notes, status, owner_id) e `professionals` (specialty, registration_number, phone, email, color, active, owner_id).
- Criar tabelas novas: `clinic_chairs`, `clinic_procedures`, `clinic_members` com os campos usados pelos forms + `owner_id uuid references auth.users`.
- Em todas: `GRANT` para `authenticated`/`service_role`, `ENABLE RLS`, e policy `using (auth.uid() = owner_id) with check (auth.uid() = owner_id)`.
- Remover dependência de `company_id` (manter coluna por compatibilidade, mas sem filtrar por ela — filtrar por `owner_id`).
- Trigger `set_updated_at` onde aplicável.

### 2. Server functions seguras
- Reescrever `settings.functions.ts` e `patients.functions.ts` para:
  - Usar `.middleware([requireSupabaseAuth])` (cliente com RLS do usuário).
  - Remover constantes `DEMO`, `DEMO_PATIENTS`, `DEMO_IDS` e fallbacks fictícios.
  - Filtrar/gravar por `owner_id = context.userId`.
  - Remover parâmetro `companyId`.
- Ajustar chamadas nos componentes para não passar `companyId`.

### 3. Saudação dinâmica no mobile
- No `MobileHome.tsx`, ler o usuário com `supabase.auth.getUser()` + `profiles.full_name` (já existe trigger `handle_new_user` populando).
- Compor saudação: "Bom dia/Boa tarde/Boa noite, {primeiro nome}" baseado em `new Date().getHours()`.
- Avatar exibe a inicial real do nome.

### 4. Verificação
- `bunx tsc --noEmit && bun run build`.
- Testar manualmente criar/excluir um profissional, cadeira, procedimento e paciente — verificar que persistem após reload.

## Detalhes técnicos

- Toda nova tabela em `public` segue a ordem obrigatória: CREATE TABLE → GRANT → ENABLE RLS → CREATE POLICY.
- `members` continua armazenando convites/permissões locais; convite real de usuários novos (envio de e-mail) **fica de fora desta tarefa** — apenas o CRUD da listagem.
- `MobileHome` continua client-only (sem SSR fetch); o nome carrega via `useEffect` para evitar flash incorreto.
