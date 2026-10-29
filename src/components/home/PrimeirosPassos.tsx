import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronRight, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  getMeuConsultorio,
  getPrimeirosPassos,
  salvarMeuConsultorio,
  type PassoId,
} from "@/lib/plataforma/onboarding.functions";

/**
 * O que cadastrar primeiro, num consultório novo.
 *
 * Minimalista de propósito (pedido de 29/10): uma lista curta, uma barra de
 * progresso, e cada passo leva à tela certa. O estado vem dos próprios dados
 * (tem endereço? tem dentista? o WhatsApp está conectado?), nunca de uma
 * caixinha marcada: cadastrou, o passo fica feito sozinho.
 *
 * Some quando os passos obrigatórios estão feitos. Só quem administra vê.
 */
const PASSOS: Record<
  PassoId,
  { titulo: string; porque: string; to?: string; search?: Record<string, string> }
> = {
  consultorio: {
    titulo: "Seu consultório",
    porque: "O nome e quem faz a avaliação. A assistente fala dessa pessoa com os pacientes.",
  },
  unidade: {
    titulo: "Endereço e horários",
    porque: "Onde fica e em que dias e horas atende. É daqui que saem os horários da agenda.",
    to: "/configuracoes",
    search: { section: "units" },
  },
  cadeiras: {
    titulo: "Cadeiras e dentistas",
    porque: "Quem atende e em qual cadeira. A agenda precisa dos dois.",
    to: "/configuracoes",
    search: { section: "chairs" },
  },
  procedimentos: {
    titulo: "Procedimentos e preços",
    porque: "O que o consultório faz e quanto custa. A assistente só fala os valores daqui.",
    to: "/configuracoes",
    search: { section: "procedures" },
  },
  whatsapp: {
    titulo: "Conectar o WhatsApp",
    porque: "Lendo o QR code com o celular do consultório. As conversas passam a chegar aqui.",
    to: "/atendimentos",
  },
  assistente: {
    titulo: "Ligar a assistente",
    porque: "Dê um nome a ela, teste na tela Testar e ligue quando gostar das respostas.",
    to: "/agente-ia",
  },
  equipe: {
    titulo: "Convidar a equipe",
    porque: "Recepção, dentistas e financeiro, cada um com o seu acesso.",
    to: "/configuracoes/pessoal",
  },
  pixel: {
    titulo: "Conectar o Pixel da Meta",
    porque:
      "Para os anúncios saberem quem agendou. O Pixel ID e o token ficam no Gerenciador de Eventos da Meta.",
    to: "/configuracoes/integracoes",
  },
};

const ESCONDIDO = "nosconecta:primeiros-passos-escondido";

