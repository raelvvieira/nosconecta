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
export const Route = createFileRoute("/club")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "NÓS Club" },
      { name: "description", content: "Seu nível, suas indicações e seus créditos na NÓS." },
      // O cartão é lido no celular, sempre. A cor da barra do navegador junto
      // do fundo escuro é o que faz a página parecer um app, e não um site.
      { name: "theme-color", content: "#17151c" },
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
        <p className="text-sm text-white/60">Abrindo seu Club…</p>
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
    <div className="club-fundo min-h-dvh w-full px-5 py-8 text-white">
      <div className="mx-auto w-full max-w-[460px]">{children}</div>
    </div>
  );
}

function Marca({ legenda }: { legenda?: string }) {
  return (
    <div className="club-entra flex flex-col items-center text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/20 backdrop-blur">
        <Sparkles className="h-6 w-6" strokeWidth={1.5} />
      </span>
      <h1 className="mt-4 text-[1.75rem] font-semibold tracking-tight">NÓS Club</h1>
      {legenda ? <p className="mt-1 text-sm text-white/60">{legenda}</p> : null}
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
      <div className="pt-6">
        <Marca legenda="Quanto mais NÓS, mais benefícios." />
      </div>

      <form
        onSubmit={enviar}
        className="club-entra glass-escuro mt-8 space-y-4 p-6"
        style={{ animationDelay: "80ms" }}
      >
        <div className="flex gap-1 rounded-2xl bg-white/5 p-1">
          {(["entrar", "criar"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setModo(m)}
              className={cn(
                "flex-1 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                modo === m ? "bg-white text-neutral-900" : "text-white/60 hover:text-white",
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
              <Label htmlFor="club-nome" className="text-white/70">
                Seu nome
              </Label>
              <Input
                id="club-nome"
                required
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Como está na clínica"
                className="mt-1 border-white/15 bg-white/5 text-white placeholder:text-white/30"
              />
            </div>
            <div className="club-entra">
              <Label htmlFor="club-telefone" className="text-white/70">
                Seu telefone
              </Label>
              <Input
                id="club-telefone"
                required
                inputMode="tel"
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
                placeholder="(48) 99999-0000"
                className="mt-1 border-white/15 bg-white/5 text-white placeholder:text-white/30"
              />
              <p className="mt-1.5 text-xs text-white/50">
                O mesmo que você deu na clínica — é por ele que a gente encontra seu cadastro.
              </p>
            </div>
          </>
        ) : null}

        <div>
          <Label htmlFor="club-email" className="text-white/70">
            E-mail
          </Label>
          <Input
            id="club-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 border-white/15 bg-white/5 text-white placeholder:text-white/30"
            placeholder="voce@email.com"
          />
        </div>

        <div>
          <Label htmlFor="club-senha" className="text-white/70">
            Senha
          </Label>
          <Input
            id="club-senha"
            type="password"
            required
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            className="mt-1 border-white/15 bg-white/5 text-white"
          />
        </div>

        <Button
          type="submit"
          disabled={carregando}
          className="h-12 w-full rounded-2xl bg-white text-base font-semibold text-neutral-900 hover:bg-white/90"
        >
          {carregando ? "Um instante…" : modo === "entrar" ? "Entrar" : "Entrar no Club"}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </form>

      <p
        className="club-entra mt-6 text-center text-xs text-white/40"
        style={{ animationDelay: "160ms" }}
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
        className="club-entra glass-escuro mt-8 p-6 text-center"
        style={{ animationDelay: "80ms" }}
      >
        <Sparkles className="mx-auto h-7 w-7 text-white/70" strokeWidth={1.5} />
        <p className="mt-3 font-medium">O Club está quase pronto</p>
        <p className="mt-1 text-sm text-white/60">
          Estamos terminando de preparar sua área. Tente de novo em alguns minutos.
        </p>
        <Button
          variant="ghost"
          className="mt-4 text-white/60 hover:bg-white/10 hover:text-white"
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
        className="club-entra glass-escuro mt-8 p-6 text-center"
        style={{ animationDelay: "80ms" }}
      >
        <Gift className="mx-auto h-7 w-7 text-white/70" strokeWidth={1.5} />
        <p className="mt-3 font-medium">Falta ligar seu cadastro</p>
        <p className="mt-1 text-sm text-white/60">{texto}</p>
        <Button
          variant="ghost"
          className="mt-4 text-white/60 hover:bg-white/10 hover:text-white"
          onClick={() => supabase.auth.signOut()}
        >
          <LogOut className="h-4 w-4" /> Sair
        </Button>
      </div>
    </Fundo>
  );
}

// ── O painel ──────────────────────────────────────────────────────────────

/** Uma cor por posição na régua, não por nome: um nível renomeado continua
 *  bonito, e um quinto nível não fica sem cor. */
const CORES = [
  "from-sky-400/80 to-blue-600/80",
  "from-fuchsia-400/80 to-purple-600/80",
  "from-amber-300/80 to-orange-500/80",
  "from-cyan-200/80 to-indigo-400/80",
];

function Painel({ dados }: { dados: PainelDoPaciente }) {
  const regua = dados.regua ?? [];
  const s = situacaoNoClub(dados.confirmadas ?? 0, regua);
  const indice = Math.max(
    0,
    regua.findIndex((n) => n.id === s.nivel?.id),
  );
  const indicacoes = dados.indicacoes ?? [];
  const primeiroNome = String(dados.nome ?? "").split(" ")[0];

  const compartilhar = async () => {
    const texto =
      "Eu faço parte do NÓS Club, da NÓS Odontologia. Se você marcar uma avaliação, diz que fui eu que te indiquei. 😉";
    try {
      if (navigator.share) await navigator.share({ text: texto });
      else {
        await navigator.clipboard.writeText(texto);
        toast.success("Mensagem copiada. É só mandar para quem você quer indicar.");
      }
    } catch {
      /* a pessoa fechou a folha de compartilhamento */
    }
  };

  return (
    <Fundo>
      <header className="club-entra flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.18em] text-white/40">NÓS Club</p>
          <h1 className="truncate text-xl font-semibold">Olá, {primeiroNome}</h1>
        </div>
        <button
          type="button"
          onClick={() => supabase.auth.signOut()}
          aria-label="Sair"
          className="grid h-10 w-10 place-items-center rounded-full bg-white/5 text-white/50 ring-1 ring-white/10 hover:text-white"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </header>

      {/* O cartão. É a tela inteira do ponto de vista de quem abre: nível,
          quanto falta, e o saldo. */}
      <section
        className={cn(
          "club-entra club-cartao relative mt-6 overflow-hidden rounded-[28px] bg-gradient-to-br p-6 ring-1 ring-white/20",
          CORES[indice % CORES.length],
        )}
        style={{ animationDelay: "60ms" }}
      >
        <div className="relative z-10">
          <p className="text-xs uppercase tracking-[0.18em] text-white/70">Seu nível</p>
          <p className="mt-1 text-4xl font-semibold tracking-tight">{s.nivel?.nome ?? "Membro"}</p>

          <div className="mt-5">
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-black/25">
              <div
                className="club-barra h-full rounded-full bg-white"
                style={{ ["--ate" as string]: `${Math.round(s.progresso * 100)}%` }}
              />
            </div>
            <p className="mt-2 text-sm text-white/80">
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
        className="club-entra glass-escuro mt-4 flex items-center justify-between p-5"
        style={{ animationDelay: "120ms" }}
      >
        <div>
          <p className="text-xs uppercase tracking-wider text-white/50">Créditos NÓS</p>
          <p className="mt-0.5 text-3xl font-semibold">{formatBRL(dados.saldo ?? 0)}</p>
          <p className="mt-0.5 text-xs text-white/50">para usar nos seus procedimentos</p>
        </div>
        <Gift className="h-8 w-8 text-white/30" strokeWidth={1.25} />
      </section>

      <button
        type="button"
        onClick={compartilhar}
        className="club-entra club-pulsa mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-white text-base font-semibold text-neutral-900"
        style={{ animationDelay: "180ms" }}
      >
        <Share2 className="h-5 w-5" /> Indicar alguém
      </button>

      <section className="club-entra mt-8" style={{ animationDelay: "240ms" }}>
        <h2 className="text-xs uppercase tracking-[0.18em] text-white/40">Minhas indicações</h2>
        {indicacoes.length === 0 ? (
          <p className="mt-3 text-sm text-white/50">
            Nenhuma ainda. Indique alguém e acompanhe por aqui.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {indicacoes.map((i, idx) => (
              <li
                key={`${i.nome}-${idx}`}
                className="glass-escuro flex items-center justify-between gap-3 px-4 py-3"
              >
                <span className="min-w-0 truncate text-sm">{i.nome}</span>
                {i.status === "confirmada" ? (
                  <span className="flex shrink-0 items-center gap-1.5 text-xs text-emerald-300">
                    <Check className="h-3.5 w-3.5" /> Já veio
                  </span>
                ) : (
                  <span className="flex shrink-0 items-center gap-1.5 text-xs text-amber-200/80">
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
          <h2 className="text-xs uppercase tracking-[0.18em] text-white/40">Meus créditos</h2>
          <ul className="mt-3 space-y-2">
            {(dados.extrato ?? []).map((l, idx) => (
              <li
                key={`${l.descricao}-${idx}`}
                className="flex items-center justify-between gap-3 px-1 py-1.5"
              >
                <span className="min-w-0 truncate text-sm text-white/70">{l.descricao}</span>
                <span
                  className={cn(
                    "shrink-0 text-sm font-semibold tabular-nums",
                    Number(l.valor) > 0 ? "text-emerald-300" : "text-white/50",
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

      <div className="club-entra flex items-center justify-center gap-1.5 pb-10 pt-4 text-xs text-white/30">
        <TrendingUp className="h-3.5 w-3.5" />
        Quanto mais NÓS, mais benefícios
      </div>
    </Fundo>
  );
}
