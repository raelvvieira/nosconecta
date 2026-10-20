import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Lock, Phone, ShieldAlert, Sparkles, User } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { NIVEIS } from "@/lib/auth/niveis-de-acesso";
import { ESPECIALIDADES } from "@/lib/settings/especialidades";
import { cn } from "@/lib/utils";
import { convitePublico } from "@/lib/settings/pessoal.functions";

/**
 * A página do convite.
 *
 * ── Por que ela substitui o cadastro aberto ──────────────────────────────
 *
 * Antes qualquer pessoa com o endereço `/cadastro-equipe` criava uma conta e
 * entrava numa fila de aprovação, onde um administrador escolhia o nível. Dois
 * passos, e o primeiro aberto para o mundo.
 *
 * Agora o nível é escolhido ANTES, por quem convida, e viaja dentro do link.
 * Quem abre preenche só o que é dela — nome, telefone, senha e em que unidades
 * atende — e já entra no nível certo. Decisão da clínica em 20/10.
 *
 * Rota pública, como `/auth`: sem loader autenticado, e fora do
 * `MembershipGate` (ver a lista de isenções lá).
 */
export const Route = createFileRoute("/convite/$token")({
  ssr: false,
  head: () => ({ meta: [{ title: "Convite · NÓS Conecta" }] }),
  component: ConvitePage,
});

