import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * A foto de perfil do contato, com as iniciais por baixo.
 *
 * As iniciais NÃO são um "estado de erro": elas ficam desenhadas embaixo da
 * foto o tempo todo. Isso resolve três casos com um desenho só — o CRM não
 * mandou foto, a foto ainda está carregando, e a URL venceu (foto de perfil do
 * WhatsApp expira). Em nenhum deles aparece um quadrado vazio, e é por isso que
 * ligar isto não tem como piorar a tela em relação a hoje.
 */
export function iniciaisDoNome(nome: string): string {
  return nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0])
    .join("")
    .toUpperCase();
}

interface Props {
  nome: string;
  /** URL da foto, quando o CRM informa. */
  url?: string | null;
  /** Tamanho, cantos e cores das iniciais — o quadrado é do chamador. */
  className?: string;
}

export function FotoDoContato({ nome, url, className }: Props) {
  const [falhou, setFalhou] = useState(false);

  // Sem isto, uma linha reaproveitada para outro contato herdaria o "falhou" do
  // anterior e nunca tentaria carregar a foto nova.
  useEffect(() => setFalhou(false), [url]);

  return (
    <span
      className={cn(
        "relative grid shrink-0 place-items-center overflow-hidden rounded-2xl text-sm font-bold",
        className,
      )}
    >
      {iniciaisDoNome(nome)}
      {url && !falhou && (
        <img
          src={url}
          // Vazio de propósito: o nome do contato já está escrito ao lado, e um
          // alt repetindo faria o leitor de tela dizer duas vezes.
          alt=""
          loading="lazy"
          onError={() => setFalhou(true)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
    </span>
  );
}
