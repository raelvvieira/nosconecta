import {
  ArrowLeftRight,
  Expand,
  FileText,
  Heart,
  Briefcase,
  Lightbulb,
  Shield,
  Shrink,
  Sparkles,
  Type,
  type LucideIcon,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

// Estrutura pronta, ações ainda não ligadas: o CRM não expõe hoje um
// endpoint de IA por mensagem (as chaves de IA são geridas pelo operador da
// instalação e os endpoints de IA documentados — sales_assistant e
// sales_playbook — são análise do funil, não reescrita de texto).
// Assim que existir o endpoint, cada ação vira uma chamada aqui, sem
// precisar refazer a tela.
interface AiAction {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
}

const ACTIONS: AiAction[] = [
  { id: "suggest", label: "Sugestão de resposta", description: "Gerar sugestão de resposta", icon: Sparkles },
  { id: "summarize", label: "Resumir conversa", description: "Criar resumo da conversa", icon: Type },
  { id: "rephrase", label: "Reformular", description: "Reescrever a mensagem de forma diferente", icon: ArrowLeftRight },
  { id: "spelling", label: "Corrigir ortografia", description: "Corrigir erros gramaticais e ortográficos", icon: FileText },
  { id: "expand", label: "Expandir", description: "Tornar a mensagem mais detalhada", icon: Expand },
  { id: "shorten", label: "Encurtar", description: "Resumir a mensagem", icon: Shrink },
  { id: "friendly", label: "Tornar amigável", description: "Usar tom mais casual e amigável", icon: Heart },
  { id: "formal", label: "Tornar formal", description: "Usar tom mais profissional", icon: Briefcase },
  { id: "simplify", label: "Simplificar", description: "Tornar mais fácil de entender", icon: Lightbulb },
  { id: "sentiment", label: "Analisar sentimento", description: "Verificar se a mensagem contém conteúdo inadequado", icon: Shield },
];

export function AiAssistDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-coral" />
            Assistência de IA
          </DialogTitle>
          <DialogDescription>Selecione uma ação para começar</DialogDescription>
        </DialogHeader>

        <p className="rounded-xl bg-warning-soft px-3 py-2 text-xs leading-5 text-warning">
          Em breve. A tela já está pronta, mas as ações ainda não estão ligadas — falta o CRM
          disponibilizar a IA de mensagens.
        </p>

        <div className="space-y-2">
          {ACTIONS.map((action) => (
            <button
              key={action.id}
              type="button"
              disabled
              className="flex w-full cursor-not-allowed items-center gap-3 rounded-2xl border border-border bg-white p-3 text-left opacity-60"
            >
              <action.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0">
                <span className="block text-sm font-medium">{action.label}</span>
                <span className="block text-xs text-muted-foreground">{action.description}</span>
              </span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