function ConvitePage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const buscar = useServerFn(convitePublico);

  const convite = useQuery({
    queryKey: ["convite", token],
    queryFn: () => buscar({ data: { token } }),
    retry: false,
  });

  const [nome, setNome] = useState("");
  const [sobrenome, setSobrenome] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [unidades, setUnidades] = useState<string[]>([]);
  // A ficha clínica, preenchida pela própria pessoa. Decisão da clínica em
  // 20/10: CRO, especialidades e cor são dados DELA. A comissão não entra
  // aqui — é combinação comercial, e quem define é quem administra.
  const [atende, setAtende] = useState(false);
  const [cro, setCro] = useState("");
  const [especialidades, setEspecialidades] = useState<string[]>([]);
  const [cor, setCor] = useState("#8B5CF6");
  const [salvando, setSalvando] = useState(false);
  const [marcouAtende, setMarcouAtende] = useState(false);
  const [aguardandoEmail, setAguardandoEmail] = useState(false);

  const nivel = NIVEIS.find((n) => n.valor === convite.data?.nivel);

  // Convite de Dentista chega com "atendo pacientes" já marcado — é o que o
  // nível quer dizer. Quem administra também pode atender (é o caso da Dra.
  // Mariane), então a chave existe para todos e começa desligada nos outros.
  // `marcouAtende` guarda se a pessoa já mexeu, para a resposta do convite
  // chegando depois não desfazer a escolha dela.
  if (!marcouAtende && convite.data?.nivel === "dentist" && !atende) {
    setMarcouAtende(true);
    setAtende(true);
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const nomeCompleto = `${nome.trim()} ${sobrenome.trim()}`.trim();
    if (!nomeCompleto) return toast.error("Preencha seu nome.");
    if (senha.length < 8) return toast.error("A senha precisa ter pelo menos 8 caracteres.");
    if (senha !== confirmacao) return toast.error("As senhas não conferem.");
    if (!unidades.length && convite.data?.nivel !== "admin") {
      return toast.error("Escolha ao menos uma unidade.");
    }

    setSalvando(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password: senha,
      options: { data: { full_name: nomeCompleto, phone: telefone } },
    });

    if (error) {
      setSalvando(false);
      toast.error(
        error.message === "User already registered"
          ? "Já existe uma conta com este e-mail. Entre e peça o convite de novo."
          : error.message,
      );
      return;
    }

    // Confirmação de e-mail ligada no projeto: sem sessão, nada pode ser
    // gravado ainda. O convite continua valendo — ele só é consumido no
    // aceite —, então a pessoa confirma o e-mail e volta pelo mesmo link.
    if (!data.session) {
      setSalvando(false);
      setAguardandoEmail(true);
      return;
    }

    await aceitar();
  }

  async function aceitar() {
    const nomeCompleto = `${nome.trim()} ${sobrenome.trim()}`.trim();
    // Direto na função do banco: ela é `SECURITY DEFINER` e é o único caminho
    // por onde nasce um acesso já ativo e com nível. O nível vem do convite,
    // lido lá dentro — nada do que esta tela manda escolhe isso.
    // `as any` na chamada: `types.ts` é gerado pelo Lovable e só conhece a
    // função depois que a migration rodar lá. Mesmo escape que o resto do
    // projeto usa para tabela e coluna novas.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: r, error } = await (supabase as any).rpc("aceitar_convite", {
      _token: token,
      _nome: nomeCompleto,
      _telefone: telefone,
      _unidades: unidades,
      _atende: atende,
      _cro: cro,
      _especialidades: especialidades,
      _cor: cor,
    });
    setSalvando(false);

    const resposta = (r ?? {}) as { ok?: boolean; motivo?: string };
    if (error || !resposta.ok) {
      toast.error(
        resposta.motivo === "ja_tem_acesso"
          ? "Esta conta já tem acesso à clínica."
          : resposta.motivo === "convite_invalido"
            ? "Este convite não vale mais. Peça um novo."
            : "Não foi possível concluir. Tente novamente.",
      );
      return;
    }
    toast.success("Pronto! Seu acesso já está liberado.");
    navigate({ to: "/inicio", replace: true });
  }

  if (convite.isPending) {
    return (
      <Moldura>
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <p className="mt-3 text-sm text-muted-foreground">Verificando o convite…</p>
      </Moldura>
    );
  }

  if (!convite.data?.ok) {
    return (
      <Moldura>
        <ShieldAlert className="h-7 w-7 text-destructive" />
        <h1 className="mt-3 text-lg font-semibold">Convite inválido ou vencido</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Convites valem por 7 dias e servem para uma pessoa só. Peça um link novo para quem
          administra a clínica.
        </p>
      </Moldura>
    );
  }

  if (aguardandoEmail) {
    return (
      <Moldura>
        <CheckCircle2 className="h-7 w-7 text-success" />
        <h1 className="mt-3 text-lg font-semibold">Confirme seu e-mail</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Mandamos um link de confirmação para <strong>{email}</strong>. Depois de confirmar, volte
          a abrir este mesmo convite para terminar — ele continua valendo.
        </p>
      </Moldura>
    );
  }

  return (
    <div className="min-h-dvh w-full bg-surface-subtle px-4 py-10">
      <div className="mx-auto w-full max-w-[460px]">
        <div className="mb-7 flex flex-col items-center text-center">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-primary text-white">
            <Sparkles className="h-5 w-5" />
          </span>
          <h1 className="mt-3 text-xl font-semibold">
            {convite.data.convidadoNome
              ? `Olá, ${convite.data.convidadoNome.split(" ")[0]}!`
              : "Bem-vindo à NÓS"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Seu acesso já está definido como <strong>{nivel?.rotulo}</strong>. {nivel?.resumo}
          </p>
        </div>

        <form className="surface-card space-y-4 p-6" onSubmit={enviar}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="nome">Nome</Label>
              <Input
                id="nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                required
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="sobrenome">Sobrenome</Label>
              <Input
                id="sobrenome"
                value={sobrenome}
                onChange={(e) => setSobrenome(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="email">E-mail</Label>
            <div className="relative mt-1">
              <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="pl-9"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="telefone">Telefone</Label>
            <div className="relative mt-1">
              <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="telefone"
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
                placeholder="(48) 99999-0000"
                className="pl-9"
              />
            </div>
          </div>

          {convite.data.nivel === "admin" ? null : (
            <div>
              <Label>Onde você atende</Label>
              <div className="mt-2 space-y-2">
                {convite.data.unidades.map((u) => (
                  <label key={u.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate">{u.nome}</span>
                    <Switch
                      checked={unidades.includes(u.id)}
                      onCheckedChange={(v) =>
                        setUnidades((atual) =>
                          v ? [...new Set([...atual, u.id])] : atual.filter((x) => x !== u.id),
                        )
                      }
                    />
                  </label>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Pode marcar mais de uma. Dá para mudar depois com quem administra.
              </p>
            </div>
          )}

          <div className="rounded-xl border border-border p-3">
            <label className="flex items-center justify-between gap-3 text-sm font-medium">
              Atendo pacientes
              <Switch
                checked={atende}
                onCheckedChange={(v) => {
                  setMarcouAtende(true);
                  setAtende(v === true);
                }}
              />
            </label>
            <p className="mt-1 text-xs text-muted-foreground">
              Ligue se você vai aparecer na agenda como profissional. Quem só usa o sistema deixa
              desligado.
            </p>

            {atende ? (
              <div className="mt-4 space-y-4 border-t border-border pt-4">
                <div>
                  <Label htmlFor="cro">Registro (CRO)</Label>
                  <Input
                    id="cro"
                    value={cro}
                    onChange={(e) => setCro(e.target.value)}
                    placeholder="CRO-SC 12345"
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label>Especialidades</Label>
                  <p className="mt-0.5 text-xs text-muted-foreground">Pode marcar mais de uma.</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {ESPECIALIDADES.map((e) => {
                      const marcada = especialidades.includes(e);
                      return (
                        <button
                          key={e}
                          type="button"
                          onClick={() =>
                            setEspecialidades((atual) =>
                              marcada ? atual.filter((x) => x !== e) : [...atual, e],
                            )
                          }
                          className={cn(
                            "rounded-full border px-3 py-1.5 text-xs transition-colors",
                            marcada
                              ? "border-transparent bg-foreground text-white"
                              : "border-border bg-white text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {e}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <Label htmlFor="cor">Sua cor na agenda</Label>
                  <Input
                    id="cor"
                    type="color"
                    value={cor}
                    onChange={(e) => setCor(e.target.value)}
                    className="mt-1 h-10 w-20 p-1"
                  />
                </div>
              </div>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="senha">Senha</Label>
              <div className="relative mt-1">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="senha"
                  type="password"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  required
                  className="pl-9"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="confirmacao">Repita a senha</Label>
              <Input
                id="confirmacao"
                type="password"
                value={confirmacao}
                onChange={(e) => setConfirmacao(e.target.value)}
                required
                className="mt-1"
              />
            </div>
          </div>

          <Button type="submit" variant="premium" className="w-full" disabled={salvando}>
            {salvando ? "Criando seu acesso…" : "Criar meu acesso"}
          </Button>
        </form>
      </div>
    </div>
  );
}

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh w-full place-items-center bg-surface-subtle px-4">
      <div className="surface-card flex w-full max-w-[420px] flex-col items-center p-8 text-center">
        {children}
      </div>
    </div>
  );
}
