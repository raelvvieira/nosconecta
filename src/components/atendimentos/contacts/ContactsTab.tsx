import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Loader2, MessageCircle, Search, UserRound, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { formatWhatsappNumber } from "@/lib/atendimentos/phone";
import { useContatosIncremental } from "@/lib/atendimentos/useContatosIncremental";
import {
  alternarSelecaoDoRecorte,
  contarPorDdd,
  filtrarContatos,
} from "@/lib/atendimentos/contactFilters";
import { getConversations, getWhatsappInboxes } from "@/lib/atendimentos/atendimentos.functions";
import { getPatientContacts } from "@/lib/patients/patients.functions";
import { contatosDaCaixa, daParaSepararPorNumero } from "@/lib/atendimentos/inboxSnapshot";

/** Constante, não `[]` na hora: array novo a cada render invalida todo
 *  `useMemo` que dependa dele — foi assim que a página de campanhas ganhou um
 *  laço infinito (ver FunnelSection.tsx). */
const SEM_CONVERSAS: never[] = [];
const SEM_PACIENTES: never[] = [];

export interface ContatoUnificado {
  id: string;
  name: string;
  phone: string | null;
  /** "crm" = já sincronizado do WhatsApp, `id` é o contactId do CRM. "paciente"
   *  = cadastrado na NÓS mas nunca teve conversa — `id` é o id do paciente, e
   *  o CRM só ganha um contato pra ele na hora do disparo (ver `patientId`
   *  em `garantirContatoCrm`, chamado antes de enfileirar). */
  origem: "crm" | "paciente";
  patientId: string | null;
}

export interface ContatoSelecionado extends ContatoUnificado {
  /** Conversa aberta no WhatsApp, quando existe. Nunca existe pra `origem: "paciente"`. */
  conversationId: string | null;
}

