import { useSyncExternalStore } from "react";
import { toast } from "sonner";
import {
  criarDisparo,
  vincularAlvos,
  type AlvoAVincular,
  type BroadcastAlvo,
  type RitmoDoDisparo,
} from "./broadcast.functions";

/**
 * O enfileiramento visto de fora.
 *
 * Entre confirmar o disparo e o lote existir no banco há um trecho que pode
 * levar dezenas de segundos: cada paciente sem contato no CRM precisa ser
 * vinculado lá antes de a fila poder existir. Isso acontecia em silêncio — a
 * tela fechava, a lista continuava igual, e se o CRM estourasse o tempo o
 * único vestígio era um toast vermelho que sumia em segundos, levando junto a
 * mensagem, o ritmo, a imagem e a seleção de 200 pessoas.
 *
 * Aqui essa etapa vira um item de lista como qualquer outro: com etapa,
 * percentual, erro nomeado e retentativa a partir do mesmo payload. Guardado em
 * `sessionStorage` porque a falha típica é demora do CRM, e quem espera
 * dezenas de segundos costuma trocar de tela nesse meio-tempo.
 */

export type EtapaDoEnfileiramento = "vinculando" | "criando" | "pronto" | "erro";

export interface DisparoEmPreparacao {
  localId: string;
  nome: string;
  message: string;
  ritmo: RitmoDoDisparo;
  mediaPath: string | null;
  prontos: BroadcastAlvo[];
  aVincular: AlvoAVincular[];
  foraDoDisparo: { nome: string; motivo: string }[];
  etapa: EtapaDoEnfileiramento;
  /** Vínculos já resolvidos — reaproveitados na retentativa. */
  resolvidos: Record<string, string>;
  erro: string | null;
  broadcastId: string | null;
  criadoEm: string;
}

const CHAVE = "nos:disparos-em-preparacao";
/** Blocos pequenos o bastante para o percentual andar visivelmente. */
const TAMANHO_DO_BLOCO = 25;

let itens: DisparoEmPreparacao[] = [];
const ouvintes = new Set<() => void>();

function carregar() {
  if (typeof window === "undefined") return;
  try {
    const bruto = window.sessionStorage.getItem(CHAVE);
    const lista = bruto ? (JSON.parse(bruto) as DisparoEmPreparacao[]) : [];
    // Item que ficou "rodando" quando a aba fechou não tem quem o toque:
    // volta como erro retentável, e não como progresso eternamente parado.
    itens = lista.map((i) =>
      i.etapa === "vinculando" || i.etapa === "criando"
        ? { ...i, etapa: "erro", erro: "O envio foi interrompido antes de a fila ser criada." }
        : i,
    );
  } catch {
    itens = [];
  }
}
carregar();

function publicar(proximos: DisparoEmPreparacao[]) {
  itens = proximos;
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.setItem(CHAVE, JSON.stringify(itens));
    } catch {
      /* cota cheia não pode derrubar o disparo */
    }
  }
  ouvintes.forEach((o) => o());
}

function alterar(localId: string, mudanca: Partial<DisparoEmPreparacao>) {
  publicar(itens.map((i) => (i.localId === localId ? { ...i, ...mudanca } : i)));
}

export function descartarPreparacao(localId: string) {
  publicar(itens.filter((i) => i.localId !== localId));
}

export function useDisparosEmPreparacao(): DisparoEmPreparacao[] {
  return useSyncExternalStore(
    (o) => {
      ouvintes.add(o);
      return () => ouvintes.delete(o);
    },
    () => itens,
    () => [],
  );
}

