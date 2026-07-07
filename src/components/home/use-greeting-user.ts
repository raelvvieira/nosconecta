import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

function greetingFor(date: Date) {
  const h = date.getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

export function useGreetingUser() {
  const [name, setName] = useState<string>("");
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user || !mounted) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle();
      const full =
        (profile?.full_name as string | undefined) ||
        (user.user_metadata?.full_name as string | undefined) ||
        user.email?.split("@")[0] ||
        "";
      if (mounted) setName(full);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const firstName = name ? name.split(" ")[0] : "";
  const initial = (firstName[0] ?? "U").toUpperCase();
  const greeting = greetingFor(new Date());
  return { firstName, initial, greeting };
}
