import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Toaster } from "@/components/ui/sonner";
import { MobileFabProvider } from "@/components/finance/mobile-fab-context";
import { ResponsiveRouteState } from "@/components/layout/ResponsiveRouteState";
import { supabase } from "@/integrations/supabase/client";

function NotFoundComponent() {
  return <ResponsiveRouteState title="Página não encontrada" notFound />;
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <ResponsiveRouteState
      title="Esta página não carregou"
      description="Algo deu errado. Tente novamente ou volte ao início para continuar."
      onRetry={() => {
        router.invalidate();
        reset();
      }}
    />
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Nós Conecta" },
      { name: "description", content: "Sistema de gestão financeira para clínicas odontológicas." },
      { name: "author", content: "NÓS Conecta" },
      { property: "og:title", content: "Nós Conecta" },
      {
        property: "og:description",
        content: "Sistema de gestão financeira para clínicas odontológicas.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Nós Conecta" },
      {
        name: "twitter:description",
        content: "Sistema de gestão financeira para clínicas odontológicas.",
      },
      {
        property: "og:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/f8a90e44-aa95-437f-9ffc-a812fd85284b/id-preview-07a4c3cc--d99d44d3-aac2-4003-ad96-b3d585719075.lovable.app-1781664690838.png",
      },
      {
        name: "twitter:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/f8a90e44-aa95-437f-9ffc-a812fd85284b/id-preview-07a4c3cc--d99d44d3-aac2-4003-ad96-b3d585719075.lovable.app-1781664690838.png",
      },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap",
      },
      { rel: "stylesheet", href: appCss },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthGate>
        <MobileFabProvider>
          <Outlet />
        </MobileFabProvider>
      </AuthGate>
      <Toaster richColors position="top-right" />
    </QueryClientProvider>
  );
}

function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState<boolean>(false);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setAuthed(!!data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthed(!!session);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const isAuthRoute = pathname.startsWith("/auth");
    if (!authed && !isAuthRoute) {
      router.navigate({
        to: "/auth",
        search: { redirect: pathname === "/" ? undefined : pathname },
        replace: true,
      });
    }
    if (authed && isAuthRoute) {
      router.navigate({ to: "/", replace: true });
    }
  }, [ready, authed, pathname, router]);

  if (!ready) {
    return (
      <div className="min-h-screen w-full bg-[#FAFAFA] grid place-items-center">
        <div className="h-8 w-8 rounded-full border-2 border-coral border-t-transparent animate-spin" />
      </div>
    );
  }
  const isAuthRoute = pathname.startsWith("/auth");
  if (!authed && !isAuthRoute) return null;
  return <>{children}</>;
}
