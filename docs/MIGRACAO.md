# Migração para fora do Lovable

Roteiro para levar o NÓS Conecta do Lovable para contas próprias:
**Supabase** (banco, logins, arquivos, rotinas) e **Cloudflare** (o site). A
Evolution continua na VPS da Hostinger.

**Regra de ouro:** o Lovable funciona até o último minuto e fica parado,
inteiro, por 15 dias depois da virada. Nenhuma etapa apaga dado de lá.

Ferramentas em `scripts/migracao/`. Todas recusam escrever no projeto do
Lovable (`ddfteoeehsticjhojpka`) e leem as chaves do ambiente — nenhuma chave
passa pelo chat, pelo terminal ou pelo repositório.

---

## Inventário (levantado em 26/10/2026)

| Item                          | Quantidade                                                               | Observação                                                                                                                |
| ----------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Tabelas em `public`           | 82                                                                       | maiores: wa_messages (14,8 mil), ai_agent_messages (9,1 mil), wa_contacts (5,8 mil), patients (3,3 mil)                   |
| Logins (`auth.users`)         | equipe + pacientes do Club                                               | copiados com a senha já embaralhada: ninguém troca de senha                                                               |
| Depósitos de arquivos         | 3, privados                                                              | crm-campaign-media, wa-midia, patient-files — 1.162 arquivos, ~1 GB. **Criados à mão no Lovable**, não estão em migration |
| Migrations                    | 175                                                                      | ~16 com o endereço do Lovable escrito dentro (tarefas automáticas)                                                        |
| Edge Functions                | 18 (+2 da migração)                                                      | wa-webhook e whatsapp-inbound-webhook sem JWT, fechadas por segredo                                                       |
| Tarefas automáticas (pg_cron) | 7                                                                        | ver tabela abaixo; duas (agente-followup, olho-de-deus) foram agendadas à mão, fora de migration                          |
| Extensões                     | pg_cron, pg_net, pgcrypto, uuid-ossp, supabase_vault, pg_stat_statements |                                                                                                                           |

### Tarefas automáticas

| Tarefa                       | Quando         | Chama                                         |
| ---------------------------- | -------------- | --------------------------------------------- |
| agente-followup              | 43 \* \* \* \* | agente-followup                               |
| agente-licoes                | 17 \* \* \* \* | agente-licoes                                 |
| ai-playbook-diario           | 0 7 \* \* \*   | ai-playbook (uma por agente, `action: ciclo`) |
| atendimento-automations-tick | \* \* \* \* \* | atendimento-automations (`action: tick`)      |
| automation-scheduled-daily   | 0 11 \* \* \*  | automation-scheduled                          |
| olho-de-deus-semanal         | 38 11 \* \* 1  | olho-de-deus                                  |
| whatsapp-broadcast-tick      | \* \* \* \* \* | whatsapp-broadcast (`action: tick`)           |

### Chaves

**Funções (Supabase → Edge Functions → Secrets)** — a pessoa copia dos painéis de origem:

| Chave                                                                                                                                                                                                                            | De onde vem                                                          |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| BREVO_API_KEY, BREVO_SENDER_EMAIL, BREVO_SENDER_NAME, BREVO_SMS_SENDER, BREVO_WHATSAPP_SENDER_NUMBER, BREVO_WHATSAPP_TEMPLATE_CONFIRMATION, BREVO_WHATSAPP_TEMPLATE_REMINDER_DAY_BEFORE, BREVO_WHATSAPP_TEMPLATE_REMINDER_DAY_OF | painel da Brevo                                                      |
| EVOLUTION_API_URL, EVOLUTION_API_KEY                                                                                                                                                                                             | `.env` da Evolution na VPS                                           |
| WA_WEBHOOK_SECRET                                                                                                                                                                                                                | o **mesmo** do `WEBHOOK_URL` no `.env` da VPS (depois de `?secret=`) |
| WHATSAPP_WEBHOOK_SECRET                                                                                                                                                                                                          | painel da Brevo Conversations (webhook) — ou um novo, trocado lá     |
| OPENAI_API_KEY                                                                                                                                                                                                                   | opcional; cada agente pode ter a própria chave na tela               |
| VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT                                                                                                                                                                               | **gerados novos** por `instalar-funcoes.mjs`                         |
| SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_DB_URL                                                                                                                                                                         | o Supabase já põe sozinho                                            |

