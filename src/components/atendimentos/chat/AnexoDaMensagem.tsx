import { useState } from "react";
import { FileText, ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MessageAttachment } from "@/lib/atendimentos/atendimentos.functions";

/**
 * Um arquivo dentro da bolha da mensagem.
 *
 * Imagem e vídeo aparecem; áudio toca ali mesmo; o resto vira um cartão que
 * abre o arquivo. O caso de erro NUNCA é sumir: se a URL não carregar (o CRM
 * assina os links, e link assinado vence), fica um aviso clicável dizendo que
 * a imagem não carregou. Sumir em silêncio é como o chat chegou até aqui
 * parecendo que ninguém nunca mandou foto.
 */
export function AnexoDaMensagem({ anexo, claro }: { anexo: MessageAttachment; claro: boolean }) {
  const [falhou, setFalhou] = useState(false);

  if (anexo.tipo === "audio") {
    return <audio controls preload="none" src={anexo.url} className="mt-1 w-56 max-w-full" />;
  }

  if (anexo.tipo === "video" && !falhou) {
    return (
      <video
        controls
        preload="metadata"
        src={anexo.url}
        onError={() => setFalhou(true)}
        className="mt-1 max-h-72 w-full rounded-xl bg-black/5"
      />
    );
  }

  if (anexo.tipo === "image" && !falhou) {
    return (
      <a href={anexo.url} target="_blank" rel="noopener noreferrer" className="mt-1 block">
        <img
          src={anexo.thumbUrl}
          alt="Imagem enviada na conversa"
          loading="lazy"
          onError={() => setFalhou(true)}
          // `max-h` para uma foto em pé não empurrar a conversa inteira para
          // fora da tela; `object-contain` para não recortar o que a pessoa
          // mandou — num print de exame, o recorte pode tirar justamente o
          // que importa.
          className="max-h-72 w-auto max-w-full rounded-xl object-contain"
        />
      </a>
    );
  }

  // O nome do arquivo é o rótulo sempre que existir: numa conversa com três
  // documentos, "Abrir arquivo" três vezes obrigaria a baixar os três para
  // achar o orçamento.
  const rotulo = falhou
    ? `Não foi possível carregar ${anexo.nome ?? "o arquivo"} — abrir`
    : (anexo.nome ?? "Abrir arquivo");
  const Icone = falhou ? ImageOff : FileText;
  return (
    <a
      href={anexo.url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "mt-1 flex max-w-full items-center gap-2 rounded-xl px-3 py-2 text-xs underline-offset-2 hover:underline",
        claro ? "bg-white/15 text-white" : "bg-muted text-foreground",
      )}
    >
      <Icone className="h-4 w-4 shrink-0" />
      {/* Nome longo trunca em vez de esticar a bolha para fora da tela. */}
      <span className="truncate">{rotulo}</span>
    </a>
  );
}
