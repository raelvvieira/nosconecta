import { CheckCheck, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { renderMessagePreview } from "./VariableChips";

export function PhonePreview({ content, mediaUrl }: { content: string; mediaUrl: string | null }) {
  const preview = renderMessagePreview(content);

  return (
    <div className="mx-auto w-full max-w-[220px]">
      <p className="mb-2 text-center text-3xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        Preview
      </p>
      <div className="overflow-hidden rounded-4xl border-[6px] border-foreground bg-[#ECE5DD] shadow-soft">
        <div className="flex items-center gap-2 bg-gradient-primary px-3 py-2.5">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/20 text-white">
            <MessageCircle className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-2xs font-semibold text-white">Contato</p>
            <p className="text-3xs text-white/70">online</p>
          </div>
        </div>
        <div className="flex min-h-[220px] flex-col justify-end p-2.5">
          {content.trim() || mediaUrl ? (
            <div className={cn("max-w-[85%] self-end rounded-2xl bg-gradient-primary px-2.5 py-2 text-white shadow-soft")}>
              {mediaUrl && <img src={mediaUrl} alt="" className="mb-1.5 w-full rounded-lg object-cover" />}
              {content.trim() && <p className="whitespace-pre-wrap break-words text-2xs leading-4">{preview}</p>}
              <span className="mt-1 flex items-center justify-end gap-1 text-3xs text-white/70">
                {new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                <CheckCheck className="h-2.5 w-2.5" />
              </span>
            </div>
          ) : (
            <p className="text-center text-2xs text-muted-foreground">A mensagem aparecerá aqui</p>
          )}
        </div>
        <div className="border-t border-black/5 bg-white px-2.5 py-2">
          <div className="rounded-full bg-muted px-3 py-1.5 text-3xs text-muted-foreground">Mensagem</div>
        </div>
      </div>
    </div>
  );
}
