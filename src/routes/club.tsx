import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Check, Clock, Gift, LogOut, Share2, Sparkles, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/finance/format";
import { situacaoNoClub, type NivelDoClub } from "@/lib/club/niveis-do-club";
import { convite } from "@/lib/club/convite";
import { criarContaDoClub } from "@/lib/club/club.functions";

/**
 * A área do paciente — o destino do QR Code do cartão.
 *
 * ── Por que é uma rota só ─────────────────────────────────────────────────
 *
 * O QR Code vai impresso num cartão de plástico. Ele aponta para um endereço
 * que precisa valer para sempre, para todo mundo, antes e depois de a pessoa
 * ter conta. Dois endereços (um de login, outro de painel) seriam duas coisas
 * que podem divergir do que está impresso; aqui é `/club` e pronto, e quem já
 * entrou vê o painel em vez do formulário.
 *
 * ── Por que ela fica fora dos portões do sistema ──────────────────────────
 *
 * `AuthGate` manda quem não tem sessão para `/auth`, e `MembershipGate` barra
 * quem não é da equipe. O paciente é exatamente isso: alguém autenticado que
 * NÃO é da equipe. As duas isenções estão em `__root.tsx` e em
 * `MembershipGate.tsx`, com `/club` ao lado de `/convite`.
 *
 * ── Por que os dados vêm de uma função do banco ───────────────────────────
 *
 * Porque o paciente não tem permissão em tabela nenhuma. Ver o comentário
 * longo na migration: `club_meu_painel()` devolve o painel montado, e é a
 * única porta que existe para ele.
 */
/**
 * O endereço ABSOLUTO do site, só para a prévia do link.
 *
 * Quem lê a prévia é o servidor do WhatsApp, de fora: "/og-club.jpg" não quer
 * dizer nada para ele, precisa do endereço inteiro. Como a página é montada no
 * servidor antes de existir navegador, não dá para perguntar por onde a pessoa
 * entrou — fica escrito, como já estava a prévia do `__root`.
 *
 * É o mesmo endereço do QR do cartão. Mudando o domínio do sistema, esta linha
 * muda junto, senão a prévia fica sem imagem.
 */
const ENDERECO_DA_PREVIA = "https://login.nosodontoesaude.com.br";

/** A frase embaixo do link. É o convite em uma linha, não a descrição do sistema. */
const PREVIA_TEXTO =
  "Créditos que viram desconto na sua consulta. Indique quem você gosta e acumule mais.";

export const Route = createFileRoute("/club")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "NÓS Club" },
      { name: "description", content: PREVIA_TEXTO },
      // O cartão é lido no celular, sempre. A cor da barra do navegador junto
      // do fundo escuro é o que faz a página parecer um app, e não um site.
      { name: "theme-color", content: "#faf6ef" },

      // A prévia do WhatsApp, só desta página.
      //
      // Quem manda o convite está mandando para um amigo, não para um colega
      // de clínica — e o que aparecia embaixo do link era o print do painel
      // financeiro com "Sistema de gestão financeira para clínicas
      // odontológicas", que vem do `__root`. Estas linhas ficam mais fundas na
      // árvore de rotas e substituem as de lá; todo o resto do sistema segue
      // com a prévia antiga.
      { property: "og:title", content: "NÓS Club" },
      { property: "og:description", content: PREVIA_TEXTO },
      { property: "og:type", content: "website" },
      { property: "og:url", content: `${ENDERECO_DA_PREVIA}/club` },
      { property: "og:image", content: `${ENDERECO_DA_PREVIA}/og-club.jpg` },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: "Cartão do NÓS Club" },
      // `summary_large_image` é o que pede a imagem grande em cima do link, em
      // vez da miniatura quadrada ao lado.
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "NÓS Club" },
      { name: "twitter:description", content: PREVIA_TEXTO },
      { name: "twitter:image", content: `${ENDERECO_DA_PREVIA}/og-club.jpg` },
    ],
  }),
  component: ClubPage,
});