export function PrimeirosPassos({ className }: { className?: string }) {
  const buscar = useServerFn(getPrimeirosPassos);
  const { data } = useQuery({
    queryKey: ["primeiros-passos"],
    queryFn: () => buscar(),
    staleTime: 30_000,
  });
  const [escondido, setEscondido] = useState(() => {
    try {
      return window.localStorage.getItem(ESCONDIDO) === "1";
    } catch {
      return false;
    }
  });
  const [editandoConsultorio, setEditandoConsultorio] = useState(false);

  if (!data || escondido) return null;
  const obrigatorios = data.passos.filter((p) => !p.opcional);
  const feitos = obrigatorios.filter((p) => p.feito).length;
  if (feitos === obrigatorios.length) return null;
  const pct = Math.round((feitos / obrigatorios.length) * 100);

  return (
    <section className={cn("surface-card p-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Primeiros passos</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {feitos} de {obrigatorios.length} feitos. Cada um leva poucos minutos.
          </p>
        </div>
        <button
          type="button"
          aria-label="Esconder os primeiros passos"
          className="press rounded-full p-1.5 text-muted-foreground hover:bg-surface-muted"
          onClick={() => {
            try {
              window.localStorage.setItem(ESCONDIDO, "1");
            } catch {
              // Sem armazenamento, esconde só até recarregar.
            }
            setEscondido(true);
          }}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-muted">
        <div className="h-full rounded-full bg-coral transition-all" style={{ width: `${pct}%` }} />
      </div>

      <ol className="mt-4 divide-y divide-border">
        {data.passos.map((p) => {
          const info = PASSOS[p.id];
          const conteudo = (
            <>
              <span
                className={cn(
                  "grid h-6 w-6 shrink-0 place-items-center rounded-full border text-xs",
                  p.feito
                    ? "border-transparent bg-success text-white"
                    : "border-border text-muted-foreground",
                )}
              >
                {p.feito && <Check className="h-3.5 w-3.5" />}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "block text-sm font-medium",
                    p.feito && "text-muted-foreground line-through",
                  )}
                >
                  {info.titulo}
                  {p.opcional && (
                    <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                      opcional
                    </span>
                  )}
                </span>
                {!p.feito && (
                  <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                    {info.porque}
                  </span>
                )}
              </span>
              {!p.feito && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
            </>
          );
          const classe = "flex w-full items-start gap-3 py-3 text-left";
          return (
            <li key={p.id}>
              {p.feito ? (
                <div className={classe}>{conteudo}</div>
              ) : info.to ? (
                <Link to={info.to} search={info.search as never} className={cn(classe, "press")}>
                  {conteudo}
                </Link>
              ) : (
                <button
                  type="button"
                  className={cn(classe, "press")}
                  onClick={() => setEditandoConsultorio(true)}
                >
                  {conteudo}
                </button>
              )}
            </li>
          );
        })}
      </ol>

      {editandoConsultorio && <SeuConsultorio onFechar={() => setEditandoConsultorio(false)} />}
    </section>
  );
}

/** Passo 1, ali mesmo: nome do consultório e quem faz a avaliação. */
function SeuConsultorio({ onFechar }: { onFechar: () => void }) {
  const buscar = useServerFn(getMeuConsultorio);
  const salvar = useServerFn(salvarMeuConsultorio);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["meu-consultorio"], queryFn: () => buscar() });
  const [nome, setNome] = useState<string | null>(null);
  const [responsavel, setResponsavel] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    try {
      await salvar({
        data: {
          nome: nome ?? data?.nome ?? "",
          responsavelAvaliacao: responsavel ?? data?.responsavelAvaliacao ?? "",
        },
      });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["primeiros-passos"] }),
        qc.invalidateQueries({ queryKey: ["meu-consultorio"] }),
      ]);
      toast.success("Salvo.");
      onFechar();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && onFechar()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Seu consultório</DialogTitle>
        </DialogHeader>
        <form className="space-y-4" onSubmit={enviar}>
          <div>
            <Label htmlFor="mc-nome">Nome do consultório</Label>
            <Input
              id="mc-nome"
              className="mt-1"
              value={nome ?? data?.nome ?? ""}
              onChange={(e) => setNome(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="mc-resp">Quem faz a avaliação</Label>
            <Input
              id="mc-resp"
              className="mt-1"
              placeholder="Ex.: Dra. Ana"
              value={responsavel ?? data?.responsavelAvaliacao ?? ""}
              onChange={(e) => setResponsavel(e.target.value)}
              required
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Como a assistente fala dela: "a avaliação é com a Dra. Ana".
            </p>
          </div>
          <DialogFooter>
            <Button type="submit" variant="premium" disabled={salvando}>
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const BOAS_VINDAS_VISTAS = "nosconecta:boas-vindas-vistas";

const CARTOES = [
  {
    titulo: "A agenda",
    texto:
      "Consultas por dentista e cadeira, com confirmação e lembrete pelo WhatsApp. Quem marca pela assistente cai aqui sozinho.",
  },
  {
    titulo: "As conversas",
    texto:
      "Todo o WhatsApp do consultório num lugar. A assistente responde quem chega, e qualquer pessoa da equipe assume a conversa quando quiser.",
  },
  {
    titulo: "O financeiro",
    texto:
      "O que entrou, o que vai sair e o que sobra no mês. Cada consulta marcada já vira um recebimento previsto.",
  },
];

/** Três cartões, uma vez só, para quem acabou de criar o consultório. */
export function BoasVindas() {
  const buscar = useServerFn(getPrimeirosPassos);
  const { data } = useQuery({
    queryKey: ["primeiros-passos"],
    queryFn: () => buscar(),
    staleTime: 30_000,
  });
  const [vistas, setVistas] = useState(() => {
    try {
      return window.localStorage.getItem(BOAS_VINDAS_VISTAS) === "1";
    } catch {
      return true;
    }
  });
  const [passo, setPasso] = useState(0);

  // Só para o consultório que está começando: com um passo ou nenhum feito.
  const comecando = !!data && data.passos.filter((p) => !p.opcional && p.feito).length <= 1;
  if (vistas || !comecando) return null;

  function fechar() {
    try {
      window.localStorage.setItem(BOAS_VINDAS_VISTAS, "1");
    } catch {
      // Sem armazenamento, fecha só até recarregar.
    }
    setVistas(true);
  }

  const c = CARTOES[passo];
  const ultimo = passo === CARTOES.length - 1;
  return (
    <Dialog open onOpenChange={(aberto) => !aberto && fechar()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Bem-vindo · {passo + 1} de {CARTOES.length}
          </p>
          <DialogTitle>{c.titulo}</DialogTitle>
        </DialogHeader>
        <p className="text-sm leading-6 text-muted-foreground">{c.texto}</p>
        <div className="flex justify-center gap-1.5 pt-1">
          {CARTOES.map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                i === passo ? "bg-coral" : "bg-surface-muted",
              )}
            />
          ))}
        </div>
        <DialogFooter className="flex-row justify-between gap-2 sm:justify-between">
          <Button variant="outline" onClick={fechar}>
            Pular
          </Button>
          <Button variant="premium" onClick={() => (ultimo ? fechar() : setPasso(passo + 1))}>
            {ultimo ? "Começar" : "Próximo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
