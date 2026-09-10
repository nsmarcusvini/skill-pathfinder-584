import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import type { Session, User } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { requestTurnstileToken } from "@/lib/turnstile";
import { isAuthRateLimited, SIGNUP_COOLDOWN_MESSAGE } from "@/lib/signup-guard";
import { TERMOS_PENDENTES_KEY } from "@/lib/legal-copy";

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];

/**
 * Por que o botão do Google foi clicado. "vincular" acrescenta o Google à
 * sessão anônima atual preservando o `user.id` (regra 7). "entrar" é a tela
 * de login: a conta já existe, e tentar vincular ali sempre falha com
 * `identity_already_exists` — aquela identidade Google já pertence à conta
 * permanente que a pessoa está tentando acessar.
 */
export type GoogleAuthIntent = "vincular" | "entrar";

export type AuthResult = {
  error: string | null;
  /** true quando o e-mail informado já pertence a uma conta existente. */
  emailTaken?: boolean;
  /** true quando a ação exige verificação de e-mail antes de concluir. */
  needsEmailConfirmation?: boolean;
  /** true quando o erro foi 429 do Supabase Auth — UI decide o cooldown. */
  rateLimited?: boolean;
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
  signInWithGoogle: (intencao?: GoogleAuthIntent) => Promise<AuthResult>;
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

/**
 * Origem para links de confirmação de e-mail e callback OAuth. NUNCA
 * `window.location.origin` puro: a Vercel atribui um alias
 * `rumvia-<hash>-eumarcussouza.vercel.app` a cada deploy, e um link de
 * confirmação que aponte pra um desses expira junto com o deploy. Único
 * domínio real é `https://www.rumvia.com.br` — localhost fica de fora pra
 * não quebrar o fluxo de confirmação em dev.
 */
function authRedirectOrigin(): string {
  const { hostname, origin } = window.location;
  if (hostname === "localhost" || hostname === "127.0.0.1") return origin;
  return "https://www.rumvia.com.br";
}

/**
 * Aceita o erro inteiro (não só a mensagem) porque precisa do `.status` para
 * reconhecer 429 de forma confiável — o texto que o GoTrue manda varia por
 * rota ("email rate limit exceeded", "you can only request this after N
 * seconds"...), então checar só substring de mensagem já deixou passar caso
 * antes.
 */
function traduzErro(error: { message: string; status?: number | undefined }): string {
  const message = error.message;
  const m = message.toLowerCase();
  if (isAuthRateLimited(error)) return SIGNUP_COOLDOWN_MESSAGE;
  if (isEmailTaken(message)) return "Este e-mail já possui uma conta no RUMVIA.";
  if (m.includes("invalid login credentials")) return "E-mail ou senha incorretos.";
  if (m.includes("email not confirmed")) return "Confirme seu e-mail antes de entrar.";
  if (m.includes("password should be at least"))
    return "A senha precisa ter pelo menos 8 caracteres.";
  if (m.includes("pwned") || m.includes("compromised"))
    return "Essa senha aparece em vazamentos conhecidos. Escolha outra.";
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
  const isAnonymousUser = Boolean(user?.is_anonymous);

  // Registra o aceite dos Termos assim que existir sessão PERMANENTE — não no
  // clique do checkbox, porque nesse momento pode não haver sessão ainda
  // (signUp com confirmação de e-mail pendente) ou a sessão pode ainda estar
  // marcada `is_anonymous` (convertAnonymousAccount só vira permanente depois
  // da confirmação). O clique em /cadastro só grava a INTENÇÃO no
  // localStorage; este efeito persiste assim que há alguém para persistir,
  // não importa se isso leva segundos (fluxo normal) ou dias (confirmação
  // atrasada) ou um redirect inteiro pelo Google (localStorage sobrevive).
  React.useEffect(() => {
    if (!user || isAnonymousUser) return;
    let versao: string | null = null;
    try {
      versao = localStorage.getItem(TERMOS_PENDENTES_KEY);
    } catch {
      return;
    }
    if (!versao) return;
    try {
      localStorage.removeItem(TERMOS_PENDENTES_KEY);
    } catch {
      /* segue mesmo sem conseguir limpar — pior caso é tentar de novo */
    }
    void supabase
      .from("terms_acceptances")
      .insert({ user_id: user.id, version: versao })
      .then(({ error }) => {
        // 23505 = já tinha essa versão registrada (nova aba, StrictMode
        // rodando o efeito duas vezes) — não é falha, é a idempotência
        // fazendo o trabalho dela.
        if (error && error.code !== "23505") {
          console.error("Falha ao registrar aceite dos Termos de uso:", error.message);
        }
      });
  }, [user, isAnonymousUser]);

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
        if (error) return { error: traduzErro(error) };
        if (data.user) await markPermanent(data.user.id);
        return { error: null };
      },

      async signUp(email, password, fullName) {
        const captchaToken = await requestTurnstileToken();
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${authRedirectOrigin()}/auth/callback`,
            ...(fullName ? { data: { full_name: fullName } } : {}),
            ...(captchaToken ? { captchaToken } : {}),
          },
        });
        if (error) {
          return {
            error: traduzErro(error),
            emailTaken: isEmailTaken(error.message),
            rateLimited: isAuthRateLimited(error),
          };
        }
        if (data.user) await markPermanent(data.user.id, fullName);
        return { error: null, needsEmailConfirmation: !data.session };
      },

      /**
       * Os dois caminhos passam pelo Supabase, nenhum por terceiro.
       *
       * Antes, a conta permanente ia pelo broker da Lovable
       * (`@lovable.dev/cloud-auth-js`). Isso ficou insustentável quando o
       * projeto saiu da Lovable: colocava um serviço externo no caminho
       * crítico de autenticação, num arquivo auto-gerado marcado como "não
       * modifique". Se aquele serviço mudasse ou saísse do ar, o login com
       * Google quebrava — e o time não teria como consertar.
       *
       * Na prática o caminho da Lovable quase nunca rodava: `signInAnonymously`
       * dispara no primeiro acesso, então quem clica em "Continuar com Google"
       * já é anônimo e cai no `linkIdentity`. "Quase nunca" não é "nunca".
       */
      async signInWithGoogle(intencao: GoogleAuthIntent = "vincular") {
        try {
          const redirectTo = `${authRedirectOrigin()}/auth/callback`;

          // `isAnonymous` sozinho não basta para escolher o caminho: TODO
          // visitante é anônimo (signInAnonymously roda no primeiro acesso),
          // inclusive quem abre /login para voltar a uma conta que já existe.
          // Vincular nesse caso é impossível — o GoTrue devolve
          // `identity_already_exists` e o retorno cai em /auth/callback com
          // erro. Quem tem intenção de entrar vai por OAuth normal.
          if (isAnonymous && intencao === "vincular") {
            // Vincula o Google à MESMA conta anônima: o user.id é preservado
            // (regra 7). O CV já enviado e as análises continuam valendo — por
            // isso é `linkIdentity`, nunca um login novo.
            //
            // Exige "Manual linking" ligado no Supabase; sem isso o GoTrue
            // recusa e `traduzErro` mostra a mensagem sobre vincular o Google.
            const { error } = await supabase.auth.linkIdentity({
              provider: "google",
              options: { redirectTo },
            });
            if (error) return { error: traduzErro(error) };
            return { error: null };
          }

          const { error } = await supabase.auth.signInWithOAuth({
            provider: "google",
            options: { redirectTo },
          });
          if (error) return { error: traduzErro(error) };
          return { error: null };
        } catch (err) {
          return { error: traduzErro({ message: (err as Error).message }) };
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
            ...(fullName ? { data: { full_name: fullName } } : {}),
          },
          { emailRedirectTo: `${authRedirectOrigin()}/auth/callback` },
        );

        if (error) {
          return {
            error: traduzErro(error),
            emailTaken: isEmailTaken(error.message),
            rateLimited: isAuthRateLimited(error),
          };
        }

        await markPermanent(user.id, fullName);
        return { error: null, needsEmailConfirmation: true };
      },

      async resetPassword(email) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${authRedirectOrigin()}/auth/callback?tipo=recuperacao`,
        });
        if (error) return { error: traduzErro(error) };
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