/** Quantos vínculos faltam / já saíram, para a barra do cartão. */
export function progressoDaPreparacao(i: DisparoEmPreparacao) {
  const total = i.aVincular.length;
  const feitos = i.aVincular.filter((p) => i.resolvidos[p.patientId]).length;
  const totalContatos = i.prontos.length + total;
  if (i.etapa === "criando" || i.etapa === "pronto") {
    return { rotulo: i.etapa === "pronto" ? "Fila criada" : "Criando a fila", pct: 0.95, feitos: total, total, totalContatos };
  }
  if (i.etapa === "erro") {
    return { rotulo: "Falhou ao enfileirar", pct: total ? feitos / total : 0, feitos, total, totalContatos };
  }
  return {
    rotulo: total ? "Vinculando contatos ao CRM" : "Criando a fila",
    pct: total ? (feitos / total) * 0.9 : 0.5,
    feitos,
    total,
    totalContatos,
  };
}

async function executar(localId: string) {
  const inicial = itens.find((i) => i.localId === localId);
  if (!inicial) return;
  alterar(localId, { etapa: "vinculando", erro: null });

  try {
    const resolvidos = { ...inicial.resolvidos };
    const pendentes = inicial.aVincular.filter((p) => !resolvidos[p.patientId]);
    for (let i = 0; i < pendentes.length; i += TAMANHO_DO_BLOCO) {
      const bloco = pendentes.slice(i, i + TAMANHO_DO_BLOCO);
      const mapa = await vincularAlvos({ data: { aVincular: bloco } });
      Object.assign(resolvidos, mapa);
      // Marca também quem o CRM não resolveu, para a retentativa não insistir
      // num bloco inteiro por causa de um contato impossível.
      alterar(localId, { resolvidos: { ...resolvidos } });
    }

    alterar(localId, { etapa: "criando" });

    const fora = [...inicial.foraDoDisparo];
    const vinculados: BroadcastAlvo[] = [];
    for (const p of inicial.aVincular) {
      const contactId = resolvidos[p.patientId];
      if (!contactId) {
        fora.push({ nome: p.name, motivo: "não pôde ser vinculado ao CRM." });
        continue;
      }
      vinculados.push({
        contactId,
        conversationId: p.conversationId,
        name: p.name,
        phone: p.phone,
      });
    }

    const alvos = [...inicial.prontos, ...vinculados];
    if (!alvos.length) {
      throw new Error("Nenhum dos contatos selecionados pôde ser vinculado ao CRM.");
    }

    const r = await criarDisparo({
      data: {
        message: inicial.message,
        name: inicial.nome || null,
        ritmo: inicial.ritmo,
        mediaPath: inicial.mediaPath,
        prontos: alvos,
        aVincular: [],
      },
    });

    alterar(localId, { etapa: "pronto", broadcastId: r.broadcastId, erro: null });
    toast.success(`Disparo na fila com ${r.total} contatos.`, { duration: 6000 });
    if (fora.length) {
      toast.warning(
        `${fora.length} ${fora.length === 1 ? "pessoa ficou" : "pessoas ficaram"} de fora: ` +
          fora.map((f) => f.nome).join(", "),
        { duration: 10000 },
      );
    }
  } catch (e) {
    alterar(localId, {
      etapa: "erro",
      erro: e instanceof Error ? e.message : "Falha desconhecida ao enfileirar o disparo.",
    });
  }
}

/** Coloca um disparo em preparação e começa a trabalhar nele. */
export function enfileirarDisparo(dados: {
  nome: string;
  message: string;
  ritmo: RitmoDoDisparo;
  mediaPath: string | null;
  prontos: BroadcastAlvo[];
  aVincular: AlvoAVincular[];
  foraDoDisparo: { nome: string; motivo: string }[];
}) {
  const localId = `prep_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  publicar([
    {
      localId,
      ...dados,
      etapa: "vinculando",
      resolvidos: {},
      erro: null,
      broadcastId: null,
      criadoEm: new Date().toISOString(),
    },
    ...itens,
  ]);
  void executar(localId);
  return localId;
}

/** Retentativa do mesmo payload, reaproveitando os vínculos já feitos. */
export function retentarPreparacao(localId: string) {
  void executar(localId);
}
