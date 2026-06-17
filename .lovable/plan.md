## Redesign Visual — Linguagem "Fintech Premium"

Aplicar a linguagem visual da referência (Apple Wallet / Revolut / Arc) sem alterar funcionalidades, fluxos ou arquitetura. Foco inicial: tokens globais + Sidebar + página Pagamentos. As demais páginas (Visão Geral, Recebimentos, Planejamento) consumirão automaticamente os novos tokens; ajustes finos delas ficam para passes seguintes.

### 1. Tokens globais (`src/styles.css`)

Reescrever a paleta para o novo sistema:

- `--background`: `#F6F6F7` (nunca branco puro)
- `--card`: `#FFFFFF`
- `--card-dark`: `#1B1B1F` (novo token — usado apenas em blocos "premium": saldo, metas, planejamento — máx. 5% da UI)
- `--border`: `#F0F0F2`
- `--input-border`: `#ECECEC`
- `--primary`: coral `#FF7A59`
- `--primary-foreground`: branco
- `--accent-pink`: `#F55F95`
- `--accent-peach`: `#FFB086`
- `--accent-cream`: `#FFF2EC`
- `--ring`: coral
- Sombras: `--shadow-sm: 0 4px 20px rgba(0,0,0,.03)`, `--shadow-md: 0 10px 30px rgba(0,0,0,.04)` (nada mais forte)
- Radius: cards `24px`, inputs/botões `14px`, modais `28px` → reconfigurar `--radius` base + utilitários
- Utilitário `--gradient-primary: linear-gradient(135deg,#F55F95 0%,#FF7A59 50%,#FFB086 100%)` — usar somente em CTA principal, banner e upgrade
- Reescala de chart colors para tons da nova paleta (coral, rosa, pêssego, creme + neutros suaves) sem grades fortes
- Tokens semânticos (`success`, `danger`, `warning`) em versões mais "soft" para badges

### 2. Sidebar (`src/components/finance/Sidebar.tsx`)

- Largura `88px` (colapsada por padrão, sem texto ao lado dos ícones)
- Fundo `#FFFFFF`, sem borda direita pesada
- Itens: ícone `18px`, área clicável `48x48`, radius `16px`, gap generoso (~12-16px)
- Item ativo: fundo `#1B1B1F`, ícone branco
- Hover: fundo `#FAFAFA`
- Logo no topo reduzido para quadrado 48px
- Card "Plano Premium" no rodapé: reduzir a um botão circular com gradiente (tooltip "Upgrade") OU mover para um avatar discreto
- Avatar do usuário no rodapé: círculo 40px com iniciais, sem texto
- Labels só aparecem em tooltip on-hover

### 3. Header das páginas (`PageHeader.tsx`)

- Altura `80px`, fundo `transparent`
- Título grande (32-38px, weight 700), subtítulo leve
- Botões à direita: primário com gradiente coral→rosa, secundários em branco com borda `#ECECEC`

### 4. Página Pagamentos (`src/routes/pagamentos.tsx`)

Manter toda a lógica e estrutura de dados. Apenas reorganizar visualmente:

**KPIs em mosaico (não 4 cards iguais):**
- Card grande (col-span-2): "Pago no período" com valor 38px + micrográfico/indicador
- Cards médios: "A pagar" e "Em atraso"
- Card escuro pequeno (`#1B1B1F`, texto branco): "Total previsto" — único bloco grafite na página, gera contraste premium

**Filtros:**
- Inputs com `bg-white`, `border #ECECEC`, radius `14px`, altura `44px`
- Focus: borda coral
- Botão "Filtros" secundário branco; remover o destaque rosa atual

**Tabela:**
- Eliminar sensação de tabela: sem header colorido, divisores `#F5F5F5`, row-height `72px`
- Hover row `#FAFAFA`
- Badges de categoria/status em versões soft (ex.: bg `#FFF2EC`, texto coral); status "Pago" em verde soft
- Avatar/ícone do fornecedor à esquerda em círculo cinza claro

**Lateral direita:**
- "Gastos por Categoria": donut sem contorno, legenda com dots coloridos suaves
- "Próximos vencimentos": lista com row-height generoso, sem divisores fortes
- Botão "Ver todos" como secundário (não outline rosa)

**Card "Novo Pagamento":** botão com gradiente oficial (único uso de gradiente na página).

### 5. Componentes shadcn afetados (estilos via tokens)

`button.tsx`, `card.tsx`, `input.tsx`, `select.tsx`, `badge.tsx`, `table.tsx` — atualizar variantes default para refletir radius 14/24, sombras suaves, bordas `#F0F0F2`. Adicionar variante `premium` no Button (gradiente).

### 6. Escopo desta entrega

Incluído:
- Tokens em `styles.css`
- Sidebar redesenhada
- PageHeader
- Variantes de Button/Card/Input/Badge/Table
- Página Pagamentos totalmente recomposta no novo visual

Fora deste passe (entregas seguintes, mesma linguagem):
- Visão Geral, Recebimentos, Planejamento — herdam os tokens automaticamente, mas o "mosaico" de KPIs e os blocos escuros premium serão refinados em passes dedicados para evitar uma única entrega gigante.

### Detalhes técnicos

- `src/styles.css`: substituir bloco `:root` (e `.dark`) por paleta nova em hex/oklch; adicionar `--card-dark`, `--gradient-primary`, `--shadow-sm/md`; trocar `--font-sans` para um par premium (ex.: `"Geist", "Inter"` via `<link>` no `__root.tsx`)
- Garantir Tailwind v4: nenhum hex hardcoded em componentes — tudo via classes utilitárias (`bg-card`, `bg-primary`, `text-primary`, `border-border`, `shadow-sm`, `rounded-2xl`)
- Para o bloco escuro, criar utilitário `.card-dark` (`@utility`) com fundo `#1B1B1F`, texto branco, radius 24px
- Para o gradiente: utilitário `.bg-gradient-primary`
- Sem mudanças em rotas, loaders, server functions ou schema
