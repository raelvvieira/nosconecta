import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Bot,
  CalendarClock,
  Check,
  CircleCheck,
  CreditCard,
  MapPin,
  MessageCircle,
  Sparkles,
  Stethoscope,
  Store,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  Campo,
  CamposDeArea,
  CamposDeAvaliacao,
  CamposDeIdentidade,
  CamposDePagamento,
  CamposDePoliticas,
  type Rascunho,
} from "@/components/settings/CamposDoConsultorio";
import { BlocoDeHorarios } from "@/components/settings/BlocoDeHorarios";
import { ConectarWhatsapp } from "@/components/atendimentos/ConectarWhatsapp";
import { Testar } from "@/components/agente-ia/Testar";
import { MODELOS } from "@/components/atendimentos/automations/automationTemplates";
import { catalogoDaArea, type AreaDeAtuacao } from "@/lib/settings/catalogo-modelo";
import {
  getConfigDoConsultorio,
  importarProcedimentos,
  salvarConfigDoConsultorio,
  type ConfigDoConsultorio,
} from "@/lib/settings/consultorio.functions";
import { getSettings, saveSetting } from "@/lib/settings/settings.functions";
import { getConexaoPropria } from "@/lib/atendimentos/conexao.functions";
import { listAutomations, saveAutomation } from "@/lib/atendimentos/automations.functions";
import { salvarConfiguracaoDoAgente } from "@/lib/agente-ia/agente.functions";

/**
 * O guia do consultório novo: um passo por tela, no estilo de apresentação,
 * com "Configurar depois" em todos. O que for pulado continua nos "Primeiros
 * passos" do Início e em Configurações. Cada "Continuar" grava o passo, e o
 * passo atual fica salvo: fechar e voltar retoma de onde parou.
 *
 * Abre sozinho para quem administra um consultório que ainda não concluiu
 * (`clinicas.onboarding_concluido_em`); a NÓS e quem já usa nascem concluídos.
 */

type PassoId =
  | "boas_vindas"
  | "consultorio"
  | "area"
  | "endereco"
  | "horarios"
  | "equipe"
  | "procedimentos"
  | "pagamento"
  | "mensagens"
  | "whatsapp"
  | "assistente"
  | "pronto";

const PASSOS: {
  id: PassoId;
  titulo: string;
  subtitulo: string;
  icone: typeof Store;
  soComIa?: boolean;
}[] = [
  {
    id: "boas_vindas",
    titulo: "Vamos deixar tudo pronto",
    subtitulo: "Em uns 10 minutos o sistema fica com a cara do seu consultório.",
    icone: Sparkles,
  },
  {
    id: "consultorio",
    titulo: "Seu consultório",
    subtitulo: "É assim que a assistente e as mensagens vão se apresentar.",
    icone: Store,
  },
  {
    id: "area",
    titulo: "O que vocês atendem",
    subtitulo: "Define o catálogo de procedimentos e as telas que aparecem.",
    icone: Stethoscope,
  },
  {
    id: "endereco",
    titulo: "Onde vocês atendem",
    subtitulo: "O endereço vai nas confirmações e nas respostas da assistente.",
    icone: MapPin,
  },
  {
    id: "horarios",
    titulo: "Quando vocês atendem",
    subtitulo: "A agenda e a assistente só oferecem horários dentro destes.",
    icone: CalendarClock,
  },
  {
    id: "equipe",
    titulo: "Quem atende",
    subtitulo: "Os profissionais e as salas que aparecem na agenda.",
    icone: Users,
  },
  {
    id: "procedimentos",
    titulo: "Seus principais procedimentos",
    subtitulo: "Escolha os que vocês fazem e coloque o preço. Dá para mudar depois.",
    icone: Stethoscope,
  },
  {
    id: "pagamento",
    titulo: "Como o paciente paga",
    subtitulo: "A assistente informa só o que estiver aqui.",
    icone: CreditCard,
  },
  {
    id: "mensagens",
    titulo: "Mensagens automáticas",
    subtitulo: "Confirmação e lembretes saem sozinhos pelo WhatsApp.",
    icone: MessageCircle,
  },
  {
    id: "whatsapp",
    titulo: "Conecte o WhatsApp",
    subtitulo: "O número do consultório, pelo QR code, como no WhatsApp Web.",
    icone: MessageCircle,
  },
  {
    id: "assistente",
    titulo: "Sua assistente",
    subtitulo: "Ela responde os pacientes no WhatsApp com tudo o que você configurou.",
    icone: Bot,
    soComIa: true,
  },
  {
    id: "pronto",
    titulo: "Tudo pronto",
    subtitulo: "O que ficou para depois está nos Primeiros passos do Início.",
    icone: CircleCheck,
  },
];