interface PainelDoPaciente {
  ok: boolean;
  motivo?: string;
  nome?: string;
  confirmadas?: number;
  saldo?: number;
  regua?: NivelDoClub[];
  indicacoes?: { nome: string; status: string; quando: string }[];
  extrato?: { valor: number; descricao: string; quando: string }[];
  /** O endereço definitivo do cartão, quando a clínica já o salvou. A mensagem
   *  de convite usa ele — e não o endereço por onde ESTA pessoa abriu. */
  link_do_cartao?: string | null;
  /** Quanto vale cada indicação confirmada. Vem da configuração da clínica —
   *  cravar "100" aqui faria a explicação mentir no dia em que ela mudasse. */
  por_indicacao?: number;
}

function ClubPage() {
  const [sessao, setSessao] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSessao(data.session?.user?.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) =>
      setSessao(s?.user?.id ?? null),
    );
    return () => sub.subscription.unsubscribe();
  }, []);

  const painel = useQuery({
    queryKey: ["club-meu-painel", sessao],
    enabled: !!sessao,
    retry: false,
    queryFn: async (): Promise<PainelDoPaciente> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("club_meu_painel");
      if (error) throw new Error(error.message);
      return (data ?? { ok: false }) as PainelDoPaciente;
    },
  });

  if (sessao === undefined) return <Fundo>{null}</Fundo>;
  if (!sessao) return <Entrada />;
  if (painel.isPending) {
    return (
      <Fundo>
        <p className="text-sm text-neutral-500">Abrindo seu Club…</p>
      </Fundo>
    );
  }
  // Erro de CHAMADA e recusa da função são coisas diferentes, e misturá-las
  // dizia "não encontramos seu cadastro" quando o que faltava era a migration
  // — mandando a pessoa falar com a recepção sobre um problema que é nosso.
  if (painel.isError) return <AindaNaoPronto />;
  if (!painel.data?.ok) return <SemCadastro motivo={painel.data?.motivo ?? "erro"} />;
  return <Painel dados={painel.data} />;
}

/** O fundo é o mesmo em todos os estados: é ele que faz a página parecer um
 *  cartão, e não uma tela de sistema. */
function Fundo({ children }: { children: React.ReactNode }) {
  return (
    <div className="club-fundo min-h-dvh w-full px-5 py-8 text-neutral-900">
      <div className="mx-auto w-full max-w-[460px]">{children}</div>
    </div>
  );
}

/** O logo do Club no lugar do ícone genérico. O desenho já diz "NÓS Club";
 *  o `h1` fica só para leitor de tela e para a aba do navegador. */
function Marca({ legenda }: { legenda?: string }) {
  return (
    <div className="club-entra flex flex-col items-center text-center">
      <span className="club-logo w-[148px] text-[#2a2118]" role="img" aria-label="NÓS Club" />
      <h1 className="sr-only">NÓS Club</h1>
      {legenda ? <p className="mt-3 text-sm text-neutral-500">{legenda}</p> : null}
    </div>
  );
}

/**
 * Os quatro materiais do cartão passando, antes de a pessoa entrar.
 *
 * É a vitrine do programa: quem chega pelo QR vê que existe um cartão bege,
 * um prateado, um dourado e um holográfico — e que o dela é um deles. As
 * classes de material são as MESMAS do cartão de verdade no painel, então o
 * que passa aqui é o que a pessoa vai receber, não uma ilustração parecida.
 *
 * Os nomes escritos nos cartões vêm da lista abaixo, não do banco: esta tela
 * é vista antes de haver sessão para ler a régua. Se a clínica renomear um
 * nível em /nos-club, é aqui que o desfile precisa acompanhar.
 */
