# Tab bar mobile premium com botão "+" central

## Escopo
Apenas a navegação inferior em `src/components/finance/Sidebar.tsx` (bloco `<nav className="lg:hidden ...">`). O sidebar de desktop permanece intacto.

## Mudanças

### 1. Ajustes de legibilidade (mobile)
- Reduzir altura da ilha de 92px → ~72px e padding interno.
- Reduzir fonte dos labels de 11px → 10px, com `letter-spacing: -0.01em`.
- Reduzir ícones de 24px → 20px e bolha ativa de 40px → 36px.
- Garantir `min-width` por item suficiente para evitar sobreposição "RecebimentosPagamentos" (usar `flex-1` + `text-center` + `truncate` desativado, labels curtos cabem em 10px).

### 2. Botão central "+" (estilo da imagem de referência)
- Inserir um 5º slot no meio da tab bar: botão circular de 56px com `bg-gradient-primary` (mesmo degradê laranja/rosa dos botões `variant="premium"`), ícone `Plus` branco, sombra `shadow-soft`, levemente elevado (`translateY(-14px)`) para "sair" da ilha.
- Mantém os 4 itens de navegação existentes (Financeiro, Recebimentos, Pagamentos, Planejamento) + "Mais", com o "+" entre Pagamentos e Planejamento (ou centralizado entre os 4 — definir como item central do array, totalizando 5 itens de navegação + 1 botão flutuante no meio via layout `grid-cols-5` com o "+" sobreposto absolutamente no centro).

Estrutura final do array visível no mobile:
`Financeiro | Recebimentos | [ + ] | Pagamentos | Planejamento` — e o "Mais" some, OU mantemos os 5 atuais e o "+" fica absolutamente posicionado no centro sobreposto. **Proposta:** manter os 5 atuais (Financeiro, Recebimentos, Pagamentos, Planejamento, Mais) e o botão "+" flutua absolutamente acima do centro da ilha, sem ocupar slot — fiel à imagem de referência onde o "+" se destaca acima dos itens.

### 3. Ação contextual do botão "+"
- Criar contexto leve `MobileFabContext` em `src/components/finance/mobile-fab-context.tsx` com `{ label, onClick }` e hook `useRegisterMobileFab({ label, onClick })`.
- Provider montado em `src/routes/__root.tsx` envolvendo o `<Outlet />`.
- A `Sidebar` consome o contexto: se houver ação registrada, clicar no "+" dispara `onClick`; senão, o botão fica oculto/desabilitado.
- Cada rota registra sua ação via `useRegisterMobileFab` dentro de `useEffect`:
  - `/recebimentos` → abre `NewReceivableSheet` (mesma ação do botão "+ Novo recebimento").
  - `/pagamentos` → abre `NewPaymentSheet`.
  - `/planejamento` → abre o fluxo "+ Novo Cenário".
  - `/` e outras → sem registro, "+" não aparece (ou aparece neutro — definir: **ocultar quando não registrado**).

### 4. Esconder CTAs duplicados no mobile
Nos cabeçalhos de `src/routes/recebimentos.tsx`, `src/routes/pagamentos.tsx` e `src/routes/planejamento.tsx`, envolver o botão "+ Novo ..." com `className="hidden lg:inline-flex"` (ou wrapper `lg:block hidden`) para que apareça só no desktop. Desktop continua com sidebar lateral + botão no header, sem alteração visual.

## Detalhes técnicos

- O FAB usa `position: absolute; top: -18px; left: 50%; transform: translateX(-50%)` dentro da ilha (que precisa de `position: relative`).
- Gradiente: reaproveitar a classe `bg-gradient-primary` já usada no logo da sidebar e no botão Premium.
- A altura reduzida da ilha (72px) + margem extra superior na página (`pb-[110px] lg:pb-0` no main) garante que o "+" elevado não corte conteúdo. Verificar `padding-bottom` global do main em `__root.tsx`.
- Tipagem do contexto: `{ fab: { label: string; onClick: () => void } | null; setFab: (...) => void }`. Hook faz `useEffect(() => { setFab(...); return () => setFab(null) }, [deps])`.

## Arquivos afetados
- `src/components/finance/Sidebar.tsx` — redesign do bloco mobile.
- `src/components/finance/mobile-fab-context.tsx` — **novo**.
- `src/routes/__root.tsx` — montar provider.
- `src/routes/recebimentos.tsx` — registrar FAB + esconder CTA no mobile.
- `src/routes/pagamentos.tsx` — idem.
- `src/routes/planejamento.tsx` — idem.

Desktop não muda em nada.
