## Sidebar com dois estados: minimizada e expandida

Adicionar suporte a duas versões da sidebar lateral, mantendo todo o design premium atual (cores, gradiente, item ativo preto, etc).

### Estados

1. **Minimizada (padrão atual)** — `88px` de largura, apenas ícones centralizados, tooltip "Planejamento" estilo coral ao passar o mouse.
2. **Expandida** — `240px` de largura, ícone + nome do menu por extenso à direita, item ativo vira uma "pill" preta de largura total com texto branco, mesmo padrão visual da tooltip atual (mas inline).

### Toggle

- Botão discreto no topo da sidebar (ou no rodapé, acima do avatar) com ícone `PanelLeftClose` / `PanelLeftOpen` (lucide).
- Estado persistido em `localStorage` (`sidebar-collapsed`) para lembrar a preferência entre sessões.
- Transição suave (`transition-all duration-200`) na largura.

### Mudanças técnicas

- `src/components/finance/Sidebar.tsx`:
  - Adicionar `useState` + `useEffect` lendo/gravando `localStorage`.
  - Largura dinâmica: `collapsed ? "w-[88px]" : "w-[240px]"`.
  - Cada item do menu renderiza label ao lado do ícone quando expandido; tooltip só aparece quando colapsado.
  - Item ativo: quando colapsado mantém o quadrado preto 48x48; quando expandido vira pill preta `h-12 w-full rounded-2xl` com ícone + texto.
  - Logo, "Plano Premium" e avatar se ajustam (label visível ao lado quando expandido).
- Garantir que o layout do conteúdo principal não precise de mudanças — a sidebar é `flex` item, o resto se ajusta sozinho.

### Fora do escopo

- Sem mudanças em outras páginas, tokens globais, ou comportamento de navegação.
- Sem versão mobile/drawer nesta rodada (sidebar continua sempre visível em desktop).