/**
 * A base de contatos pra disparo, com busca, recorte por DDD e seleção — o
 * passo de "para quem" dentro da criação de campanha, quando a audiência
 * escolhida é "Selecionar contatos" em vez de "Todos os contatos".
 *
 * Junta duas fontes: os contatos do CRM (sincronizados de conversas de
 * WhatsApp) e os pacientes da NÓS que nunca tiveram conversa nenhuma — sem
 * isso, um paciente cadastrado direto no sistema (nunca mandou mensagem)
 * era invisível pra qualquer disparo filtrado. Mandar pra quem nunca
 * conversou continua sendo uma aposta não confirmada com o CRM/WhatsApp —
 * ver aviso em BroadcastDialog.tsx.
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
  const fetchConversations = useServerFn(getConversations);
  const fetchInboxes = useServerFn(getWhatsappInboxes);
  const fetchPatientContacts = useServerFn(getPatientContacts);

  // Chega aos pedaços: a primeira página já aparece, e o resto entra por trás
  // — ver useContatosIncremental.ts. Não é `useQuery` porque o progresso
  // parcial precisa ser um estado que muda várias vezes por carregamento, e
  // não um valor único que só existe quando tudo termina.
  const contatosEstado = useContatosIncremental(ativo);

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

  // Segunda fonte da audiência: pacientes da NÓS que nunca tiveram conversa,
  // logo não existem no CRM. Consulta única e leve — nada de paginação aqui.
  const patientsQuery = useQuery({
    queryKey: ["patient-contacts-sem-crm"],
    queryFn: () => fetchPatientContacts(),
    enabled: ativo,
    staleTime: 60_000,
  });

  const [busca, setBusca] = useState("");
  const [ddds, setDdds] = useState<Set<string>>(new Set());
  // Só quem é do número conectado, por padrão. Trocar de número no WhatsApp
  // deixa a caixa antiga na conta com todas as conversas dela, e disparar para
  // essa gente é mandar mensagem de uma clínica que ela não reconhece. Não se
  // aplica a paciente sem CRM: não veio de sincronização nenhuma, é dado
  // nosso, não tem como estar "contaminado" por número antigo.
  const [soDoNumeroAtual, setSoDoNumeroAtual] = useState(true);

  const contatos = useMemo<ContatoUnificado[]>(
    () => [
      ...contatosEstado.contatos.map((c) => ({ id: c.id, name: c.name, phone: c.phone, origem: "crm" as const, patientId: null })),
      ...(patientsQuery.data ?? SEM_PACIENTES).map((p) => ({ id: p.id, name: p.name, phone: p.phone, origem: "paciente" as const, patientId: p.id })),
    ],
    [contatosEstado.contatos, patientsQuery.data],
  );

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
      // Paciente sem CRM nunca é filtrado por caixa: não veio de sincronização
      // nenhuma, então não tem como ser "do número antigo".
      ? contatos.filter((c) => c.origem === "paciente" || daCaixaAtual.has(c.id))
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

  // Só a tela cheia de "carregando" enquanto NADA chegou ainda — a partir da
  // primeira página, o carregamento vira uma faixa discreta acima da lista,
  // porque a partir daí já dá para buscar e selecionar.
  if (contatos.length === 0 && contatosEstado.carregando) {
    return (
      <div className="surface-card mt-5 grid min-h-40 place-items-center gap-2 px-6 text-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" strokeWidth={2} />
        <p className="text-sm text-muted-foreground">
          Carregando a base de contatos do CRM…
          {contatosEstado.progresso &&
            ` página ${contatosEstado.progresso.feitas} de ${contatosEstado.progresso.totalPaginas}.`}
        </p>
      </div>
    );
  }

  if (contatos.length === 0 && contatosEstado.erro) {
    return (
      <div className="surface-card mt-5 grid min-h-40 place-items-center px-6 text-center">
        <p className="text-sm text-danger">
          Não foi possível ler os contatos do CRM: {contatosEstado.erro}
        </p>
      </div>
    );
  }

  return (
    <>
      {contatosEstado.carregando && (
        <p
          data-carregando-mais=""
          className="mt-5 flex items-center gap-2 rounded-xl bg-surface px-3 py-2 text-2xs leading-4 text-muted-foreground"
        >
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" strokeWidth={2} />
          Ainda carregando mais contatos
          {contatosEstado.progresso && ` — página ${contatosEstado.progresso.feitas} de ${contatosEstado.progresso.totalPaginas}`}
          . Os {contatos.length} já carregados já podem ser buscados e selecionados.
        </p>
      )}

      {!contatosEstado.carregando && contatosEstado.erro && (
        <p className="mt-5 flex gap-2 rounded-xl bg-warning-soft px-3 py-2 text-2xs leading-4 text-warning">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" strokeWidth={2} />
          Parou de carregar mais páginas: {contatosEstado.erro}. Os {contatos.length} já
          carregados continuam disponíveis.
        </p>
      )}

      {/* Falha aqui é silenciosa por padrão: sem isto, "faltam pacientes na
          lista" viraria um mistério em vez de um erro visível. */}
      {patientsQuery.isError && (
        <p className="mt-3 flex gap-2 rounded-xl bg-warning-soft px-3 py-2 text-2xs leading-4 text-warning">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" strokeWidth={2} />
          Não foi possível ler os pacientes sem conversa: {(patientsQuery.error as Error).message}. A
          lista abaixo tem só os contatos do CRM.
        </p>
      )}

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

      {!contatosEstado.carregando && contatosEstado.truncado && (
        <p className="mt-3 flex gap-2 rounded-xl bg-warning-soft px-3 py-2 text-2xs leading-4 text-warning">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" strokeWidth={2} />
          A base tem {contatosEstado.total} contatos e só os primeiros{" "}
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
                        {c.origem === "paciente" ? (
                          <span className="flex items-center gap-1 text-foreground-secondary">
                            <UserRound className="h-3 w-3" /> paciente, sem conversa
                          </span>
                        ) : temConversa ? (
                          <span className="flex items-center gap-1 text-success">
                            <MessageCircle className="h-3 w-3" /> com conversa
                          </span>
                        ) : null}
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
