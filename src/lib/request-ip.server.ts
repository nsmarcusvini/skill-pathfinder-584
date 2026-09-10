/**
 * SERVER-ONLY. Hash do IP de quem fez a requisição.
 *
 * Existe como módulo próprio porque agora há DOIS consumidores — a cota da
 * prévia grátis (`cv.functions.ts`) e a trilha de uso da conta paga
 * (`usage.server.ts`). Duas cópias divergiriam no dia em que uma delas passasse
 * a considerar outro header de proxy, e aí o mesmo visitante teria dois hashes
 * diferentes: a cota pararia de contar e o relatório de uso passaria a mostrar
 * duas "redes" onde há uma.
 *
 * SHA-256 sem sal, de propósito. O objetivo é agrupar requisições da mesma rede
 * sem guardar o IP em claro; não é proteger o IP contra quem já o conhece (com
 * 2^32 endereços, tabela arco-íris é trivial). Se um dia a exigência mudar, o
 * lugar de acrescentar sal é aqui, e só aqui.
 */
import { getRequestHeader } from "@tanstack/react-start/server";

export async function hashIpDaRequisicao(): Promise<string> {
  // `x-forwarded-for` chega como "cliente, proxy1, proxy2" — o primeiro é o
  // cliente. Sem requisição no contexto (cron, script), cai em "desconhecido",
  // que agrupa tudo num balde só e é honesto sobre não saber.
  const forwarded = (() => {
    try {
      return getRequestHeader("x-forwarded-for") ?? "";
    } catch {
      return "";
    }
  })();
  const ip = forwarded.split(",")[0]?.trim() || "desconhecido";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
