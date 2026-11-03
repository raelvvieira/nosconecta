import { Link2, Play } from "lucide-react";
import type { AnuncioDaMensagem } from "@/lib/atendimentos/atendimentos.functions";

/**
 * O anúncio que a pessoa clicou, do jeito que o WhatsApp mostra em cima da
 * primeira mensagem: miniatura, título, texto curto e o link do post.
 */
export function CartaoDoAnuncio({ anuncio }: { anuncio: AnuncioDaMensagem }) {
  return (
    <a
      href={anuncio.url ?? undefined}
      target="_blank"
      rel="noreferrer"
      className="mb-1 block overflow-hidden rounded-xl border border-border/70 bg-surface-subtle/60 transition hover:bg-surface-subtle"
    >
      {anuncio.miniatura && (
        <div className="relative">
          <img
            src={anuncio.miniatura}
            alt={anuncio.titulo ?? "Anúncio"}
            className="max-h-48 w-full object-cover"
          />
          {anuncio.video && (
            <span className="absolute inset-0 grid place-items-center">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-black/45 text-white">
                <Play className="h-5 w-5 fill-current" />
              </span>
            </span>
          )}
        </div>
      )}
      <div className="px-3 py-2">
        <span className="text-3xs font-semibold uppercase tracking-wide text-muted-foreground">
          Veio do anúncio
        </span>
        {anuncio.titulo && <p className="text-[13px] font-semibold leading-5">{anuncio.titulo}</p>}
        {anuncio.texto && (
          <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">{anuncio.texto}</p>
        )}
        {anuncio.url && (
          <span className="mt-1 flex items-center gap-1 text-2xs text-muted-foreground">
            <Link2 className="h-3 w-3" />
            {anuncio.url.replace(/^https?:\/\/(www\.)?/, "").split("/")[0]}
          </span>
        )}
      </div>
    </a>
  );
}
