import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import type { Session, User } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import type { Database } from "@/integrations/supabase/types";
import { requestTurnstileToken } from "@/lib/turnstile";

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];

export type AuthResult = {
  error: string | null;
  /** true quando o e-mail informado já pertence a uma conta existente. */
  emailTaken?: boolean;
  /** true quando a ação exige verificação de e-mail antes de concluir. */
  needsEmailConfirmation?: boolean;
};

export interface AuthValue {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  /** Visitante com sessão anônima (auth.users.is_anonymous = true). */
  isAnonymous: boolean;
  /** Conta permanente (e-mail ou provedor social vinculado). */
  isAuthenticated: boolean;
  isOnboarded: boolean;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (email: string, password: string, fullName?: string) => Promise<AuthResult>;
  signInWithGoogle: () => Promise<AuthResult>;
  /**
   * Converte a sessão anônima atual em conta permanente.
   * O user.id NUNCA muda — CV, skills e análises já gravadas continuam válidos.
   */
  convertAnonymousAccount: (
    email: string,
    password: string,
    fullName?: string,
  ) => Promise<AuthResult>;
  resetPassword: (email: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = React.createContext<AuthValue | null>(null);

const EMAIL_TAKEN_PATTERNS = [
  "already registered",
  "already been registered",
  "already exists",
  "email address is already",
  "user already",
  "identity is already linked",
];

function isEmailTaken(message: string): boolean {
  const m = message.toLowerCase();
  return EMAIL_TAKEN_PATTERNS.some((p) => m.includes(p));
}

function traduzErro(message: string): string {
  const m = message.toLowerCase();
  if (isEmailTaken(message)) return "Este e-mail já possui uma conta no RUMVIA.";
  if (m.includes("invalid login credentials")) return "E-mail ou senha incorretos.";
  if (m.includes("email not confirmed")) return "Confirme seu e-mail antes de entrar.";
  if (m.includes("password should be at least"))
    return "A senha precisa ter pelo menos 8 caracteres.";
  if (m.includes("pwned") || m.includes("compromised"))
    return "Essa senha aparece em vazamentos conhecidos. Escolha outra.";
  if (m.includes("rate limit") || m.includes("too many"))
    return "Muitas tentativas. Aguarde alguns minutos e tente novamente.";
  if (m.includes("manual linking") || m.includes("linking is disabled"))
    return "Não foi possível vincular o Google agora. Use e-mail e senha.";
  if (m.includes("captcha")) return "Verificação de segurança falhou. Recarregue a página.";
  return message;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [session, setSession] = React.useState<Session | null>(null);
  const [initializing, setInitializing] = React.useState(true);
  const anonAttempted = React.useRef(false);

  React.useEffect(() => {
    let active = true;

    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        router.invalidate();
        if (event !== "SIGNED_OUT") {
          queryClient.invalidateQueries();
        }
      }
    });

    void supabase.auth.getSession().then(({ data: { session: current } }) => {
      if (!active) return;
      setSession(current);
      setInitializing(false);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [queryClient, router]);

  // Sessão anônima automática: o visitante pode enviar o CV sem criar conta.
  // A sessão fica no localStorage, então ele pode fechar e voltar depois.
  React.useEffect(() => {
    if (initializing || session || anonAttempted.current) return;
    anonAttempted.current = true;

    void (async () => {
      const captchaToken = await requestTurnstileToken();
      const { error } = await supabase.auth.signInAnonymously(
        captchaToken ? { options: { captchaToken } } : undefined,
      );
      if (error) {
        console.error("Falha ao iniciar sessão anônima:", error.message);
        anonAttempted.current = false;
      }
    })();
  }, [initializing, session]);

  const user = session?.user ?? null;
  const userId = user?.id ?? null;

  const profileQuery = useQuery({
    queryKey: ["profile", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as Profile | null;
    },
  });

  const refreshProfile = React.useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["profile", userId] });
  }, [queryClient, userId]);

  const markPermanent = React.useCallback(
    async (id: string, fullName?: string) => {
      const patch: Database["public"]["Tables"]["profiles"]["Update"] = { is_anonymous: false };
      if (fullName) patch.full_name = fullName;
      await supabase.from("profiles").update(patch).eq("id", id);
      await queryClient.invalidateQueries();
    },
    [queryClient],
  );

  const value = React.useMemo<AuthValue>(() => {
    const isAnonymous = Boolean(user?.is_anonymous);

    return {
      user,
      session,
      profile: profileQuery.data ?? null,
      loading: initializing || (Boolean(userId) && profileQuery.isLoading),
      isAnonymous,
      isAuthenticated: Boolean(user) && !isAnonymous,
      isOnboarded: profileQuery.data?.onboarding_completed === true,

      async signIn(email, password) {
        const captchaToken = await requestTurnstileToken();
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
          ...(captchaToken ? { options: { captchaToken } } : {}),
        });
        if (error) return { error: traduzErro(error.message) };
        if (data.user) await markPermanent(data.user.id);
        return { error: null };
      },

      async signUp(email, password, fullName) {
        const captchaToken = await requestTurnstileToken();
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
            ...(fullName ? { data: { full_name: fullName } } : {}),
            ...(captchaToken ? { captchaToken } : {}),
          },
        });
        if (error) {
          return { error: traduzErro(error.message), emailTaken: isEmailTaken(error.message) };
        }
        if (data.user) await markPermanent(data.user.id, fullName);
        return { error: null, needsEmailConfirmation: !data.session };
      },

      async signInWithGoogle() {
        try {
          if (isAnonymous) {
            // Vincula o Google à MESMA conta anônima: o user.id é preservado.
            const { error } = await supabase.auth.linkIdentity({
              provider: "google",
              options: { redirectTo: `${window.location.origin}/auth/callback` },
            });
            if (error) return { error: traduzErro(error.message) };
            return { error: null };
          }
          const result = (await lovable.auth.signInWithOAuth("google", {
            redirect_uri: `${window.location.origin}/auth/callback`,
          })) as { error?: unknown } | undefined;
          const oauthError = result?.error;
          if (oauthError) {
            const message =
              typeof oauthError === "string"
                ? oauthError
                : ((oauthError as { message?: string }).message ?? "Falha no login com Google.");
            return { error: traduzErro(message) };
          }
          return { error: null };
        } catch (err) {
          return { error: traduzErro((err as Error).message) };
        }
      },

      async convertAnonymousAccount(email, password, fullName) {
        if (!user) return { error: "Nenhuma sessão ativa para converter." };

        // updateUser no MESMO usuário anônimo. Nunca criar outro usuário:
        // o vínculo com o CV já enviado depende do user.id permanecer igual.
        const { error } = await supabase.auth.updateUser(
          {
            email,
            password,
            data: fullName ? { full_name: fullName } : undefined,
          },
          { emailRedirectTo: `${window.location.origin}/auth/callback` },
        );

        if (error) {
          return { error: traduzErro(error.message), emailTaken: isEmailTaken(error.message) };
        }

        await markPermanent(user.id, fullName);
        return { error: null, needsEmailConfirmation: true };
      },

      async resetPassword(email) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth/callback?tipo=recuperacao`,
        });
        if (error) return { error: traduzErro(error.message) };
        return { error: null };
      },

      async signOut() {
        await queryClient.cancelQueries();
        queryClient.clear();
        anonAttempted.current = false;
        await supabase.auth.signOut();
      },

      refreshProfile,
    };
  }, [
    user,
    session,
    profileQuery.data,
    profileQuery.isLoading,
    initializing,
    userId,
    markPermanent,
    queryClient,
    refreshProfile,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth precisa estar dentro de <AuthProvider>");
  return ctx;
}