**Site (Cloudflare Worker)** — `publicar-site.mjs` grava sozinho:
SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY (segredo),
VAPID_PUBLIC_KEY.

### Endereços externos que apontam para o Lovable

| Onde                                     | O que trocar na virada                                                        |
| ---------------------------------------- | ----------------------------------------------------------------------------- |
| VPS, `.env` da Evolution, `WEBHOOK_URL`  | só o `ddfteoeehsticjhojpka` pelo ref novo; reiniciar o container              |
| Domínio `login.nosodontoesaude.com.br`   | passa a apontar para o Worker `nos-conecta` (Cloudflare → Workers → Domínios) |
| Brevo Conversations (webhook de entrada) | `…/functions/v1/whatsapp-inbound-webhook?secret=…` com o ref novo             |
| Meta (Conversions API)                   | nada: o sistema é quem chama a Meta                                           |

---

## Publicação automática (GitHub Actions)

`.github/workflows/publicar.yml`: a cada push no main, checa tipos e Edge
Functions, publica o site na Cloudflare e, se o commit mexeu em
`supabase/functions/`, atualiza as rotinas no Supabase novo. Estrutura do
banco fica de fora (aplicada à mão). Também roda pelo botão "Run workflow".

Cadastro no GitHub (Settings → Secrets and variables → Actions):

- **Secrets:** `SUPABASE_ACCESS_TOKEN`, `CLOUDFLARE_API_TOKEN`
- `NOVO_PROJETO_REF` e `NOVO_VAPID_PUBLIC_KEY` já vêm escritos no workflow
  (não são segredo); uma variable do GitHub com o mesmo nome os substitui.

## Ambiente do Claude (variáveis secretas)

| Variável              | Para quê                                                      |
| --------------------- | ------------------------------------------------------------- |
| SUPABASE_ACCESS_TOKEN | montar e mexer no projeto novo (SQL, funções, segredos)       |
| CLOUDFLARE_API_TOKEN  | publicar o site (modelo "Edit Cloudflare Workers")            |
| NOVO_PROJETO_REF      | o id do projeto novo (aparece na URL do painel)               |
| MIGRACAO_TOKEN        | só na cópia de arquivos; o mesmo valor nos Secrets do Lovable |

---

## Roteiro

### Fase 3 — montar a casa nova (vazia)

```bash
node scripts/migracao/preparar-recepcao.mjs   # abre a recepção no projeto novo
npx supabase functions deploy migracao-receber --project-ref $NOVO_PROJETO_REF --use-api
node scripts/migracao/sql-de-envio.mjs /tmp/planta.sql --estrutura
#   → rodar /tmp/planta.sql NO LOVABLE (só lê a estrutura; nenhum dado)
node scripts/migracao/montar-banco.mjs        # aplica a planta + 3 depósitos
node scripts/migracao/aplicar-rotinas.mjs     # 7 tarefas, TODAS DESLIGADAS
node scripts/migracao/instalar-funcoes.mjs    # funções + push novo; lista as chaves que faltam
```

**Por que planta e não as migrations:** só 81 das 175 migrations estão no
histórico do Lovable — as demais entraram por cópias, à mão ou fora de ordem,
e reaplicá-las num banco vazio quebra na 10ª. `estrutura.sql` lê dos
catálogos o que existe lá hoje.

**Feito em 27/10/2026** no projeto `cuqbpelstbgihhxmcrfn` (São Paulo):
1.203 comandos sem falha; contagens iguais ao Lovable (78 tabelas, 4 views,
38 funções, 200 índices, 95 regras, 30 gatilhos, mesmas extensões); 3
depósitos; 7 tarefas desligadas; 19 funções; VAPID novo.

