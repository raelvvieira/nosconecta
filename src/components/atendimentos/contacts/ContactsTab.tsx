import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, MessageCircle, Search, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { formatWhatsappNumber } from "@/lib/atendimentos/phone";
import { getCrmContacts, type CrmContact } from "@/lib/atendimentos/contacts.functions";
import {
  alternarSelecaoDoRecorte,
  contarPorDdd,
  filtrarContatos,
} from "@/lib/atendimentos/contactFilters";
import { getConversations, getWhatsappInboxes } from "@/lib/atendimentos/atendimentos.functions";
import { contatosDaCaixa, daParaSepararPorNumero } from "@/lib/atendimentos/inboxSnapshot";

/** Constante, não `[]` na hora: array novo a cada render invalida todo
 *  `useMemo` que dependa dele — foi assim que a página de campanhas ganhou um
 *  laço infinito (ver FunnelSection.tsx). */
const SEM_CONTATOS: CrmContact[] = [];
const SEM_CONVERSAS: never[] = [];

export interface ContatoSelecionado extends CrmContact {
  /** Conversa aberta no WhatsApp, quando existe. */
  conversationId: string | null;
}

/**
 * A base de contatos sincronizada, com busca, recorte por DDD e seleção — o
 * passo de "para quem" dentro da criação de campanha, quando a audiência
 * escolhida é "Selecionar contatos" em vez de "Todos os contatos".
 *
 * Não existia nenhuma tela mostrando quem está sincronizado — a única leitura de
 * contatos no sistema inteiro pedia uma página de tamanho 1 só para ler o total.
 *
 * O recorte por DDD é ficha, não campo de texto: as fichas são geradas da
 * própria base, com a contagem ao lado, então dá para ver quais DDDs existem
 * antes de escolher. Escolher 48 e 51 juntos é o caso que motivou isto.
 */
