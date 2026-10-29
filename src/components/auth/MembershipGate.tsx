import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Loader2, LogOut, ShieldAlert, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { getMembershipStatus } from "@/lib/auth/membership.functions";
import type { MemberRole } from "@/lib/auth/clinic-context.middleware";
import { ROTA_INICIAL, podeAbrir, type RecursosDoConsultorio } from "@/lib/auth/niveis-de-acesso";

/**
 * Rotas que existem antes/fora de ter uma matrícula aprovada — nunca passam
 * pelo gate, mesmo autenticadas. `/auth` já é tratada pelo `AuthGate`; esta
 * lista cobre as que também precisam ficar de fora do `MembershipGate`.
 */
// `/club` entra aqui porque o paciente é exatamente o que este portão barra:
// alguém autenticado que NÃO é da equipe. Ver o comentário em `club.tsx`.
// `/comecar` cria o consultório de quem ainda não tem nenhum.
const MEMBERSHIP_EXEMPT_PREFIXES = ["/auth", "/convite", "/club", "/comecar"];

export function MembershipGate({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const exempt = MEMBERSHIP_EXEMPT_PREFIXES.some((p) => pathname.startsWith(p));

  if (exempt) return <>{children}</>;
  return <MembershipCheck>{children}</MembershipCheck>;
}

function MembershipCheck({ children }: { children: ReactNode }) {
  const fetchStatus = useServerFn(getMembershipStatus);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const query = useQuery({
    queryKey: ["membership-status"],
    queryFn: () => fetchStatus(),
    // Um acesso pode ser reativado a qualquer momento — sem isto a pessoa
    // ficaria presa na tela de aviso mesmo depois de resolvido.
    refetchInterval: 15_000,
    retry: false,
  });

  async function handleSignOut() {
    await supabase.auth.signOut();
    window.location.href = "/auth";
  }

  if (query.isLoading) {
    return <GateScreen icon={<Loader2 className="h-6 w-6 animate-spin" />} title="Carregando…" />;
  }

  if (query.isError) {
    return (
      <GateScreen
        icon={<ShieldAlert className="h-6 w-6 text-destructive" />}
        title="Não foi possível verificar seu acesso"
        description="Tente novamente em instantes."
        actions={
          <Button variant="premium" onClick={() => query.refetch()}>
            Tentar novamente
          </Button>
        }
        onSignOut={handleSignOut}
      />
    );
  }

  const status = query.data;

  if (status === undefined) {
    return <GateScreen icon={<Loader2 className="h-6 w-6 animate-spin" />} title="Carregando…" />;
  }

  // Conta autenticada sem linha em `clinic_members`: desde 20/10 o acesso é só
  // por convite, então isto quer dizer "criou conta por fora" — não há mais
  // autocadastro para concluir.
  if (status === null) {
    return (
      <GateScreen
        icon={<ShieldAlert className="h-6 w-6 text-destructive" />}
        title="Sua conta não está vinculada a nenhum consultório"
        description="Para entrar na equipe de um consultório, peça um link para quem o administra e abra com esta conta. Para começar o seu, teste 14 dias grátis."
        actions={
          <Button variant="premium" asChild>
            <a href="/comecar">Criar meu consultório</a>
          </Button>
        }
        onSignOut={handleSignOut}
      />
    );
  }

  if (status.status === "pending") {
    return (
      <GateScreen
        icon={<Sparkles className="h-6 w-6 text-coral" />}
        title="Cadastro em análise"
        description={`${status.name ? `Olá, ${status.name}. ` : ""}Seu acesso foi enviado para aprovação. Assim que o administrador aprovar seu papel e sua unidade, esta tela libera sozinha.`}
        onSignOut={handleSignOut}
      />
    );
  }

  if (status.status === "rejected") {
    return (
      <GateScreen
        icon={<ShieldAlert className="h-6 w-6 text-destructive" />}
        title="Cadastro não aprovado"
        description="O administrador não aprovou seu acesso a esta clínica. Fale com ele se achar que isso é um engano."
        onSignOut={handleSignOut}
      />
    );
  }

  if (status.status === "disabled") {
    return (
      <GateScreen
        icon={<ShieldAlert className="h-6 w-6 text-destructive" />}
        title="Acesso desativado"
        description="Seu acesso a esta clínica foi desativado. Fale com o administrador se achar que isso é um engano."
        onSignOut={handleSignOut}
      />
    );
  }

  // ── O consultório parou ───────────────────────────────────────────────
  //
  // Teste vencido ou suspenso pela plataforma: o sistema inteiro fecha numa
  // tela só, e nada sai (a assistente e as rotinas também param, no
  // servidor). Os dados continuam lá: voltando a ficar ativo, tudo reabre.
  // `/plataforma` fica de fora: quem administra a plataforma nunca se tranca.
  if (status.parado && !pathname.startsWith("/plataforma")) {
    return (
      <GateScreen
        icon={<ShieldAlert className="h-6 w-6 text-coral" />}
        title={
          status.parado === "teste_vencido"
            ? "Seu período de teste terminou"
            : "Consultório pausado"
        }
        description={
          status.parado === "teste_vencido"
            ? "Seus dados estão guardados. Para continuar usando a NÓS Conecta, fale com a gente e escolha um plano."
            : "O acesso a este consultório está pausado. Seus dados estão guardados. Fale com a gente para reativar."
        }
        actions={
          <Button variant="premium" asChild>
            <a href="https://conecta.nosodontoesaude.com.br" target="_blank" rel="noreferrer">
              Falar com a NÓS Conecta
            </a>
          </Button>
        }
        onSignOut={handleSignOut}
      />
    );
  }

  // ── O nível, valendo também na rota ───────────────────────────────────
  //
  // Esconder o item no menu não impede ninguém de digitar `/pagamentos` na
  // barra de endereço, nem de abrir um link antigo que alguém mandou. O
  // servidor recusa a consulta (ver `area.middleware.ts`), mas o que a pessoa
  // veria era uma tela de erro — e tela de erro, para quem só clicou num link,
  // parece defeito do sistema.
  //
  // Então quem abre o que não é dele volta para o Início, sem alarde.
  return (
    <SoOQueENivelDela nivel={status.role} recursos={status.recursos}>
      {children}
    </SoOQueENivelDela>
  );
}

function SoOQueENivelDela({
  nivel,
  recursos,
  children,
}: {
  nivel: MemberRole | null;
  recursos: RecursosDoConsultorio | null;
  children: ReactNode;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const liberado = podeAbrir(nivel, pathname, recursos);

  useEffect(() => {
    if (!liberado) navigate({ to: ROTA_INICIAL, replace: true });
  }, [liberado, navigate]);

  if (!liberado) {
    return (
      <GateScreen
        icon={<Loader2 className="h-6 w-6 animate-spin" />}
        title="Levando você para o Início…"
      />
    );
  }
  return <>{children}</>;
}

function GateScreen({
  icon,
  title,
  description,
  actions,
  onSignOut,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  actions?: ReactNode;
  onSignOut?: () => void;
}) {
  return (
    <div className="min-h-dvh w-full bg-surface-subtle grid place-items-center px-4">
      <div className="surface-card w-full max-w-[420px] p-8 text-center flex flex-col items-center gap-4">
        <div className="h-12 w-12 rounded-2xl bg-muted grid place-items-center">{icon}</div>
        <h1 className="text-lg font-semibold">{title}</h1>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        {actions}
        {onSignOut ? (
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground mt-2"
            onClick={onSignOut}
          >
            <LogOut className="h-3.5 w-3.5" />
            Sair
          </Button>
        ) : null}
      </div>
    </div>
  );
}
