import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Loader2, MessageCircle, UserRound, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { getRecentRecipients } from "@/lib/atendimentos/broadcast.functions";
import { getDailySendUsage } from "@/lib/atendimentos/campaigns.functions";
import { getPatientContacts } from "@/lib/patients/patients.functions";
import { contatosDaCaixa, daParaSepararPorNumero } from "@/lib/atendimentos/inboxSnapshot";
import { calcularLote } from "@/lib/atendimentos/loteDeDisparo";
import { listarTags, mapaDeTags, todasAsAtribuicoes } from "@/lib/tags/tags.functions";
import { FichasDeTag } from "@/components/tags/FichasDeTag";
import { FiltrosDeContatos } from "./FiltrosDeContatos";
import { LoteDeDisparo, nomeDoRecorte } from "./LoteDeDisparo";

/** Constante, não `[]` na hora: array novo a cada render invalida todo
 *  `useMemo` que dependa dele — foi assim que a página de campanhas ganhou um
 *  laço infinito, na seção de funil que a tela de campanhas tinha. */
const SEM_CONVERSAS: never[] = [];
const SEM_PACIENTES: never[] = [];
const SEM_RECENTES: never[] = [];
const SEM_ATRIBUICOES: never[] = [];
const SEM_TAGS: never[] = [];

const normFone = (phone: string | null) => (phone ?? "").replace(/\D/g, "");

/** Dias corridos entre um ISO e agora, arredondado pra baixo — "recebeu hoje"
 *  cobre até 24h atrás, não só "depois da meia-noite". */
function diasAtras(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000));
}

/** Já recebeu, ou já está na fila para receber. */
interface Tratamento {
  quando: string;
  naFila: boolean;
}