// A cor do logo em cada material é a mesma do texto do cartão de verdade no
// painel. Creme sobre o bege, que era a primeira ideia, sumia na faixa clara
// do degradê; só o prata segura o logo branco.
//
// Os nomes são os que a clínica manda escrever no desfile — é vitrine, vista
// antes de haver sessão para ler a régua do banco. O cartão de verdade, no
// painel, continua mostrando o nome que está cadastrado na régua.
const MATERIAIS_DO_DESFILE = [
  { material: "cartao-velvet", logo: "text-[#3b2f20]/85", nome: "Starter" },
  { material: "cartao-prata", logo: "text-white/95", nome: "Platinum" },
  { material: "cartao-ouro", logo: "text-[#3a2a06]/80", nome: "Gold" },
  { material: "cartao-holo", logo: "text-[#2b3a45]/75", nome: "Diamond" },
];

function Desfile() {
  // Duas vezes a fila, para o laço fechar sem emenda — ver `.club-fila`.
  const fila = [...MATERIAIS_DO_DESFILE, ...MATERIAIS_DO_DESFILE];
  return (
    // Sangra até as bordas da tela, e não só até as do formulário: no
    // computador o desfile apertado em 460px parecia uma tira recortada.
    <div
      className="club-desfile club-entra ml-[calc(50%-50vw)] w-screen overflow-hidden py-6"
      aria-hidden="true"
    >
      <div className="club-fila pl-5">
        {fila.map((c, i) => (
          <div key={i} className="club-flutua">
            <div
              className={cn(
                "club-cartao club-brilho relative flex h-[150px] w-[238px] shrink-0 flex-col items-center justify-center overflow-hidden rounded-[18px]",
                c.material,
              )}
            >
              <span className={cn("club-logo w-[104px]", c.logo)} />
              <span className="absolute bottom-4 text-[9px] font-medium uppercase tracking-[0.28em] opacity-70">
                {c.nome}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Entrar ────────────────────────────────────────────────────────────────

function Entrada() {
  const criarConta = useServerFn(criarContaDoClub);
  const [modo, setModo] = useState<"entrar" | "criar">("entrar");
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [carregando, setCarregando] = useState(false);

  /**
   * Criar conta e entrar são UMA ação.
   *
   * A conta nasce já confirmada no servidor — a prova de identidade foi o
   * cruzamento com a base da clínica, não a caixa de entrada —, então aqui é
   * só entrar na sequência. Quem está com o cartão na mão vai do formulário
   * ao painel sem sair da tela.
   */
  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (senha.length < 8) return toast.error("A senha precisa ter pelo menos 8 caracteres.");
    setCarregando(true);

    if (modo === "criar") {
      try {
        const r = await criarConta({ data: { nome, telefone, email, senha } });
        if (!r.ok) {
          setCarregando(false);
          toast.error(MOTIVOS[r.motivo ?? "falhou"]);
          return;
        }
      } catch (erro) {
        setCarregando(false);
        toast.error(erro instanceof Error ? erro.message : "Não deu para criar sua conta.");
        return;
      }
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    setCarregando(false);
    if (error) {
      toast.error(
        error.message === "Invalid login credentials"
          ? "E-mail ou senha não conferem."
          : error.message,
      );
    }
    // Com sessão, o `onAuthStateChange` lá em cima troca a tela sozinho.
  }

  return (
    <Fundo>
      <div className="pt-2">
        <Marca legenda="Quanto mais NÓS, mais benefícios." />
      </div>

      <Desfile />

      {/* Quem chega pelo QR pela primeira vez cai em "Já tenho conta" e tenta
          entrar com um e-mail que ainda não existe. O aviso vem ANTES do
          formulário e é ele mesmo o botão: um toque e a aba de criar abre. */}
      {modo === "entrar" && (
        <button
          type="button"
          onClick={() => setModo("criar")}
          className="club-entra glass-claro mb-3 flex w-full items-center gap-3 px-5 py-4 text-left transition-transform active:scale-[0.98]"
          style={{ animationDelay: "100ms" }}
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#1c1814] text-[#fbf6ea]">
            <Gift className="h-[18px] w-[18px]" strokeWidth={1.75} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-neutral-900">Primeiro acesso?</span>
            <span className="mt-0.5 block text-xs leading-5 text-neutral-500">
              Toque em <strong className="font-semibold text-neutral-800">Criar conta</strong> para
              ter acesso ao seu crédito.
            </span>
          </span>
          <ArrowRight className="h-4 w-4 shrink-0 text-neutral-400" />
        </button>
      )}

      <form
        onSubmit={enviar}
        className="club-entra glass-claro mt-2 space-y-4 p-6"
        style={{ animationDelay: "120ms" }}
      >
        <div className="flex gap-1 rounded-2xl bg-[#2a2118]/[0.06] p-1">
          {(["entrar", "criar"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setModo(m)}
              className={cn(
                "flex-1 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                modo === m
                  ? "bg-white text-neutral-900 shadow-sm"
                  : "text-neutral-500 hover:text-neutral-900",
              )}
            >
              {m === "entrar" ? "Já tenho conta" : "Criar conta"}
            </button>
          ))}
        </div>

        {/* Nome e telefone só no cadastro: é por eles que o sistema reconhece
            quem já é paciente da NÓS. Depois, entrar é e-mail e senha. */}
        {modo === "criar" ? (
          <>
            <div className="club-entra">
              <Label htmlFor="club-nome" className="text-neutral-600">
                Seu nome
              </Label>
              <Input
                id="club-nome"
                required
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Como está na clínica"
                className="mt-1 h-11 rounded-xl border-white/80 bg-white/70 text-neutral-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] placeholder:text-neutral-300 focus-visible:bg-white"
              />
            </div>
            <div className="club-entra">
              <Label htmlFor="club-telefone" className="text-neutral-600">
                Seu telefone
              </Label>
              <Input
                id="club-telefone"
                required
                inputMode="tel"
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
                placeholder="(48) 99999-0000"
                className="mt-1 h-11 rounded-xl border-white/80 bg-white/70 text-neutral-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] placeholder:text-neutral-300 focus-visible:bg-white"
              />
              <p className="mt-1.5 text-xs text-neutral-500">
                O mesmo que você deu na clínica — é por ele que a gente encontra seu cadastro.
              </p>
            </div>
          </>
        ) : null}

        <div>
          <Label htmlFor="club-email" className="text-neutral-600">
            E-mail
          </Label>
          <Input
            id="club-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 h-11 rounded-xl border-white/80 bg-white/70 text-neutral-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] placeholder:text-neutral-300 focus-visible:bg-white"
            placeholder="voce@email.com"
          />
        </div>

        <div>
          <Label htmlFor="club-senha" className="text-neutral-600">
            Senha
          </Label>
          <Input
            id="club-senha"
            type="password"
            required
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            className="mt-1 h-11 rounded-xl border-white/80 bg-white/70 text-neutral-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] focus-visible:bg-white"
          />
        </div>

        <Button
          type="submit"
          disabled={carregando}
          className="h-12 w-full rounded-2xl bg-[#1c1814] text-base font-semibold text-[#fbf6ea] shadow-[0_14px_28px_-14px_rgba(28,24,20,0.6)] transition-[transform,box-shadow] hover:-translate-y-0.5 hover:bg-[#2a2118] hover:shadow-[0_18px_32px_-14px_rgba(28,24,20,0.65)]"
        >
          {carregando ? "Um instante…" : modo === "entrar" ? "Entrar" : "Entrar no Club"}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </form>

      <p
        className="club-entra mt-6 text-center text-xs text-neutral-400"
        style={{ animationDelay: "220ms" }}
      >
        Seus créditos, suas indicações e seu nível, sempre à mão.
      </p>
    </Fundo>
  );
}

/** O que cada recusa do servidor quer dizer para quem está com o cartão na
 *  mão. Nenhuma delas entrega informação sobre a base: "não achei" é igual
 *  para quem não é paciente e para quem errou o telefone. */
const MOTIVOS: Record<string, string> = {
  sem_cadastro:
    "Não encontramos seu cadastro com esse nome e telefone. Confira os dois, ou fale com a recepção da NÓS.",
  ja_tem_conta: "Já existe uma conta para este cadastro. Use a opção de entrar.",
  email_em_uso: "Este e-mail já tem conta. Use a opção de entrar.",
  falhou: "Não deu para criar sua conta agora. Tente de novo em instantes.",
};

/**
 * A função do painel não existe (ainda).
 *
 * Acontece na janela entre o deploy e a migration — o Lovable aplica as duas
 * em passos separados. Dizer isso em voz alta é melhor que a tela genérica:
 * quem abre é a própria clínica, testando.
 */
function AindaNaoPronto() {
  return (
    <Fundo>
      <Marca />
      <div
        className="club-entra glass-claro mt-8 p-6 text-center"
        style={{ animationDelay: "80ms" }}
      >
        <Sparkles className="mx-auto h-7 w-7 text-neutral-600" strokeWidth={1.5} />
        <p className="mt-3 font-medium">O Club está quase pronto</p>
        <p className="mt-1 text-sm text-neutral-500">
          Estamos terminando de preparar sua área. Tente de novo em alguns minutos.
        </p>
        <Button
          variant="ghost"
          className="mt-4 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
          onClick={() => supabase.auth.signOut()}
        >
          <LogOut className="h-4 w-4" /> Sair
        </Button>
      </div>
    </Fundo>
  );
}

function SemCadastro({ motivo }: { motivo: string }) {
  const texto =
    motivo === "ambiguo"
      ? "Encontramos mais de um cadastro com este e-mail. Fale com a recepção para a gente acertar isso."
      : "Não encontramos um cadastro com este e-mail. Fale com a recepção da NÓS — em um minuto eles acertam, e seu Club abre aqui.";
  return (
    <Fundo>
      <Marca />
      <div
        className="club-entra glass-claro mt-8 p-6 text-center"
        style={{ animationDelay: "80ms" }}
      >
        <Gift className="mx-auto h-7 w-7 text-neutral-600" strokeWidth={1.5} />
        <p className="mt-3 font-medium">Falta ligar seu cadastro</p>
        <p className="mt-1 text-sm text-neutral-500">{texto}</p>
        <Button
          variant="ghost"
          className="mt-4 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
          onClick={() => supabase.auth.signOut()}
        >
          <LogOut className="h-4 w-4" /> Sair
        </Button>
      </div>
    </Fundo>
  );
}

// ── O painel ──────────────────────────────────────────────────────────────

/**
 * O material do cartão, por POSIÇÃO na régua — não por nome.
 *
 * A clínica pediu assim: o primeiro é bege com textura de veludo, o segundo
 * prateado, o terceiro dourado e o quarto holográfico leve.
 *
 * Por posição porque a régua é editável: renomear "Premium" para "Platinum"
 * não pode deixar o cartão sem material, e um quinto nível volta ao começo em
 * vez de aparecer sem nada. As texturas estão em `styles.css`, em gradiente e
 * não em imagem — a página abre no 4G de uma sala de espera.
 */
const MATERIAIS = ["cartao-velvet", "cartao-prata", "cartao-ouro", "cartao-holo"];

/** Antes do primeiro nível, o mesmo veludo do primeiro: quem está com o cartão
 *  na mão já é do Club. O que muda ao chegar no Start é o nome escrito nele —
 *  um cartão cinza de espera fazia a pessoa achar que o Start é que era cinza. */
const SEM_NIVEL = "cartao-sem-nivel";

function Painel({ dados }: { dados: PainelDoPaciente }) {
  const regua = dados.regua ?? [];
  const s = situacaoNoClub(dados.confirmadas ?? 0, regua);
  // -1 enquanto ela não chega ao primeiro nível: o cartão existe e ainda não
  // ganhou material.
  const indice = regua.findIndex((n) => n.id === s.nivel?.id);
  const material = indice < 0 ? SEM_NIVEL : MATERIAIS[indice % MATERIAIS.length];
  const porIndicacao = Number(dados.por_indicacao ?? 100);
  const indicacoes = dados.indicacoes ?? [];
  const primeiroNome = String(dados.nome ?? "").split(" ")[0];

  const compartilhar = async () => {
    const texto = convite({
      deQuem: primeiroNome,
      valor: porIndicacao,
      link: linkDoClube(dados.link_do_cartao),
    });
    try {
      // `navigator.share` abre a folha do celular — com o WhatsApp em primeiro,
      // que é onde isto vai de fato. No computador não existe, e aí a mensagem
      // vai para a área de transferência.
      if (navigator.share) await navigator.share({ text: texto });
      else {
        await navigator.clipboard.writeText(texto);
        toast.success("Mensagem copiada. É só colar no WhatsApp de quem você quer indicar.");
      }
    } catch {
      /* a pessoa fechou a folha de compartilhamento */
    }
  };

  return (
    <Fundo>
      <header className="club-entra flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.18em] text-neutral-400">NÓS Club</p>
          <h1 className="truncate text-xl font-semibold">Olá, {primeiroNome}</h1>
        </div>
        <button
          type="button"
          onClick={() => supabase.auth.signOut()}
          aria-label="Sair"
          className="grid h-10 w-10 place-items-center rounded-full bg-white text-neutral-400 shadow-sm ring-1 ring-neutral-200 hover:text-neutral-900"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </header>

      {/* O cartão. É a tela inteira do ponto de vista de quem abre: nível,
          quanto falta, e o saldo. */}
      <section
        className={cn(
          "club-entra club-cartao relative mt-6 overflow-hidden rounded-[28px] p-6",
          material,
        )}
        style={{ animationDelay: "60ms" }}
      >
        <div className="relative z-10">
          <p className="text-xs uppercase tracking-[0.18em] opacity-70">Seu nível</p>
          <p className="mt-1 text-4xl font-semibold tracking-tight">{s.nivel?.nome ?? "Membro"}</p>

          <div className="mt-5">
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-black/15">
              <div
                className="club-barra h-full rounded-full bg-current opacity-85"
                style={{ ["--ate" as string]: `${Math.round(s.progresso * 100)}%` }}
              />
            </div>
            <p className="mt-2 text-sm opacity-80">
              {s.proximo ? (
                <>
                  <strong>{s.confirmadas}</strong> de {s.proximo.indicacoes} — faltam{" "}
                  <strong>{s.faltam}</strong> para {s.proximo.nome}
                </>
              ) : (
                <>Você chegou ao topo do Club 🎉</>
              )}
            </p>
          </div>
        </div>
        <div className="club-brilho pointer-events-none absolute inset-0 z-0" aria-hidden />
      </section>

      <section
        className="club-entra glass-claro mt-4 flex items-center justify-between p-5"
        style={{ animationDelay: "120ms" }}
      >
        <div>
          <p className="text-xs uppercase tracking-wider text-neutral-500">Créditos NÓS</p>
          <p className="mt-0.5 text-3xl font-semibold">{formatBRL(dados.saldo ?? 0)}</p>
          <p className="mt-0.5 text-xs text-neutral-500">para usar nos seus procedimentos</p>
        </div>
        <Gift className="h-8 w-8 text-neutral-300" strokeWidth={1.25} />
      </section>

      <button
        type="button"
        onClick={compartilhar}
        className="club-entra club-pulsa mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-neutral-900 text-base font-semibold text-white"
        style={{ animationDelay: "180ms" }}
      >
        <Share2 className="h-5 w-5" /> Indicar alguém
      </button>

      <section className="club-entra glass-claro mt-4 p-5" style={{ animationDelay: "210ms" }}>
        <h2 className="text-sm font-semibold">Como funciona</h2>
        <ol className="mt-3 space-y-3">
          <ComoFunciona numero="1" titulo={`Indique alguém e ganhe ${formatBRL(porIndicacao)}`}>
            O crédito entra quando a pessoa que você indicou vem à clínica e é atendida.
          </ComoFunciona>
          <ComoFunciona numero="2" titulo="A cada indicação você sobe">
            {regua.length ? (
              <>
                {regua.map((n, i) => (
                  <span key={n.id}>
                    {i > 0 ? ", " : ""}
                    <strong>{n.indicacoes}</strong> = {n.nome}
                  </span>
                ))}
                . Cada nível novo tem um cartão diferente aqui na sua tela.
              </>
            ) : (
              <>Quanto mais indicações confirmadas, mais alto o seu nível.</>
            )}
          </ComoFunciona>
          <ComoFunciona numero="3" titulo="Use quando quiser">
            Seus Créditos NÓS valem em procedimentos de saúde e estética. É só avisar na recepção.
          </ComoFunciona>
        </ol>
      </section>

      <section className="club-entra mt-8" style={{ animationDelay: "240ms" }}>
        <h2 className="text-xs uppercase tracking-[0.18em] text-neutral-400">Minhas indicações</h2>
        {indicacoes.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-500">
            Nenhuma ainda. Indique alguém e acompanhe por aqui.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {indicacoes.map((i, idx) => (
              <li
                key={`${i.nome}-${idx}`}
                className="glass-claro flex items-center justify-between gap-3 px-4 py-3"
              >
                <span className="min-w-0 truncate text-sm">{i.nome}</span>
                {i.status === "confirmada" ? (
                  <span className="flex shrink-0 items-center gap-1.5 text-xs text-emerald-600">
                    <Check className="h-3.5 w-3.5" /> Já veio
                  </span>
                ) : (
                  <span className="flex shrink-0 items-center gap-1.5 text-xs text-amber-600">
                    <Clock className="h-3.5 w-3.5" /> Aguardando
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {(dados.extrato ?? []).length > 0 ? (
        <section className="club-entra mt-8 pb-10" style={{ animationDelay: "300ms" }}>
          <h2 className="text-xs uppercase tracking-[0.18em] text-neutral-400">Meus créditos</h2>
          <ul className="mt-3 space-y-2">
            {(dados.extrato ?? []).map((l, idx) => (
              <li
                key={`${l.descricao}-${idx}`}
                className="flex items-center justify-between gap-3 px-1 py-1.5"
              >
                <span className="min-w-0 truncate text-sm text-neutral-600">{l.descricao}</span>
                <span
                  className={cn(
                    "shrink-0 text-sm font-semibold tabular-nums",
                    Number(l.valor) > 0 ? "text-emerald-600" : "text-neutral-500",
                  )}
                >
                  {Number(l.valor) > 0 ? "+" : "−"}
                  {formatBRL(Math.abs(Number(l.valor)))}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="club-entra flex items-center justify-center gap-1.5 pb-10 pt-4 text-xs text-neutral-300">
        <TrendingUp className="h-3.5 w-3.5" />
        Quanto mais NÓS, mais benefícios
      </div>
    </Fundo>
  );
}

function ComoFunciona({
  numero,
  titulo,
  children,
}: {
  numero: string;
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-neutral-900 text-2xs font-semibold text-white">
        {numero}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{titulo}</span>
        <span className="mt-0.5 block text-xs leading-5 text-neutral-500">{children}</span>
      </span>
    </li>
  );
}

/**
 * O endereço do Club para mandar a alguém.
 *
 * O que a clínica salvou manda; só na falta dele vale o endereço por onde esta
 * pessoa abriu. Importa porque a mensagem sai do celular dela para um
 * desconhecido: um link de prévia ali é um convite que morre sozinho.
 */
function linkDoClube(doCartao?: string | null): string {
  const base =
    String(doCartao ?? "").trim() || (typeof window === "undefined" ? "" : window.location.origin);
  return base ? `${base}/club` : "";
}