Depois, no painel do Supabase novo (a pessoa):

- **Edge Functions → Secrets:** as chaves da tabela acima.
- **Authentication → URL Configuration:** Site URL
  `https://login.nosodontoesaude.com.br`; Redirect URLs
  `https://login.nosodontoesaude.com.br/**` e o endereço `workers.dev` do ensaio.
- **Authentication → Emails → SMTP:** a Brevo (mesmo remetente de hoje).
- **Authentication → Providers → Email:** confirmação igual à do Lovable.

### Fase 4 — ensaio

**Feito em 27/10/2026:** dados e logins copiados (57 tabelas com dados, 3
logins com senha), site em `https://nos-conecta.nos-conecta.workers.dev`,
login conversando só com o projeto novo. Arquivos (fotos/documentos) ainda
não.

**Lição da cópia:** o pg_net dispara tudo em paralelo. Lotes de 300 linhas
(até 2,4 MB) derrubaram conexões ("Stream error in the HTTP/2 framing
layer", "remaining connection slots"). Funcionou com **lotes de 100 e no
máximo ~30 pedidos por vez** (`DE`/`ATE` em `sql-de-envio.mjs`), e repetindo
só o que faltava — comparar contagem por dia (`created_at::date`) mostra
onde. Repetir não duplica (`ON CONFLICT DO NOTHING`).

1. `node scripts/migracao/preparar-recepcao.mjs`
2. `node scripts/migracao/sql-de-envio.mjs /tmp/envio.sql` e rodar o SQL **no
   Lovable** (com autorização: manda dado de paciente para fora). Tabelas
   grandes podem ir sozinhas: `sql-de-envio.mjs /tmp/x.sql public.wa_messages`.
3. No Lovable, depois de uns minutos:
   `select status_code, count(*) from net._http_response where created > now() - interval '1 hour' group by 1`
   — tudo 200.
4. Acertar as sequências: POST em `migracao-receber` com `{"acao":"sequencias"}`.
5. Arquivos: publicar `migracao-exportar` no Lovable (com autorização:
   "Deploy the migracao-exportar edge function") e
   `node scripts/migracao/copiar-arquivos.mjs`. Sem segredo para cadastrar: a
   função guarda só a impressão digital (SHA-256) da chave, que fica em
   `scripts/migracao/.exportacao` (fora do git). Sessão nova sem o arquivo:
   gerar outra chave, trocar a impressão no código e publicar de novo.
6. `node scripts/migracao/conferir.mjs --sql` → rodar no Lovable → salvar o
   JSON → `node scripts/migracao/conferir.mjs origem.json`. "Nada faltando".
7. `node scripts/migracao/publicar-site.mjs` e a pessoa testa em
   `nos-conecta.<conta>.workers.dev`.

**No ensaio o WhatsApp continua só no Lovable e as tarefas ficam desligadas.**
Nada sai para paciente.

Lista do ensaio:

- [ ] entrar no sistema (você, Mariane) e no NÓS Club (um paciente)
- [ ] agenda, pacientes, ficha e anamnese, fotos e arquivos abrindo
- [ ] financeiro: visão geral, recebimentos, pagamentos, planejamento
- [ ] conversas antigas e mídias
- [ ] configurações, temas, Club (créditos e indicações)
- [ ] criar e apagar um agendamento de teste

### Fase 5 — a virada (roteiro testado em 27/10)

Todos os comandos com `NOVO_PROJETO_REF` no ambiente. O "SQL no Lovable" roda
pelo MCP do Lovable (`query_database`).

1. **Congelar o Lovable** (SQL no Lovable): `update cron.job set active = false;`
   Anotar a hora `T` (ex.: `2026-10-27T21:00:00-03:00`).
2. `node scripts/migracao/limpar-dados.mjs --sim` — banco novo sem dados.
3. **Cópia final**: `DE=0 ATE=30 node scripts/migracao/sql-de-envio.mjs /tmp/onda.sql`
   → rodar no Lovable; repetir com `DE=30 ATE=60`, … até cobrir todos os
   lotes (lotes de 100; ~30 por onda; esperar a fila do pg_net esvaziar entre
   ondas). Conferir com `conferir.mjs`; o que faltar, reenviar por dia
   (`created_at::date`) — repetir não duplica.
4. `node scripts/migracao/copiar-arquivos.mjs` (regrava tudo, ~10 min).
5. **WhatsApp — a pessoa, na VPS**: hPanel → VPS → Gerenciador Docker →
   Evolution → Ambiente → `WEBHOOK_URL`: trocar só `ddfteoeehsticjhojpka`
   por `cuqbpelstbgihhxmcrfn` → salvar → reiniciar o contêiner.
6. **Acerto final**: `DESDE=<T menos 10 min> node scripts/migracao/sql-de-envio.mjs /tmp/acerto.sql`
   → rodar no Lovable. Pega o que chegou ou mudou lá desde o congelamento
   (atualiza quem já existe; conversas e contatos vão inteiros).
7. `node scripts/migracao/ligar-rotinas.mjs ligar`
8. `node scripts/migracao/trocar-dominio.mjs novo` — `login` e `club` passam a
   abrir o Worker (testado com um endereço de teste: 10 s até responder).
9. Teste real: mensagem do celular da pessoa para o WhatsApp da clínica →
   aparece em Conversas → a Luna responde. Entrar por `login.nosodontoesaude.com.br`.
10. `node scripts/migracao/fechar-recepcao.mjs`.

### Como voltar (até 15 dias depois)

1. `node scripts/migracao/trocar-dominio.mjs lovable`; `WEBHOOK_URL` da VPS de volta.
2. `node scripts/migracao/ligar-rotinas.mjs desligar` no novo.
3. No Lovable: `update cron.job set active = true;`
4. O que foi criado no meio-tempo fica no novo e é trazido de volta à parte.

### Fase 6 — depois de 15 dias tranquilos

- Apagar `migracao-exportar` (Lovable) e `migracao-receber` (novo), e o
  `MIGRACAO_TOKEN` dos dois lados.
- Trocar o que ainda fala em Lovable: `CLAUDE.md` (deploy por
  `publicar-site.mjs`, funções por `supabase functions deploy`, migrations
  pelo CLI), mensagens "No Lovable, mande…" (`NosClub.tsx`,
  `CampoDeImagem.tsx`, `src/lib/club/club.functions.ts`), a imagem de prévia
  em `src/routes/__root.tsx` (é um print hospedado pelo Lovable).
- Cancelar o Lovable.

---

## Por que cada decisão

- **SQL pela API, não pela senha do banco:** a chave da conta basta, e a porta
  5432 nem sempre está aberta onde os scripts rodam.
- **Dados por `pg_net`:** o Lovable não dá cópia nem senha do banco. Um SQL
  rodado lá monta lotes e POSTa para `migracao-receber` no novo — de banco
  para banco, sem passar pelo chat.
- **`session_replication_role = replica` na gravação:** os lotes chegam em
  paralelo e fora de ordem, e copiar `auth.users` não pode disparar os
  gatilhos de conta nova (criariam perfil e crédito de boas-vindas de novo).
- **Arquivos por links que expiram:** baixar do armazenamento exige a chave de
  serviço, que só existe dentro do Lovable. `migracao-exportar` usa a chave lá
  dentro e entrega links de 10 minutos.
- **Endereço morto nas migrations antigas:** rodadas como estão, as tarefas
  antigas fariam o banco novo chamar as funções do Lovable a cada minuto.
- **Push com chaves novas:** a chave privada do Lovable não pode ser lida.
- **Mesmo `WA_WEBHOOK_SECRET`:** na virada, só o endereço muda na VPS.
