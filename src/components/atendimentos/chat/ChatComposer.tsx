import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarClock,
  FileText,
  Image as ImageIcon,
  Mic,
  Plus,
  Send,
  Smile,
  Sparkles,
  StickyNote,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { getMessageTemplates } from "@/lib/atendimentos/campaigns.functions";
import { EmojiPicker } from "./EmojiPicker";
import { AiAssistDialog } from "./AiAssistDialog";

// Recursos ainda sem caminho no CRM ficam visíveis mas desabilitados, com o
// motivo no tooltip — some da tela seria pior: o time não saberia que estão
// previstos. Ligar depois é trocar o handler, a tela já existe.
const SOON = "Em breve — falta o CRM disponibilizar esse recurso.";

export function ChatComposer({
  value,
  onChange,
  onSend,
  isSending,
  isPrivate,
  onPrivateChange,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  isSending: boolean;
  isPrivate: boolean;
  onPrivateChange: (isPrivate: boolean) => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);

  const fetchTemplates = useServerFn(getMessageTemplates);
  const templatesQuery = useQuery({
    queryKey: ["message-templates"],
    queryFn: () => fetchTemplates(),
    enabled: templatesOpen,
    staleTime: 60_000,
  });
  // O prefixo marca templates criados automaticamente pelo fluxo de
  // campanhas ("[Digitado] ..."), que não fazem sentido como resposta rápida.
  const templates = (templatesQuery.data ?? []).filter((t) => !t.name.startsWith("[Digitado]"));

  const insertAtCursor = (text: string) => {
    const el = textareaRef.current;
    if (!el) {
      onChange(value + text);
      return;
    }
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const next = value.slice(0, start) + text + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + text.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const canSend = value.trim().length > 0 && !isSending;

  return (
    <div className={cn("border-t border-border transition-colors", isPrivate ? "bg-warning-soft/40" : "bg-white/70")}>
      {isPrivate && (
        <div className="flex items-center gap-2 px-4 pt-2.5 text-xs text-warning sm:px-6">
          <StickyNote className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">Nota interna — fica registrada na conversa, mas não é enviada ao contato.</span>
          <button
            type="button"
            onClick={() => onPrivateChange(false)}
            className="grid h-6 w-6 shrink-0 place-items-center rounded-lg hover:bg-warning/10"
            aria-label="Sair do modo nota"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <form
        className="flex items-end gap-1.5 px-4 py-3 sm:px-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSend) onSend();
        }}
      >
        {/* Anexos e ações */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon" className="h-10 w-10 shrink-0 text-coral" aria-label="Mais ações">
              <Plus className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top" className="w-56">
            <DropdownMenuItem onClick={() => setTemplatesOpen(true)}>
              <FileText className="mr-2 h-4 w-4" />
              Mensagens Rápidas
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                onPrivateChange(true);
                textareaRef.current?.focus();
              }}
            >
              <StickyNote className="mr-2 h-4 w-4" />
              Notas da Conversa
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled title={SOON}>
              <FileText className="mr-2 h-4 w-4" />
              Documentos
            </DropdownMenuItem>
            <DropdownMenuItem disabled title={SOON}>
              <ImageIcon className="mr-2 h-4 w-4" />
              Fotos e Vídeos
            </DropdownMenuItem>
            <DropdownMenuItem disabled title={SOON}>
              <CalendarClock className="mr-2 h-4 w-4" />
              Agendar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Emojis */}
        <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="icon" className="h-10 w-10 shrink-0 text-coral" aria-label="Emojis">
              <Smile className="h-5 w-5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" side="top" className="w-auto p-3">
            <EmojiPicker
              onSelect={(emoji) => {
                insertAtCursor(emoji);
                setEmojiOpen(false);
              }}
            />
          </PopoverContent>
        </Popover>

        {/* Macros */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon" className="h-10 w-10 shrink-0 text-coral" aria-label="Macros">
              <Zap className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <span className="block text-sm font-medium">Macros</span>
              <span className="block text-xs text-muted-foreground">Executar automações</span>
            </DropdownMenuLabel>
            <div className="grid place-items-center gap-1.5 rounded-xl bg-coral-soft/50 px-3 py-4 text-center">
              <Zap className="h-4 w-4 text-coral" />
              <span className="text-xs text-coral">Nenhuma macro disponível</span>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (canSend) onSend();
            }
          }}
          placeholder={isPrivate ? "Escreva uma nota interna" : "Escreva uma mensagem"}
          rows={1}
          className="max-h-32 min-h-11 flex-1 resize-none rounded-[16px] bg-white"
        />

        {/* IA e áudio */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-10 w-10 shrink-0 text-coral"
          onClick={() => setAiOpen(true)}
          aria-label="Assistência de IA"
        >
          <Sparkles className="h-5 w-5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="hidden h-10 w-10 shrink-0 text-muted-foreground sm:inline-flex"
          disabled
          title={SOON}
          aria-label="Gravar áudio"
        >
          <Mic className="h-5 w-5" />
        </Button>

        <Button
          type="submit"
          size="icon"
          className="h-11 w-11 shrink-0 rounded-[16px] bg-gradient-primary text-white"
          disabled={!canSend}
          aria-label={isPrivate ? "Salvar nota" : "Enviar"}
        >
          <Send className="h-4 w-4" />
        </Button>
      </form>

      {/* Mensagens rápidas */}
      <Popover open={templatesOpen} onOpenChange={setTemplatesOpen}>
        <PopoverTrigger asChild>
          <span className="sr-only" aria-hidden />
        </PopoverTrigger>
        <PopoverContent align="start" side="top" className="w-[340px] p-0">
          <div className="border-b border-border px-3 py-2.5">
            <p className="text-sm font-semibold">Mensagens Rápidas</p>
            <p className="text-xs text-muted-foreground">Toque para inserir no campo de mensagem</p>
          </div>
          <div className="max-h-[260px] overflow-y-auto p-2">
            {templatesQuery.isLoading ? (
              <p className="px-2 py-6 text-center text-xs text-muted-foreground">Carregando…</p>
            ) : templates.length === 0 ? (
              <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                Nenhuma mensagem rápida cadastrada. Crie em Atendimentos → Campanhas.
              </p>
            ) : (
              templates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    insertAtCursor(t.content);
                    setTemplatesOpen(false);
                    toast.success("Mensagem inserida — revise antes de enviar.");
                  }}
                  className="block w-full rounded-xl px-3 py-2 text-left transition-colors hover:bg-muted"
                >
                  <span className="block truncate text-sm font-medium">{t.name}</span>
                  <span className="mt-0.5 block line-clamp-2 text-xs text-muted-foreground">{t.content}</span>
                </button>
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>

      <AiAssistDialog open={aiOpen} onOpenChange={setAiOpen} />
    </div>
  );
}