const SESSAO_FECHADA = "onboarding-fechado-nesta-sessao";

export function Onboarding({ config }: { config: ConfigDoConsultorio & { isAdmin: boolean } }) {
  const [fechado, setFechado] = useState(() => {
    try {
      return window.sessionStorage.getItem(SESSAO_FECHADA) === "1";
    } catch {
      return false;
    }
  });
  const passos = useMemo(
    () => PASSOS.filter((p) => !p.soComIa || config.plano === "ia"),
    [config.plano],
  );
  const inicial = Math.max(
    0,
    passos.findIndex((p) => p.id === config.onboardingPasso),
  );
  const [indice, setIndice] = useState(inicial);
  const [rascunho, setRascunho] = useState<Rascunho>(config);
  const [mudou, setMudou] = useState<Rascunho>({});
  const [salvando, setSalvando] = useState(false);
  const queryClient = useQueryClient();
  const salvarConfig = useServerFn(salvarConfigDoConsultorio);

  const passo = passos[indice];
  const ultimo = indice === passos.length - 1;
  const mudar = (patch: Rascunho) => {
    setRascunho((r) => ({ ...r, ...patch }));
    setMudou((m) => ({ ...m, ...patch }));
  };

  // O que cada passo grava ao "Continuar". Os passos de lista (equipe,
  // horários) gravam na hora, item a item.
  const [aoContinuar, setAoContinuar] = useState<(() => Promise<void>) | null>(null);

  if (fechado || config.onboardingConcluido || !config.isAdmin) return null;

  async function irPara(novo: number, gravar: boolean) {
    setSalvando(true);
    try {
      if (gravar) {
        if (aoContinuar) await aoContinuar();
        if (Object.keys(mudou).length) {
          await salvarConfig({ data: mudou });
          setMudou({});
        }
      }
      const destino = passos[Math.min(novo, passos.length - 1)];
      await salvarConfig({ data: { onboardingPasso: destino.id } });
      setAoContinuar(null);
      setIndice(novo);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não deu para salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function concluir() {
    setSalvando(true);
    try {
      await salvarConfig({ data: { concluirOnboarding: true } });
      queryClient.invalidateQueries();
      toast.success("Consultório configurado.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não deu para concluir.");
    } finally {
      setSalvando(false);
    }
  }

  function fecharPorAgora() {
    try {
      window.sessionStorage.setItem(SESSAO_FECHADA, "1");
    } catch {
      // Sem armazenamento, fecha até recarregar.
    }
    setFechado(true);
  }

  const Icone = passo.icone;
  const progresso = ((indice + 1) / passos.length) * 100;

  return (
    <Dialog open onOpenChange={(o) => !o && fecharPorAgora()}>
      <DialogContent className="flex max-h-[92dvh] w-[calc(100vw-1.5rem)] max-w-2xl flex-col gap-0 overflow-hidden rounded-[28px] border-0 p-0 shadow-2xl [&>button]:hidden [&>div]:grid-cols-[minmax(0,1fr)] [&>div]:gap-0">
        <div className="h-1 w-full bg-muted">
          <div
            className="h-full bg-gradient-primary transition-[width] duration-500 ease-out"
            style={{ width: `${progresso}%` }}
          />
        </div>
        <div className="flex items-center justify-between px-6 pt-5 sm:px-10">
          <span className="text-xs font-medium text-muted-foreground">
            {indice + 1} de {passos.length}
          </span>
          <button
            type="button"
            onClick={fecharPorAgora}
            className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-muted"
            aria-label="Terminar depois"
            title="Terminar depois"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div
          key={passo.id}
          className="custom-scroll flex-1 overflow-y-auto px-6 pb-6 pt-2 duration-300 animate-in fade-in-0 slide-in-from-right-4 sm:px-10"
        >
          <div className="mb-6 flex flex-col items-start gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
              <Icone className="h-6 w-6" />
            </span>
            <DialogTitle className="text-[26px] font-semibold leading-tight tracking-[-0.025em]">
              {passo.titulo}
            </DialogTitle>
            <DialogDescription className="text-[15px] leading-6 text-muted-foreground">
              {passo.subtitulo}
            </DialogDescription>
          </div>

          <ConteudoDoPasso
            id={passo.id}
            r={rascunho}
            mudar={mudar}
            registrar={(fn) => setAoContinuar(() => fn)}
            passos={passos.map((p) => p.titulo)}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 px-4 py-3 sm:px-10 sm:py-4">
          <div className="flex items-center gap-1">
            {indice > 0 && !ultimo && (
              <Button
                variant="ghost"
                size="sm"
                className="gap-1"
                disabled={salvando}
                onClick={() => void irPara(indice - 1, false)}
              >
                <ArrowLeft className="h-4 w-4" />
                Voltar
              </Button>
            )}
            {indice > 0 && !ultimo && (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                disabled={salvando}
                onClick={() => void irPara(indice + 1, false)}
              >
                Configurar depois
              </Button>
            )}
          </div>
          {ultimo ? (
            <Button variant="premium" className="min-w-32" disabled={salvando} onClick={concluir}>
              Começar a usar
            </Button>
          ) : (
            <Button
              variant="premium"
              className="min-w-32"
              disabled={salvando}
              onClick={() => void irPara(indice + 1, indice > 0)}
            >
              {indice === 0 ? "Começar" : salvando ? "Salvando…" : "Continuar"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ConteudoDoPasso({
  id,
  r,
  mudar,
  registrar,
  passos,
}: {
  id: PassoId;
  r: Rascunho;
  mudar: (p: Rascunho) => void;
  registrar: (fn: () => Promise<void>) => void;
  passos: string[];
}) {
  switch (id) {
    case "boas_vindas":
      return (
        <ol className="grid gap-2 sm:grid-cols-2">
          {passos.slice(1, -1).map((t, i) => (
            <li
              key={t}
              className="flex items-center gap-3 rounded-2xl bg-muted/40 px-4 py-3 text-sm"
            >
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-background text-xs font-semibold">
                {i + 1}
              </span>
              {t}
            </li>
          ))}
        </ol>
      );
    case "consultorio":
      return <CamposDeIdentidade r={r} mudar={mudar} />;
    case "area":
      return <CamposDeArea r={r} mudar={mudar} />;
    case "endereco":
      return <PassoEndereco registrar={registrar} />;
    case "horarios":
      return <BlocoDeHorarios semBotao />;
    case "equipe":
      return <PassoEquipe />;
    case "procedimentos":
      return (
        <PassoProcedimentos
          area={(r.area ?? "odonto_estetica") as AreaDeAtuacao}
          registrar={registrar}
        />
      );
    case "pagamento":
      return (
        <div className="grid gap-8">
          <CamposDePagamento r={r} mudar={mudar} />
          <div className="grid gap-3">
            <p className="text-sm font-semibold">Avaliação</p>
            <CamposDeAvaliacao r={r} mudar={mudar} />
          </div>
          <div className="grid gap-3">
            <p className="text-sm font-semibold">Políticas</p>
            <CamposDePoliticas r={r} mudar={mudar} />
          </div>
        </div>
      );
    case "mensagens":
      return <PassoMensagens registrar={registrar} />;
    case "whatsapp":
      return <PassoWhatsapp />;
    case "assistente":
      return <PassoAssistente registrar={registrar} />;
    case "pronto":
      return (
        <div className="grid gap-3 text-sm text-muted-foreground">
          <p>Tudo isso fica em Configurações, para mudar quando quiser:</p>
          <div className="flex flex-wrap gap-2">
            {[
              ["Consultório", "/configuracoes/consultorio"],
              ["Campanhas", "/configuracoes/campanhas"],
              ["Procedimentos", "/configuracoes"],
              ["Automações", "/atendimentos/automacoes"],
            ].map(([t, to]) => (
              <Link
                key={to}
                to={to}
                className="rounded-full border border-border px-3.5 py-1.5 text-foreground hover:bg-muted/50"
              >
                {t}
              </Link>
            ))}
          </div>
        </div>
      );
  }
}

// ── Endereço ───────────────────────────────────────────────────────────────

function PassoEndereco({ registrar }: { registrar: (fn: () => Promise<void>) => void }) {
  const buscar = useServerFn(getSettings);
  const salvar = useServerFn(saveSetting);
  const { data } = useQuery({ queryKey: ["settings"], queryFn: () => buscar() });
  const unidade = data?.units.find((u) => u.isDefault) ?? data?.units[0];
  const [f, setF] = useState({ name: "", address: "", mapsUrl: "", comoChegar: "" });
  useEffect(() => {
    if (unidade) {
      setF({
        name: unidade.name,
        address: unidade.address,
        mapsUrl: unidade.mapsUrl,
        comoChegar: unidade.comoChegar,
      });
    }
  }, [unidade]);
  useEffect(() => {
    registrar(async () => {
      if (!unidade) return;
      await salvar({ data: { section: "units", item: { ...unidade, ...f } } });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f, unidade]);
  if (!data) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  return (
    <div className="grid gap-4">
      <Campo rotulo="Nome da unidade" ajuda='Ex.: "Centro" ou o nome da cidade.'>
        <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      </Campo>
      <Campo rotulo="Endereço completo">
        <Input
          value={f.address}
          placeholder="Rua, número, sala, bairro, cidade"
          onChange={(e) => setF({ ...f, address: e.target.value })}
        />
      </Campo>
      <Campo
        rotulo="Link do Google Maps"
        ajuda="No Google Maps, abra o endereço e toque em Compartilhar. Vai junto nas confirmações."
      >
        <Input
          inputMode="url"
          value={f.mapsUrl}
          placeholder="https://maps.app.goo.gl/…"
          onChange={(e) => setF({ ...f, mapsUrl: e.target.value })}
        />
      </Campo>
      <Campo rotulo="Como chegar" ajuda="Opcional.">
        <Input
          value={f.comoChegar}
          placeholder="Ex.: prédio azul, estacionamento na rua de trás"
          onChange={(e) => setF({ ...f, comoChegar: e.target.value })}
        />
      </Campo>
      <p className="text-xs text-muted-foreground">
        Tem mais de uma unidade? Cadastre as outras depois em Configurações, Unidades.
      </p>
    </div>
  );
}

// ── Equipe ─────────────────────────────────────────────────────────────────

function PassoEquipe() {
  const queryClient = useQueryClient();
  const buscar = useServerFn(getSettings);
  const salvar = useServerFn(saveSetting);
  const { data } = useQuery({ queryKey: ["settings"], queryFn: () => buscar() });
  const [nome, setNome] = useState("");
  const [registro, setRegistro] = useState("");
  const [sala, setSala] = useState("");
  const unidade = data?.units.find((u) => u.isDefault) ?? data?.units[0];
  const adicionar = useMutation({
    mutationFn: (v: { section: "professionals" | "chairs"; item: Record<string, unknown> }) =>
      salvar({ data: { section: v.section, item: { ...v.item, unitId: unidade?.id ?? null } } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["settings"] }),
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="grid gap-6">
      <div className="grid gap-3">
        <p className="text-sm font-semibold">Profissionais</p>
        <ul className="grid gap-1.5">
          {(data?.professionals ?? []).map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-2 rounded-xl bg-muted/40 px-3 py-2 text-sm"
            >
              <Check className="h-4 w-4 text-primary" />
              {p.name}
              {p.registrationNumber && (
                <span className="text-xs text-muted-foreground">· {p.registrationNumber}</span>
              )}
            </li>
          ))}
        </ul>
        <div className="grid gap-2 sm:grid-cols-[1fr_10rem_auto]">
          <Input
            value={nome}
            placeholder="Dra. Ana Souza"
            onChange={(e) => setNome(e.target.value)}
          />
          <Input
            value={registro}
            placeholder="CRO / CRM"
            onChange={(e) => setRegistro(e.target.value)}
          />
          <Button
            variant="outline"
            disabled={!nome.trim() || adicionar.isPending}
            onClick={() =>
              adicionar.mutate(
                {
                  section: "professionals",
                  item: { name: nome.trim(), registrationNumber: registro.trim(), active: true },
                },
                {
                  onSuccess: () => {
                    setNome("");
                    setRegistro("");
                  },
                },
              )
            }
          >
            Adicionar
          </Button>
        </div>
      </div>
      <div className="grid gap-3">
        <p className="text-sm font-semibold">Salas ou cadeiras</p>
        <ul className="grid gap-1.5">
          {(data?.chairs ?? []).map((c) => (
            <li
              key={c.id}
              className="flex items-center gap-2 rounded-xl bg-muted/40 px-3 py-2 text-sm"
            >
              <Check className="h-4 w-4 text-primary" />
              {c.name}
            </li>
          ))}
        </ul>
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <Input value={sala} placeholder="Sala 1" onChange={(e) => setSala(e.target.value)} />
          <Button
            variant="outline"
            disabled={!sala.trim() || adicionar.isPending}
            onClick={() =>
              adicionar.mutate(
                { section: "chairs", item: { name: sala.trim(), active: true } },
                { onSuccess: () => setSala("") },
              )
            }
          >
            Adicionar
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Procedimentos ──────────────────────────────────────────────────────────

function PassoProcedimentos({
  area,
  registrar,
}: {
  area: AreaDeAtuacao;
  registrar: (fn: () => Promise<void>) => void;
}) {
  const importar = useServerFn(importarProcedimentos);
  const catalogo = catalogoDaArea(area);
  const [escolhidos, setEscolhidos] = useState<Record<string, string>>({});
  useEffect(() => {
    registrar(async () => {
      const itens = catalogo
        .filter((i) => escolhidos[i.nome] !== undefined)
        .map((i) => ({
          nome: i.nome,
          categoria: i.categoria,
          duracaoMin: i.duracaoMin,
          preco: Number(String(escolhidos[i.nome]).replace(/\./g, "").replace(",", ".")) || 0,
          aPartirDe: i.aPartirDe === true,
        }));
      if (itens.length) await importar({ data: { itens } });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [escolhidos, area]);
  return (
    <div className="grid gap-2">
      {catalogo.map((i) => {
        const marcado = escolhidos[i.nome] !== undefined;
        return (
          <div
            key={i.nome}
            className={cn(
              "flex items-center gap-3 rounded-2xl border px-3 py-2 transition",
              marcado ? "border-primary/50 bg-primary/5" : "border-border",
            )}
          >
            <Switch
              checked={marcado}
              onCheckedChange={(v) =>
                setEscolhidos((e) => {
                  const n = { ...e };
                  if (v) n[i.nome] = "";
                  else delete n[i.nome];
                  return n;
                })
              }
            />
            <span className="min-w-0 flex-1 text-sm">
              {i.nome}
              <span className="block text-xs text-muted-foreground">
                {i.categoria} · {i.duracaoMin} min{i.aPartirDe ? " · a partir de" : ""}
              </span>
            </span>
            {marcado && (
              <Input
                inputMode="decimal"
                className="h-9 w-28"
                placeholder="R$"
                value={escolhidos[i.nome]}
                onChange={(e) => setEscolhidos((x) => ({ ...x, [i.nome]: e.target.value }))}
              />
            )}
          </div>
        );
      })}
      <p className="mt-1 text-xs text-muted-foreground">
        Sem preço, a assistente diz que o valor depende da avaliação. Outros procedimentos você
        cadastra depois em Configurações.
      </p>
    </div>
  );
}

// ── Mensagens automáticas ──────────────────────────────────────────────────

function PassoMensagens({ registrar }: { registrar: (fn: () => Promise<void>) => void }) {
  const listar = useServerFn(listAutomations);
  const salvar = useServerFn(saveAutomation);
  const { data } = useQuery({ queryKey: ["automations"], queryFn: () => listar() });
  const existentes = new Set((data ?? []).map((a) => a.triggerEvent));
  const pendentes = MODELOS.filter((m) => !existentes.has(m.triggerEvent));
  const [ligar, setLigar] = useState<Record<string, boolean>>({});
  useEffect(() => {
    setLigar(Object.fromEntries(pendentes.map((m) => [m.id, true])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);
  useEffect(() => {
    registrar(async () => {
      for (const m of pendentes.filter((p) => ligar[p.id])) {
        await salvar({
          data: {
            name: m.nome,
            active: true,
            triggerEvent: m.triggerEvent,
            nodes: m.nodes,
            edges: m.edges,
          },
        });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ligar, data]);
  if (!data) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  if (!pendentes.length)
    return (
      <p className="text-sm text-muted-foreground">As mensagens automáticas já estão criadas.</p>
    );
  return (
    <div className="grid gap-2">
      {pendentes.map((m) => (
        <label
          key={m.id}
          className="flex items-start justify-between gap-4 rounded-2xl bg-muted/40 px-4 py-3"
        >
          <span>
            <span className="block text-sm font-semibold">{m.nome}</span>
            <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
              {m.descricao}
            </span>
          </span>
          <Switch
            checked={ligar[m.id] === true}
            onCheckedChange={(v) => setLigar((x) => ({ ...x, [m.id]: v }))}
          />
        </label>
      ))}
      <p className="mt-1 text-xs text-muted-foreground">
        Os textos usam o nome do paciente, a data, o horário, o endereço e o mapa da unidade. Você
        edita em Atendimentos, Automações.
      </p>
    </div>
  );
}

// ── WhatsApp ───────────────────────────────────────────────────────────────

function PassoWhatsapp() {
  const buscar = useServerFn(getConexaoPropria);
  const [aberto, setAberto] = useState(false);
  const { data } = useQuery({
    queryKey: ["conexao-propria"],
    queryFn: () => buscar(),
    refetchInterval: 5_000,
  });
  const conectado = data?.estado === "open";
  return (
    <div className="grid gap-4">
      <div
        className={cn(
          "flex items-center gap-3 rounded-2xl px-4 py-4",
          conectado ? "bg-emerald-50 dark:bg-emerald-950/40" : "bg-muted/40",
        )}
      >
        <span
          className={cn(
            "h-2.5 w-2.5 rounded-full",
            conectado ? "bg-emerald-500" : "bg-muted-foreground/40",
          )}
        />
        <span className="text-sm">
          {conectado
            ? `Conectado${data?.telefone ? ` ao ${data.telefone}` : ""}.`
            : "Ainda não conectado."}
        </span>
      </div>
      {!conectado && (
        <Button variant="outline" className="justify-self-start" onClick={() => setAberto(true)}>
          Mostrar o QR code
        </Button>
      )}
      <p className="text-xs leading-5 text-muted-foreground">
        No celular do consultório: WhatsApp, Configurações, Dispositivos conectados, Conectar um
        dispositivo. Aponte para o QR code.
      </p>
      <ConectarWhatsapp open={aberto} onOpenChange={setAberto} />
    </div>
  );
}

// ── Assistente ─────────────────────────────────────────────────────────────

function PassoAssistente({ registrar }: { registrar: (fn: () => Promise<void>) => void }) {
  const salvar = useServerFn(salvarConfiguracaoDoAgente);
  const [nome, setNome] = useState("Luna");
  const [ligada, setLigada] = useState(false);
  useEffect(() => {
    registrar(async () => {
      await salvar({ data: { nome, ligado: ligada } });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nome, ligada]);
  return (
    <div className="grid gap-5">
      <Campo rotulo="Nome da assistente" ajuda="É como ela se apresenta aos pacientes.">
        <Input value={nome} onChange={(e) => setNome(e.target.value)} />
      </Campo>
      <div className="grid gap-2">
        <p className="text-sm font-semibold">Teste uma conversa</p>
        <div className="rounded-2xl border border-border p-3">
          <Testar semCartao />
        </div>
      </div>
      <label className="flex items-center justify-between gap-3 rounded-2xl bg-muted/40 px-4 py-3 text-sm">
        <span>
          Ligar a assistente agora
          <span className="block text-xs text-muted-foreground">
            Ela passa a responder quem mandar mensagem no WhatsApp conectado.
          </span>
        </span>
        <Switch checked={ligada} onCheckedChange={setLigada} />
      </label>
    </div>
  );
}

/** Abre o guia para quem ainda não concluiu, ou devolve null. */
export function EntradaDoOnboarding({ semGuia }: { semGuia: React.ReactNode }) {
  const buscar = useServerFn(getConfigDoConsultorio);
  const { data } = useQuery({
    queryKey: ["config-do-consultorio"],
    queryFn: () => buscar(),
    staleTime: 60_000,
  });
  if (!data) return null;
  if (!data.onboardingConcluido && data.isAdmin) return <Onboarding config={data} />;
  return <>{semGuia}</>;
}
