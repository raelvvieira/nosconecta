import { useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { PencilLine, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { getMessageTemplates } from "@/lib/atendimentos/campaigns.functions";
import { VariableChips } from "./VariableChips";
import { MediaUploadField } from "./MediaUploadField";

// Templates criados automaticamente pelo modo "Digitar" levam esse prefixo
// e ficam escondidos do picker de "mensagem pronta" — ver comentário em
// NewCampaignSheet.tsx sobre por que o template precisa existir no CRM
// mesmo pra mensagem digitada na hora.
export const HIDDEN_TEMPLATE_PREFIX = "[Digitado] ";

export interface ComposerState {
  mode: "digitar" | "pronta";
  templateId: string | null;
  isNewTemplate: boolean;
  newTemplateName: string;
  content: string;
  mediaUrl: string | null;
}

export function MessageComposer({ state, onChange }: { state: ComposerState; onChange: (next: ComposerState) => void }) {
  const fetchTemplates = useServerFn(getMessageTemplates);
  const templatesQuery = useQuery({
    queryKey: ["message-templates"],
    queryFn: () => fetchTemplates(),
    staleTime: 10_000,
  });
  const visibleTemplates = useMemo(
    () => (templatesQuery.data ?? []).filter((t) => !t.name.startsWith(HIDDEN_TEMPLATE_PREFIX)),
    [templatesQuery.data],
  );

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [creatingNew, setCreatingNew] = useState(false);

  const insertVariable = (placeholder: string) => {
    const el = textareaRef.current;
    if (!el) {
      onChange({ ...state, content: state.content + placeholder });
      return;
    }
    const start = el.selectionStart ?? state.content.length;
    const end = el.selectionEnd ?? state.content.length;
    const next = state.content.slice(0, start) + placeholder + state.content.slice(end);
    onChange({ ...state, content: next });
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = start + placeholder.length;
    });
  };

  const selectExistingTemplate = (templateId: string) => {
    const template = visibleTemplates.find((t) => t.id === templateId);
    setCreatingNew(false);
    onChange({
      mode: "pronta",
      templateId,
      isNewTemplate: false,
      newTemplateName: "",
      content: template?.content ?? "",
      mediaUrl: null,
    });
  };

  const startCreatingNew = () => {
    setCreatingNew(true);
    onChange({ mode: "pronta", templateId: null, isNewTemplate: true, newTemplateName: "", content: "", mediaUrl: null });
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Mensagem</p>
        <div className="flex items-center gap-1 rounded-full bg-muted p-1">
          <button
            type="button"
            onClick={() =>
              onChange({ mode: "digitar", templateId: null, isNewTemplate: true, newTemplateName: "", content: state.content, mediaUrl: state.mediaUrl })
            }
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors",
              state.mode === "digitar" ? "bg-white text-foreground shadow-soft" : "text-muted-foreground",
            )}
          >
            <PencilLine className="h-3.5 w-3.5" />
            Digitar
          </button>
          <button
            type="button"
            onClick={() => {
              setCreatingNew(false);
              onChange({ mode: "pronta", templateId: null, isNewTemplate: false, newTemplateName: "", content: "", mediaUrl: null });
            }}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors",
              state.mode === "pronta" ? "bg-white text-foreground shadow-soft" : "text-muted-foreground",
            )}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Mensagem pronta
          </button>
        </div>
      </div>

      {state.mode === "pronta" && !creatingNew && (
        <div className="space-y-2">
          <Select value={state.templateId ?? ""} onValueChange={selectExistingTemplate}>
            <SelectTrigger>
              <SelectValue placeholder="Selecionar mensagem pronta" />
            </SelectTrigger>
            <SelectContent>
              {visibleTemplates.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button type="button" onClick={startCreatingNew} className="text-xs font-medium text-pink hover:underline">
            + Criar novo template
          </button>
          {state.templateId && (
            <p className="rounded-2xl border border-border bg-muted/50 p-3 text-sm text-muted-foreground">
              {state.content || "Template sem conteúdo."}
            </p>
          )}
        </div>
      )}

      {(state.mode === "digitar" || (state.mode === "pronta" && creatingNew)) && (
        <div className="space-y-2">
          {state.mode === "pronta" && creatingNew && (
            <div>
              <Label htmlFor="new-template-name">Nome do template</Label>
              <Input
                id="new-template-name"
                value={state.newTemplateName}
                onChange={(e) => onChange({ ...state, newTemplateName: e.target.value })}
                className="mt-1.5"
                placeholder="Ex.: Retorno de consulta"
              />
            </div>
          )}
          <Textarea
            ref={textareaRef}
            value={state.content}
            onChange={(e) => onChange({ ...state, content: e.target.value })}
            placeholder="Digite a mensagem que será enviada para todos os contatos..."
            rows={5}
            className="resize-none"
          />
          <VariableChips onInsert={insertVariable} />
          <MediaUploadField mediaUrl={state.mediaUrl} onChange={(url) => onChange({ ...state, mediaUrl: url })} />
        </div>
      )}
    </section>
  );
}
