import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarClock,
  CalendarPlus,
  FileText,
  Image as ImageIcon,
  Mic,
  Plus,
  Send,
  Smile,
  Sparkles,
  Square,
  StickyNote,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
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
import { fileToPendingAttachment } from "@/lib/atendimentos/attachments";
import { EmojiPicker } from "./EmojiPicker";
import { AiAssistDialog } from "./AiAssistDialog";
import { AttachmentTray, type PendingAttachment } from "./AttachmentTray";
import { ScheduleMessageDialog } from "./ScheduleMessageDialog";

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
  attachments,
  onAttachmentsChange,
  conversationId,
  contactId,
  onScheduleAppointment,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  isSending: boolean;
  isPrivate: boolean;
  onPrivateChange: (isPrivate: boolean) => void;
  attachments: PendingAttachment[];
  onAttachmentsChange: (next: PendingAttachment[]) => void;
  conversationId: string;
  contactId: string | null;
  /** Abre o formulário de agendamento da Agenda (mesmo formulário, mesma
   *  gravação) com o contato desta conversa já preenchido. */
  onScheduleAppointment: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [mobileEmojiOpen, setMobileEmojiOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

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

  const addFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const accepted: PendingAttachment[] = [];
    for (const file of Array.from(files)) {
      try {
        accepted.push(await fileToPendingAttachment(file));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Não foi possível anexar o arquivo.");
      }
    }
    if (accepted.length > 0) onAttachmentsChange([...attachments, ...accepted]);
  };

  const removeAttachment = (id: string) => {
    const target = attachments.find((a) => a.id === id);
    if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
    onAttachmentsChange(attachments.filter((a) => a.id !== id));
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        // Encerra o microfone: sem isso o indicador de gravação do navegador
        // fica aceso mesmo depois de parar.
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const file = new File([blob], `audio-${Date.now()}.webm`, { type: blob.type });
        try {
          const attachment = await fileToPendingAttachment(file, { isRecordedAudio: true });
          onAttachmentsChange([...attachments, attachment]);
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Não foi possível preparar o áudio.");
        }
      };
      recorder.start();
      recorderRef.current = recorder;
      setIsRecording(true);
    } catch {
      toast.error("Não foi possível acessar o microfone. Verifique a permissão do navegador.");
    }
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setIsRecording(false);
  };

  const canSend = (value.trim().length > 0 || attachments.length > 0) && !isSending && !isRecording;

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

      {isRecording && (
        <div className="flex items-center gap-2 px-4 pt-2.5 text-xs text-danger sm:px-6">
          <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-danger" />
          Gravando áudio… toque no quadrado pra parar.
        </div>
      )}

      <AttachmentTray items={attachments} onRemove={removeAttachment} />

      {/* Inputs ocultos: o menu de anexos dispara o clique neles. Separados
          por tipo pra abrir o seletor já filtrado no celular. */}
      <input
        ref={documentInputRef}
        type="file"
        multiple
        accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip"
        className="hidden"
        onChange={(e) => {
          void addFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={mediaInputRef}
        type="file"
        multiple
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => {
          void addFiles(e.target.files);
          e.target.value = "";
        }}
      />

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
            <DropdownMenuItem onClick={() => documentInputRef.current?.click()}>
              <FileText className="mr-2 h-4 w-4" />
              Documentos
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => mediaInputRef.current?.click()}>
              <ImageIcon className="mr-2 h-4 w-4" />
              Fotos e Vídeos
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onScheduleAppointment()}>
              <CalendarPlus className="mr-2 h-4 w-4" />
              Agendar consulta
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setScheduleOpen(true)}>
              <CalendarClock className="mr-2 h-4 w-4" />
              Agendar mensagem
            </DropdownMenuItem>

            {/* No celular não cabe uma barra de ícones sem espremer o campo
                de texto, então emoji/macros/IA/áudio entram aqui. No desktop
                seguem como botões soltos, que é mais rápido. */}
            <DropdownMenuSeparator className="sm:hidden" />
            <DropdownMenuItem className="sm:hidden" onClick={() => setMobileEmojiOpen(true)}>
              <Smile className="mr-2 h-4 w-4" />
              Emojis
            </DropdownMenuItem>
            <DropdownMenuItem
              className="sm:hidden"
              onClick={() => (isRecording ? stopRecording() : startRecording())}
            >
              <Mic className="mr-2 h-4 w-4" />
              {isRecording ? "Parar gravação" : "Gravar áudio"}
            </DropdownMenuItem>
            <DropdownMenuItem className="sm:hidden" onClick={() => setAiOpen(true)}>
              <Sparkles className="mr-2 h-4 w-4" />
              Assistência de IA
            </DropdownMenuItem>
            <DropdownMenuItem className="sm:hidden" disabled>
              <Zap className="mr-2 h-4 w-4" />
              Macros — nenhuma disponível
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Emojis */}
        <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="hidden h-10 w-10 shrink-0 text-coral sm:inline-flex"
              aria-label="Emojis"
            >
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
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="hidden h-10 w-10 shrink-0 text-coral sm:inline-flex"
              aria-label="Macros"
            >
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
          className="hidden h-10 w-10 shrink-0 text-coral sm:inline-flex"
          onClick={() => setAiOpen(true)}
          aria-label="Assistência de IA"
        >
          <Sparkles className="h-5 w-5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            "h-10 w-10 shrink-0",
            // Enquanto grava, o botão aparece também no celular — precisa
            // ter como parar sem abrir menu.
            isRecording ? "animate-pulse bg-danger-soft text-danger" : "hidden text-coral sm:inline-flex",
          )}
          onClick={() => (isRecording ? stopRecording() : startRecording())}
          title={isRecording ? "Parar gravação" : "Gravar áudio"}
          aria-label={isRecording ? "Parar gravação" : "Gravar áudio"}
        >
          {isRecording ? <Square className="h-4 w-4 fill-current" /> : <Mic className="h-5 w-5" />}
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

      {/* No celular o seletor vem de baixo, não como popover — popover
          ancorado num item de menu ficaria fora da tela. */}
      <Sheet open={mobileEmojiOpen} onOpenChange={setMobileEmojiOpen}>
        <SheetContent side="bottom" className="h-auto rounded-t-[24px] pb-8">
          <SheetHeader className="pb-2 text-left">
            <SheetTitle className="text-base">Emojis</SheetTitle>
          </SheetHeader>
          <div className="flex justify-center">
            <EmojiPicker
              onSelect={(emoji) => {
                insertAtCursor(emoji);
                setMobileEmojiOpen(false);
              }}
            />
          </div>
        </SheetContent>
      </Sheet>

      <AiAssistDialog open={aiOpen} onOpenChange={setAiOpen} />

      <ScheduleMessageDialog
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        conversationId={conversationId}
        contactId={contactId}
        initialText={value}
        // Agendou usando o que estava escrito: limpa o campo pra não sobrar
        // o mesmo texto parecendo que ainda falta enviar.
        onScheduled={() => onChange("")}
      />
    </div>
  );
}
