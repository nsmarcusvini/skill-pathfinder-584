/**
 * Guard contra chamadas repetidas de signUp/updateUser para o mesmo e-mail.
 *
 *   bun test src/lib/signup-guard.test.ts
 */
import { describe, expect, it } from "bun:test";

import { isAuthRateLimited, markSignupAttempt, secondsUntilSignupAllowed } from "./signup-guard";

describe("secondsUntilSignupAllowed / markSignupAttempt", () => {
  it("libera um e-mail nunca tentado", () => {
    expect(secondsUntilSignupAllowed(`nunca-visto-${Date.now()}@teste.com`)).toBe(0);
  });

  it("bloqueia por ~60s logo após marcar uma tentativa", () => {
    const email = `cooldown-${Date.now()}@teste.com`;
    markSignupAttempt(email);
    const restante = secondsUntilSignupAllowed(email);
    expect(restante).toBeGreaterThan(0);
    expect(restante).toBeLessThanOrEqual(60);
  });

  it("trata e-mail sem diferenciar maiúscula/espaço — mesma pessoa, mesmo cooldown", () => {
    const base = `MaiUsculo-${Date.now()}`;
    markSignupAttempt(`${base}@Teste.com`);
    expect(secondsUntilSignupAllowed(`  ${base.toLowerCase()}@teste.com  `)).toBeGreaterThan(0);
  });

  it("não vaza cooldown entre e-mails diferentes", () => {
    const a = `a-${Date.now()}@teste.com`;
    const b = `b-${Date.now()}@teste.com`;
    markSignupAttempt(a);
    expect(secondsUntilSignupAllowed(b)).toBe(0);
  });
});

describe("isAuthRateLimited", () => {
  it("reconhece pelo status 429, mensagem tanto faz", () => {
    expect(isAuthRateLimited({ status: 429, message: "qualquer coisa" })).toBe(true);
  });

  it("reconhece pelo texto quando não há status (fallback)", () => {
    expect(isAuthRateLimited({ message: "Email rate limit exceeded" })).toBe(true);
    expect(isAuthRateLimited({ message: "you can only request this after 46 seconds" })).toBe(true);
  });

  it("não confunde outros erros com rate limit", () => {
    expect(isAuthRateLimited({ status: 400, message: "Invalid login credentials" })).toBe(false);
    expect(isAuthRateLimited(null)).toBe(false);
  });
});
