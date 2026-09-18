import { useLayoutEffect, useRef, useState } from "react";

/** O realce do item ativo da ilha inferior.
 *
 *  Era um `background` pintado dentro de cada item: ao trocar de aba, um
 *  círculo apagava aqui e outro acendia ali. Dois eventos sem relação nenhuma
 *  entre si — e o que o olho entende de uma troca de aba é UMA coisa que se
 *  moveu, não duas que piscaram.
 *
 *  Agora é um círculo só, do lado de fora dos itens, que anda até a coluna
 *  ativa. Mola criticamente amortecida: a troca de aba não vem de um gesto com
 *  inércia, então passar do alvo e voltar seria movimento que ninguém pediu.
 *
 *  Ele NÃO viaja quando a barra inteira troca de conteúdo (sair do Financeiro
 *  para a Agenda, por exemplo): ali as colunas não são as mesmas, e deslizar
 *  entre elas seria uma continuidade que não existe. Nesse caso ele só aparece
 *  no lugar novo. */
type Posicao = { x: number; y: number; d: number; animar: boolean };

export function PilulaDaIlha({ chave, variante }: { chave: string; variante: string }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [pos, setPos] = useState<Posicao | null>(null);
  const anterior = useRef({ variante, tinha: false });

  useLayoutEffect(() => {
    const nav = ref.current?.parentElement;
    if (!nav) return;

    const medir = (podeAnimar: boolean) => {
      const alvo = nav.querySelector<HTMLElement>('[data-pilula="ativo"]');
      if (!alvo) {
        anterior.current = { variante, tinha: false };
        setPos(null);
        return;
      }
      const a = alvo.getBoundingClientRect();
      const n = nav.getBoundingClientRect();
      const mesmaBarra = anterior.current.variante === variante;
      anterior.current = { variante, tinha: true };
      setPos({
        x: Math.round(a.left - n.left),
        y: Math.round(a.top - n.top),
        d: Math.round(a.width),
        // Sem transição na primeira medição nem ao trocar de barra: nos dois
        // casos não há "de onde" sair, e animar a partir do zero jogaria o
        // círculo da borda esquerda até a coluna.
        animar: podeAnimar && mesmaBarra && anterior.current.tinha,
      });
    };

    medir(true);
    const aoRedimensionar = () => medir(false);
    window.addEventListener("resize", aoRedimensionar);
    return () => window.removeEventListener("resize", aoRedimensionar);
    // `chave` é o caminho da rota: é ele que diz que o item ativo mudou.
  }, [chave, variante]);

  return (
    <span
      ref={ref}
      aria-hidden="true"
      className="pilula-da-ilha"
      data-animar={pos?.animar ? "sim" : undefined}
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        zIndex: 0,
        width: pos?.d ?? 30,
        height: pos?.d ?? 30,
        borderRadius: 9999,
        background: "var(--coral-soft)",
        transform: `translate3d(${pos?.x ?? 0}px, ${pos?.y ?? 0}px, 0)`,
        opacity: pos ? 1 : 0,
        pointerEvents: "none",
      }}
    />
  );
}