function rotuloRecente({ quando, naFila }: Tratamento): string {
  // "na fila" não é o mesmo que "recebeu": a mensagem ainda não saiu, e dizer
  // que saiu faria a pessoa achar que pode remover da fila sem consequência.
  if (naFila) return "na fila";
  const dias = diasAtras(quando);
  if (dias <= 0) return "recebeu hoje";
  if (dias === 1) return "recebeu ontem";
  return `recebeu há ${dias} dias`;
}

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
  const fetchRecentRecipients = useServerFn(getRecentRecipients);

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

  // Quem recebeu disparo nos últimos 7 dias — a janela de quantos desses dias
  // contam como "recente" é escolhida na tela (janelaDias), não aqui.
  const recentesQuery = useQuery({
    queryKey: ["broadcast-recent-recipients"],
    queryFn: () => fetchRecentRecipients(),
    enabled: ativo,
    staleTime: 60_000,
  });

  // Mesma chave da tela de campanhas e do disparo por coluna: os três mostram
  // o mesmo número de cota porque leem o mesmo cache, não porque combinaram.
  const fetchUsage = useServerFn(getDailySendUsage);
  const usageQuery = useQuery({
    queryKey: ["campaigns-usage"],
    queryFn: () => fetchUsage(),
    enabled: ativo,
    staleTime: 15_000,
  });
  const usage = usageQuery.data ?? { limit: 200, usedToday: 0 };

  const fetchTags = useServerFn(listarTags);
  const fetchAtribuicoes = useServerFn(todasAsAtribuicoes);
  const tagsQuery = useQuery({
    queryKey: ["tags"],
    queryFn: () => fetchTags(),
    enabled: ativo,
    staleTime: 5 * 60_000,
  });
  const atribuicoesQuery = useQuery({
    queryKey: ["tags-atribuicoes"],
    queryFn: () => fetchAtribuicoes(),
    enabled: ativo,
    staleTime: 60_000,
  });

  const [busca, setBusca] = useState("");
  const [ddds, setDdds] = useState<Set<string>>(new Set());
  const [tagsEscolhidas, setTagsEscolhidas] = useState<Set<string>>(new Set());
  // Só quem é do número conectado, por padrão. Trocar de número no WhatsApp
  // deixa a caixa antiga na conta com todas as conversas dela, e disparar para
  // essa gente é mandar mensagem de uma clínica que ela não reconhece. Não se
  // aplica a paciente sem CRM: não veio de sincronização nenhuma, é dado
  // nosso, não tem como estar "contaminado" por número antigo.
  const [soDoNumeroAtual, setSoDoNumeroAtual] = useState(true);

  // Quem recebeu disparo recente some da lista por padrão — mesmo espírito do
  // filtro de número acima: começa escondendo quem provavelmente não deveria
  // receber de novo, quem quiser incluir mesmo assim desliga.
  const [ocultarRecentes, setOcultarRecentes] = useState(true);
  const [janelaDias, setJanelaDias] = useState(1);

  // Paciente SEM telefone nunca consegue receber: sem número não há como criar
  // o contato no CRM, e `prepararAlvos` o recusa na hora de enfileirar. Ele
  // aparecia na lista com "sem telefone", dava para selecionar, e o disparo
  // falhava depois. Contato do CRM entra sempre — ele existe lá, com o telefone
  // que o CRM tem, mesmo quando não veio para cá.
  const semTelefone = (patientsQuery.data ?? SEM_PACIENTES).filter((p) => !p.phone).length;

  const contatos = useMemo<ContatoUnificado[]>(
    () => [
      ...contatosEstado.contatos.map((c) => ({ id: c.id, name: c.name, phone: c.phone, origem: "crm" as const, patientId: null })),
      ...(patientsQuery.data ?? SEM_PACIENTES)
        .filter((p) => !!p.phone)
        .map((p) => ({ id: p.id, name: p.name, phone: p.phone, origem: "paciente" as const, patientId: p.id })),
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

  // Contato → último envio, casado por duas chaves: contact_id bate direto
  // pra quem já veio do CRM (`ContatoUnificado.id` de origem "crm" É o
  // contact_id); paciente sem CRM só ganha um contact_id na hora do disparo
  // (garantirContatoCrm), então esse caso só casa por telefone.
  const { porContato, porTelefone } = useMemo(() => {
    const porContato = new Map<string, Tratamento>();
    const porTelefone = new Map<string, Tratamento>();
    for (const r of recentesQuery.data ?? SEM_RECENTES) {
      const t: Tratamento = { quando: r.sentAt, naFila: r.naFila };
      porContato.set(r.contactId, t);
      const fone = normFone(r.phone);
      if (fone) {
        const atual = porTelefone.get(fone);
        if (!atual || t.quando > atual.quando) porTelefone.set(fone, t);
      }
    }
    return { porContato, porTelefone };
  }, [recentesQuery.data]);

  const ultimoEnvio = (c: ContatoUnificado): Tratamento | null =>
    porContato.get(c.id) ?? porTelefone.get(normFone(c.phone)) ?? null;

  /** Já recebeu ou já está na fila, dentro da janela escolhida. Quem está aqui
   *  não entra em lote nenhum — é o que impede a mesma pessoa de receber duas
   *  vezes numa campanha que leva dias. */
  const foiTratado = (c: ContatoUnificado): boolean => {
    const via = ultimoEnvio(c);
    // Na fila conta como tratado sem olhar a janela: a mensagem ainda vai sair,
    // e a data ali é a de agendamento, que pode ser daqui a pouco.
    if (!via) return false;
    return via.naFila || diasAtras(via.quando) < janelaDias;
  };

  const naoTratados = useMemo(
    () => noEscopo.filter((c) => !foiTratado(c)),
    [noEscopo, janelaDias, porContato, porTelefone],
  );
  const semRecentes = ocultarRecentes ? naoTratados : noEscopo;
  const omitidosRecentes = noEscopo.length - naoTratados.length;

  // Tag por contato, casada pelas duas chaves de uma vez — a lista tem mais de
  // mil linhas, e resolver o vínculo de cada uma seria uma consulta por linha.
  const porContatoTags = useMemo(
    () => mapaDeTags(atribuicoesQuery.data ?? SEM_ATRIBUICOES),
    [atribuicoesQuery.data],
  );

  const temAlgumaTagEscolhida = (c: ContatoUnificado): boolean => {
    if (tagsEscolhidas.size === 0) return true;
    // O `id` já é a chave certa: do CRM para quem veio de lá, do paciente para
    // quem nunca conversou. `mapaDeTags` indexa as duas.
    const doContato = porContatoTags.get(c.id) ?? porContatoTags.get(c.patientId ?? "");
    if (!doContato) return false;
    // Várias tags escolhidas somam em vez de restringir: "clareamento OU
    // implante" é o recorte que serve a um disparo; exigir as duas juntas
    // devolveria quase ninguém.
    for (const t of tagsEscolhidas) if (doContato.has(t)) return true;
    return false;
  };

  /** DDDs presentes na base, do mais numeroso para o menos. */
  const fichasDdd = useMemo(() => contarPorDdd(semRecentes), [semRecentes]);
  const filtrados = useMemo(
    () => filtrarContatos(semRecentes, { busca, ddds }).filter(temAlgumaTagEscolhida),
    [semRecentes, busca, ddds, tagsEscolhidas, porContatoTags],
  );

  // O recorte para o envio em lotes, em duas medidas: quantos existem e quantos
  // ainda não foram tratados. Sai de `noEscopo` e não de `filtrados` de
  // propósito — desligar "sem disparo recente" muda o que a lista MOSTRA, mas
  // não pode fazer o lote reenviar para quem já recebeu.
  const recorteTotal = useMemo(
    () => filtrarContatos(noEscopo, { busca, ddds }).filter(temAlgumaTagEscolhida).length,
    [noEscopo, busca, ddds, tagsEscolhidas, porContatoTags],
  );
  const recortePendente = useMemo(
    () => filtrarContatos(naoTratados, { busca, ddds }).filter(temAlgumaTagEscolhida),
    [naoTratados, busca, ddds, tagsEscolhidas, porContatoTags],
  );

  const lote = calcularLote({
    total: recorteTotal,
    restantes: recortePendente.length,
    limite: usage.limit,
    usadoHoje: usage.usedToday,
    carregando: contatosEstado.carregando,
  });

  // O cartão de lote só faz sentido quando o recorte não cabe de uma vez: com
  // 40 contatos e cota de 200 ele seria um passo a mais para fazer o que o
  // "Selecionar todos" já faz num toque.
  const precisaDeLotes = recorteTotal > usage.limit || lote.tratados > 0;

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

  const comConversa = (c: ContatoUnificado): ContatoSelecionado => ({
    ...c,
    conversationId: conversaPorContato.get(c.id) ?? null,
  });

  const paraDisparo = (): ContatoSelecionado[] =>
    contatos.filter((c) => selecionados.has(c.id)).map(comConversa);

  /** O lote: os primeiros N ainda não tratados do recorte. Qual "primeiros" não
   *  importa para a corretude — a ordem da lista não é estável, e quem já foi
   *  tratado nunca está aqui —, mas seguir a ordem exibida é o que faz o
   *  resultado bater com o que a pessoa acabou de ver na tela. */
  const dispararLote = () => {
    const alvos = recortePendente.slice(0, lote.tamanho).map(comConversa);
    if (alvos.length) onDisparar(alvos);
  };

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

      <FiltrosDeContatos
        busca={busca}
        onBusca={setBusca}
        separavel={separavel}
        soDoNumeroAtual={soDoNumeroAtual}
        onSoDoNumeroAtual={(v) => {
          setSoDoNumeroAtual(v);
          // Sair do recorte não pode deixar selecionado alguém que estava
          // escondido; voltar ao recorte não pode carregar quem sumiu.
          onSelecionadosChange(new Set());
        }}
        omitidosPorNumero={omitidos}
        temRecentes={(recentesQuery.data?.length ?? 0) > 0}
        ocultarRecentes={ocultarRecentes}
        onOcultarRecentes={(v) => {
          setOcultarRecentes(v);
          onSelecionadosChange(new Set());
        }}
        janelaDias={janelaDias}
        onJanelaDias={(v) => {
          setJanelaDias(v);
          onSelecionadosChange(new Set());
        }}
        omitidosPorRecente={omitidosRecentes}
        semTelefone={semTelefone}
        visiveis={semRecentes.length}
        base={contatos.length + semTelefone}
      />

      {fichasDdd.length > 0 && (
        <div className="scrollbar-none -mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
          {/* "Todos" conta sobre a MESMA base das outras fichas. Antes contava
              `contatos.length`, a base crua, enquanto cada DDD contava já
              filtrado — então "Todos (1000)" convivia com fichas somando 950, e
              os números não fechavam para quem tentasse conferir. */}
          <FichaDdd
            rotulo="Todos"
            contagem={semRecentes.length}
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

      <FichasDeTag
        className="mt-2.5"
        tags={tagsQuery.data ?? SEM_TAGS}
        escolhidas={tagsEscolhidas}
        onAlternar={(id) => {
          const next = new Set(tagsEscolhidas);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          setTagsEscolhidas(next);
          // Mesmo motivo dos outros filtros: mudar o recorte não pode deixar
          // selecionado quem sumiu da tela.
          onSelecionadosChange(new Set());
        }}
        contar={(id) =>
          semRecentes.filter((c) => {
            const t = porContatoTags.get(c.id) ?? porContatoTags.get(c.patientId ?? "");
            return Boolean(t?.has(id));
          }).length
        }
      />

      {precisaDeLotes && (
        <LoteDeDisparo
          estado={lote}
          recorte={nomeDoRecorte(ddds, busca)}
          limite={usage.limit}
          usadoHoje={usage.usedToday}
          onEnviar={dispararLote}
        />
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
              // Só chega a existir uma linha pra badgear quando o toggle de
              // ocultar está desligado — com ele ligado, quem recebeu recente
              // já nem está em `filtrados`.
              const ultimoEnvioDele = ultimoEnvio(c);
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
                    {ultimoEnvioDele && (
                      <Badge variant="warning" className="shrink-0" data-recente="">
                        {rotuloRecente(ultimoEnvioDele)}
                      </Badge>
                    )}
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
