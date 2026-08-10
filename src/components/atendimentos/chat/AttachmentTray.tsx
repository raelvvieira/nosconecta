import { FileText, Image as ImageIcon, Mic, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PendingAttachment {
  id: string;
  name: string;
  type: string;
  size: number;
  /** Base64 puro (sem prefixo data:). */
  data: string;
  isRecordedAudio?: boolean;
  /** Object URL só pra miniatura de imagem — liberado ao remover. */
  previewUrl?: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AttachmentTray({
  items,
  onRemove,
}: {
  items: PendingAttachment[];
  onRemove: (id: string) => void;
}) {
  if (items.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 px-4 pt-3 sm:px-6">
      {items.map((item) => {
        const isImage = item.type.startsWith("image/");
        const isAudio = item.type.startsWith("audio/");
        return (
          <div
            key={item.id}
            className={cn(
              "flex items-center gap-2 rounded-2xl border border-border bg-white p-1.5 pr-2 shadow-soft",
              isImage && "pr-2.5",
            )}
          >
            {isImage && item.previewUrl ? (
              <img src={item.previewUrl} alt={item.name} className="h-10 w-10 rounded-xl object-cover" />
            ) : (
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-coral-soft text-coral">
                {isAudio ? <Mic className="h-4 w-4" /> : isImage ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
              </span>
            )}
            <span className="min-w-0 max-w-[160px]">
              <span className="block truncate text-xs font-medium">
                {item.isRecordedAudio ? "Áudio gravado" : item.name}
              </span>
              <span className="block text-3xs text-muted-foreground">{formatSize(item.size)}</span>
            </span>
            <button
              type="button"
              onClick={() => onRemove(item.id)}
              className="grid h-6 w-6 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={`Remover ${item.name}`}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
