/**
 * Guarda-corpo compartilhado contra chamadas repetidas de signUp/updateUser
 * para o mesmo e-mail. Fonte única — cadastro.tsx e auth-dialog.tsx são os
 * dois lugares que criam conta, e os dois importam daqui em vez de cada um
 * reimplementar o cooldown.
 *
 * CONTEXTO que explica o "às vezes 429" melhor do que duplo clique: este app
 * chama supabase.auth.signInAnonymously() automaticamente em toda visita
 * nova (use-auth.tsx), e signInAnonymously() usa o MESMO endpoint
 * POST /auth/v1/signup que um cadastro por e-mail/senha. O limite de
 * "signups" do painel do Supabase é compartilhado entre as duas coisas — uma
 * rajada de sessões anônimas pode estourar o balde antes de alguém clicar em
 * "Criar conta". Isso não se resolve por código (é config em Authentication
 * → Rate Limits no painel); o que dá para fechar por aqui é a reentrância do
 * lado do cliente, que é o que este módulo faz.
 */

const COOLDOWN_MS = 60_000;
const STORAGE_PREFIX = "rumvia:signup-last-attempt:";

// Em memória primeiro — não depende de localStorage existir. O storage é só
// para o cooldown sobreviver a um F5 no meio da espera.
const lastAttemptByEmail = new Map<string, number>();

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function readPersisted(key: string): number | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    return raw ? Number(raw) : null;
  } catch {
    // Modo privado ou storage bloqueado: segue só com a memória do módulo.
    return null;
  }
}

function persist(key: string, ts: number): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, String(ts));
  } catch {
    // Silencioso de propósito — o cooldown em memória já cobre a aba atual.
  }
}

/** Segundos que faltam para este e-mail poder tentar de novo. 0 = liberado. */
export function secondsUntilSignupAllowed(email: string): number {
  const key = normalizeEmail(email);
  const last = Math.max(lastAttemptByEmail.get(key) ?? 0, readPersisted(key) ?? 0);
  const restante = COOLDOWN_MS - (Date.now() - last);
  return restante > 0 ? Math.ceil(restante / 1000) : 0;
}

/** Registra que uma tentativa de signup começou agora para este e-mail. */
export function markSignupAttempt(email: string): void {
  const key = normalizeEmail(email);
  const now = Date.now();
  lastAttemptByEmail.set(key, now);
  persist(key, now);
}

/**
 * true quando o erro veio de rate limit (429) do Supabase Auth.
 *
 * Checa o status HTTP primeiro — é o sinal confiável. O texto da mensagem
 * varia por endpoint ("email rate limit exceeded", "you can only request
 * this after N seconds"...), então ele é só reforço para quando o SDK não
 * expõe o status.
 */
export function isAuthRateLimited(
  error: { status?: number | undefined; message?: string | undefined } | null,
): boolean {
  if (!error) return false;
  if (error.status === 429) return true;
  const m = (error.message ?? "").toLowerCase();
  return (
    m.includes("rate limit") || m.includes("too many requests") || m.includes("request this after")
  );
}

export const SIGNUP_COOLDOWN_MESSAGE = "Tente novamente em ~1 minuto.";