export function ContactsTab({
  selecionados,
  onSelecionadosChange,
  onDisparar,
  ativo = true,
  barraFixa = true,
}: {
  selecionados: Set<string>;
  onSelecionadosChange: (ids: Set<string>) => void;
  onDisparar: (contatos: ContatoSelecionado[]) => void;
  /** A base inteira só é lida quando este passo está de fato em uso — abrir a
   *  criação de campanha no modo "Todos os contatos" não deve puxar a conta
   *  inteira do CRM à toa. */
  ativo?: boolean;
  /** `false` quando embutido numa gaveta (Sheet): a barra de ação flutuante
   *  usa `position: fixed` pensando na navegação de página inteira, com o
   *  respiro da barra inferior do app — dentro de uma gaveta isso não existe,
   *  e a barra precisa acompanhar a rolagem do próprio conteúdo. */
  barraFixa?: boolean;
}) {
  const fetchContacts = useServerFn(getCrmContacts);
  const fetchConversations = useServerFn(getConversations);
  const fetchInboxes = useServerFn(getWhatsappInboxes);

  const contactsQuery = useQuery({
    queryKey: ["crm-contacts"],
    queryFn: () => fetchContacts(),
    enabled: ativo,
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const conversationsQuery = useQuery({
    queryKey: ["atendimentos-conversations"],
    queryFn: () => fetchConversations(),
    enabled: ativo,
    staleTime: 60_000,
  });

  const inboxesQuery = useQuery({
    queryKey: ["crm-inboxes"],
    queryFn: () => fetchInboxes(),
    enabled: ativo,
    staleTime: 5 * 60_000,
  });

  const [busca, setBusca] = useState("");
  const [ddds, setDdds] = useState<Set<string>>(new Set());
  // Só quem é do número conectado, por padrão. Trocar de número no WhatsApp
  // deixa a caixa antiga na conta com todas as conversas dela, e disparar para
  // essa gente é mandar mensagem de uma clínica que ela não reconhece.
  const [soDoNumeroAtual, setSoDoNumeroAtual] = useState(true);

  const contatos = contactsQuery.data?.contacts ?? SEM_CONTATOS;

  // Contato → conversa. É o que decide, no disparo, por qual caminho a mensagem
  // sai; e o que a linha mostra como "com conversa".
  const conversaPorContato = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of conversationsQuery.data ?? SEM_CONVERSAS) {
      if (c.contactId) m.set(c.contactId, c.id);
    }
    return m;
  }, [conversationsQuery.data]);

  const conversas = conversationsQuery.data ?? SEM_CONVERSAS;
  const conectadaId = inboxesQuery.data?.conectadaId ?? null;

  // Sem caixa em nenhuma conversa, o recorte por número seria invenção — o
  // filtro some em vez de fingir que separa.
  const separavel = useMemo(
    () => Boolean(conectadaId) && daParaSepararPorNumero(conversas),
    [conversas, conectadaId],
  );

  const daCaixaAtual = useMemo(
    () => (separavel && conectadaId ? contatosDaCaixa(conversas, conectadaId) : null),
    [separavel, conectadaId, conversas],
  );

  const noEscopo = useMemo(
    () => (separavel && soDoNumeroAtual && daCaixaAtual
      ? contatos.filter((c) => daCaixaAtual.has(c.id))
      : contatos),
    [contatos, separavel, soDoNumeroAtual, daCaixaAtual],
  );
  const omitidos = contatos.length - noEscopo.length;

  /** DDDs presentes na base, do mais numeroso para o menos. */
  const fichasDdd = useMemo(() => contarPorDdd(noEscopo), [noEscopo]);
  const filtrados = useMemo(
    () => filtrarContatos(noEscopo, { busca, ddds }),
    [noEscopo, busca, ddds],
  );

  const todosFiltradosSelecionados =
    filtrados.length > 0 && filtrados.every((c) => selecionados.has(c.id));

  const alternarTodos = () => onSelecionadosChange(alternarSelecaoDoRecorte(selecionados, filtrados));

  const alternarUm = (id: string) => {
    const next = new Set(selecionados);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelecionadosChange(next);
  };

  const alternarDdd = (d: string) => {
    const next = new Set(ddds);
    if (next.has(d)) next.delete(d);
    else next.add(d);
    setDdds(next);
  };

  const paraDisparo = (): ContatoSelecionado[] =>
    contatos
      .filter((c) => selecionados.has(c.id))
      .map((c) => ({ ...c, conversationId: conversaPorContato.get(c.id) ?? null }));

  if (contactsQuery.isPending) {
    return (
      <div className="surface-card mt-5 grid min-h-40 place-items-center px-6 text-center">
        <p className="text-sm text-muted-foreground">
          Carregando a base de contatos do CRM… numa base grande isso leva alguns segundos.
        </p>
      </div>
    );
  }

  if (contactsQuery.isError) {
    return (
      <div className="surface-card mt-5 grid min-h-40 place-items-center px-6 text-center">
        <p className="text-sm text-danger">
          Não foi possível ler os contatos do CRM: {(contactsQuery.error as Error).message}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="relative mt-5">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          data-busca-contato=""
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome ou número"
          className="h-12 rounded-[18px] bg-white pl-11 shadow-soft"
        />
      </div>

      {/* O recorte por número vem antes do recorte por DDD: primeiro "de quem
          é essa base", depois "de onde eles são". */}
      {separavel && (
        <label
          data-so-numero-atual=""
          className="mt-3 flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-white px-3 py-2.5"
        >
          <Checkbox
            checked={soDoNumeroAtual}
            onCheckedChange={(v) => {
              setSoDoNumeroAtual(Boolean(v));
              // Sair do recorte não pode deixar selecionado alguém que estava
              // escondido; voltar ao recorte não pode carregar quem sumiu.
              onSelecionadosChange(new Set());
            }}
          />
          <span className="min-w-0 flex-1 text-sm">
            Só contatos do número conectado
            {omitidos > 0 && soDoNumeroAtual && (
              <span className="ml-1 text-muted-foreground">
                · {omitidos} de outro número ou sem conversa ficaram de fora
              </span>
            )}
          </span>
        </label>
      )}

      {fichasDdd.length > 0 && (
        <div className="scrollbar-none -mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
          <FichaDdd
            rotulo="Todos"
            contagem={contatos.length}
            ativa={ddds.size === 0}
            onClick={() => setDdds(new Set())}
          />
          {fichasDdd.map(([d, n]) => (
            <FichaDdd
              key={d}
              rotulo={d}
              contagem={n}
              ativa={ddds.has(d)}
              onClick={() => alternarDdd(d)}
            />
          ))}
        </div>
      )}

      {contactsQuery.data?.truncado && (
        <p className="mt-3 flex gap-2 rounded-xl bg-warning-soft px-3 py-2 text-2xs leading-4 text-warning">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" strokeWidth={2} />
          A base tem {contactsQuery.data.total} contatos e só os primeiros{" "}
          {contatos.length} foram carregados. O filtro e a seleção valem apenas
          sobre esses.
        </p>
      )}

      <div className="surface-card mt-4 overflow-hidden">
        {/* Selecionar todos fica FORA da tabela, ao contrário das telas de
            finanças, onde ele vive no cabeçalho `hidden lg:block` e por isso
            não existe no celular — que é justamente onde se usa. */}
        <label className="flex cursor-pointer items-center gap-3 border-b border-border px-4 py-3">
          <Checkbox
            data-selecionar-todos=""
            checked={todosFiltradosSelecionados}
            onCheckedChange={alternarTodos}
            disabled={filtrados.length === 0}
          />
          <span className="text-sm font-medium">
            {todosFiltradosSelecionados ? "Limpar" : "Selecionar"} os {filtrados.length}{" "}
            {ddds.size > 0 || busca.trim() ? "filtrados" : "contatos"}
          </span>
          {selecionados.size > 0 && (
            <span className="ml-auto text-2xs font-semibold text-coral" data-total-selecionado="">
              {selecionados.size} selecionado{selecionados.size === 1 ? "" : "s"}
            </span>
          )}
        </label>

        {filtrados.length === 0 ? (
          <div className="grid min-h-32 place-items-center px-6 py-8 text-center">
            <div>
              <Users className="mx-auto h-8 w-8 text-muted-foreground/50" strokeWidth={1.5} />
              <p className="mt-2 text-sm text-muted-foreground">
                {contatos.length === 0
                  ? "Nenhum contato sincronizado ainda."
                  : "Nada encontrado com esse filtro."}
              </p>
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {filtrados.map((c) => {
              const temConversa = conversaPorContato.has(c.id);
              return (
                <li key={c.id}>
                  <label
                    data-contato={c.id}
                    className="press flex cursor-pointer items-center gap-3 px-4 py-3"
                  >
                    <Checkbox
                      checked={selecionados.has(c.id)}
                      onCheckedChange={() => alternarUm(c.id)}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{c.name}</p>
                      <p className="mt-0.5 flex items-center gap-1.5 truncate text-2xs text-muted-foreground">
                        <span className="font-mono">{formatWhatsappNumber(c.phone) || "sem telefone"}</span>
                        {temConversa && (
                          <span className="flex items-center gap-1 text-success">
                            <MessageCircle className="h-3 w-3" /> com conversa
                          </span>
                        )}
                      </p>
                    </div>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Barra de ação só aparece com seleção. Em página cheia, fica acima da
          barra de navegação do celular (ilha flutuante de 76px + safe-area);
          embutida numa gaveta, `barraFixa=false` a mantém no fluxo normal. */}
      {selecionados.size > 0 && (
        <div
          className={cn(
            "material-bar flex items-center gap-3 rounded-3xl px-4 py-3 lg:static lg:mt-4 lg:rounded-2xl",
            barraFixa ? "fixed inset-x-4 z-40" : "sticky bottom-0 z-10 mt-4",
          )}
          style={barraFixa ? { bottom: "calc(92px + env(safe-area-inset-bottom))" } : undefined}
        >
          <span className="text-sm font-semibold">
            {selecionados.size} contato{selecionados.size === 1 ? "" : "s"}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() => onSelecionadosChange(new Set())}
          >
            Limpar
          </Button>
          <Button
            data-disparar-selecao=""
            variant="premium"
            size="sm"
            onClick={() => onDisparar(paraDisparo())}
          >
            Disparar
          </Button>
        </div>
      )}
    </>
  );
}

function FichaDdd({
  rotulo,
  contagem,
  ativa,
  onClick,
}: {
  rotulo: string;
  contagem: number;
  ativa: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-ddd={rotulo}
      onClick={onClick}
      className={cn(
        "h-11 shrink-0 rounded-full border px-4 text-sm font-medium transition-colors",
        ativa ? "border-coral bg-coral-soft text-coral" : "border-border bg-white text-foreground-secondary",
      )}
    >
      {rotulo} <span className="text-muted-foreground">({contagem})</span>
    </button>
  );
}
