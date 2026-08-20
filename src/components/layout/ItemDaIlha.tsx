import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import type { CSSProperties } from "react";
import type { RotaDoMenu } from "@/components/layout/destinos";

// O item da ilha inferior do celular, uma vez só.
//
// Existiam três versões deste bloco no Sidebar — a do financeiro, a da agenda e
// a de início/pacientes/configurações/atendimentos — e elas tinham divergido em
// tudo que dá para perceber usando: a da agenda não tinha transição nenhuma
// (por isso lá tudo saltava) nem estado ativo, e a do financeiro tinha uma
// transição de `transform` que as outras duas não tinham.

/** Cada item ocupa uma coluna do MESMO tamanho, tenha a barra 2 itens ou 5.
 *
 *  Antes era `flex: 1` puro dentro de um `justify-between`: com cinco itens
 *  cada um ficava com 1/5 da barra, com dois itens e o "+" cada um ficava com
 *  quase metade. Os ícones caíam em posições completamente diferentes de uma
 *  página para outra — que é o que se sente como "não está padronizado".
 *
 *  O teto de 76px é o que segura isso; o `flex` continua para a barra caber em
 *  aparelho estreito, onde cinco colunas de tamanho fixo estourariam. */
export const COLUNA_DA_ILHA: CSSProperties = {
  flex: "1 1 0",
  maxWidth: 76,
  minWidth: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const TRANSICAO = "0.25s ease";

function Conteudo({
  icon: Icone,
  label,
  ativo,
}: {
  icon: LucideIcon;
  label: string;
  ativo: boolean;
}) {
  return (
    <span
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 3,
        paddingTop: 4,
      }}
    >
      <span
        style={{
          width: 30,
          height: 30,
          borderRadius: 9999,
          background: ativo ? "var(--coral-soft)" : "transparent",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: `background ${TRANSICAO}`,
        }}
      >
        <Icone
          style={{
            width: 18,
            height: 18,
            color: ativo ? "var(--coral)" : "var(--muted-foreground)",
            transition: `color ${TRANSICAO}`,
          }}
          strokeWidth={2}
        />
      </span>
      <span
        style={{
          fontFamily: "Inter, sans-serif",
          // Texto miúdo pede tracking POSITIVO para respirar; o negativo que
          // vem do corpo fecha as letras neste tamanho.
          fontSize: "0.625rem",
          fontWeight: 500,
          letterSpacing: "0.01em",
          lineHeight: 1,
          color: ativo ? "var(--coral)" : "var(--muted-foreground)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          maxWidth: "100%",
          transition: `color ${TRANSICAO}`,
        }}
      >
        {label}
      </span>
    </span>
  );
}

const CLASSE_TOQUE =
  "press rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

/** Item que navega. */
export function LinkDaIlha({
  to,
  label,
  icon,
  ativo,
}: {
  to: RotaDoMenu;
  label: string;
  icon: LucideIcon;
  ativo: boolean;
}) {
  return (
    <Link
      to={to}
      aria-label={label}
      aria-current={ativo ? "page" : undefined}
      className={CLASSE_TOQUE}
      style={COLUNA_DA_ILHA}
    >
      <Conteudo icon={icon} label={label} ativo={ativo} />
    </Link>
  );
}

/** Item que executa uma ação da página (abrir gaveta, criar compromisso…).
 *
 *  `onClick` ausente = a página ainda não montou. O botão continua desenhado,
 *  no mesmo lugar e do mesmo tamanho, apenas desabilitado — é isto que faz a
 *  barra durante o carregamento ser idêntica à barra final, em vez de aparecer
 *  com o "+" solto na borda esquerda. */
export function BotaoDaIlha({
  label,
  icon,
  onClick,
  ativo = false,
}: {
  label: string;
  icon: LucideIcon;
  onClick?: () => void;
  ativo?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      aria-label={label}
      className={CLASSE_TOQUE}
      style={{ ...COLUNA_DA_ILHA, opacity: onClick ? 1 : 0.4 }}
    >
      <Conteudo icon={icon} label={label} ativo={ativo} />
    </button>
  );
}
