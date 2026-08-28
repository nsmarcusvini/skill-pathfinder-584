/**
 * Conversão de período para anual.
 *
 * O caso das abreviações é regressão de um bug real: o LinkedIn manda
 * payment_period como "mo"/"yr", que não estavam em PERIOD_FACTOR. Sem fator,
 * toAnnual devolvia o valor mensal intacto e ele entrava na mediana como se
 * fosse anual.
 *
 *   bun test src/lib/ingest/normalize.test.ts
 */
import { describe, expect, it } from "bun:test";

import { parseLocation, toAnnual } from "./normalize";

describe("toAnnual", () => {
  it("anualiza as abreviações que o LinkedIn usa", () => {
    expect(toAnnual(10000, 15000, "mo")).toEqual({
      salary_min: 120000,
      salary_max: 180000,
      salary_period: "year",
    });
    // "yr" já é anual: fator 1, valor intacto.
    expect(toAnnual(100000, 120000, "yr")).toEqual({
      salary_min: 100000,
      salary_max: 120000,
      salary_period: "year",
    });
  });

  it("continua aceitando os nomes por extenso", () => {
    expect(toAnnual(5000, null, "monthly").salary_min).toBe(60000);
    expect(toAnnual(50, null, "hour").salary_min).toBe(104000);
  });

  it("deixa passar sem converter quando o período é desconhecido", () => {
    // Preferir não mexer a chutar um fator errado.
    expect(toAnnual(1234, null, "por projeto")).toEqual({
      salary_min: 1234,
      salary_max: null,
      salary_period: "por projeto",
    });
  });

  it("tolera período nulo e valores nulos", () => {
    expect(toAnnual(null, null, null)).toEqual({
      salary_min: null,
      salary_max: null,
      salary_period: null,
    });
    expect(toAnnual(null, 9000, "mo").salary_max).toBe(108000);
  });
});

describe("parseLocation", () => {
  it("separa cidade e estado no formato completo", () => {
    expect(parseLocation("São Paulo, São Paulo, Brazil")).toEqual({
      city: "São Paulo",
      state: null, // cidade e estado iguais: não repete
    });
    expect(parseLocation("Curitiba, Paraná, Brazil")).toEqual({
      city: "Curitiba",
      state: "Paraná",
    });
    expect(parseLocation("Belo Horizonte, Minas Gerais, Brazil")).toEqual({
      city: "Belo Horizonte",
      state: "Minas Gerais",
    });
  });

  it("junta as variações da mesma cidade numa só", () => {
    // O ponto do normalizador: estas três viravam três filtros distintos.
    const a = parseLocation("São Paulo, São Paulo, Brazil");
    const b = parseLocation("São Paulo, Brazil");
    const c = parseLocation("São Paulo, Brasil");
    expect(a.city).toBe("São Paulo");
    expect(b.city).toBe("São Paulo");
    expect(c.city).toBe("São Paulo");
  });

  it("não inventa cidade quando só há país ou modalidade", () => {
    for (const v of ["Brazil", "Brasil", "Remoto", "Anywhere", "Worldwide", "Brazil (Remote)"]) {
      expect(parseLocation(v)).toEqual({ city: null, state: null });
    }
  });

  it("tolera vazio, nulo e lixo", () => {
    expect(parseLocation(null)).toEqual({ city: null, state: null });
    expect(parseLocation("")).toEqual({ city: null, state: null });
    expect(parseLocation("   ")).toEqual({ city: null, state: null });
    expect(parseLocation(", ,")).toEqual({ city: null, state: null });
  });

  it("aceita cidade sem país", () => {
    expect(parseLocation("Bristol")).toEqual({ city: "Bristol", state: null });
    expect(parseLocation("Greater Rio de Janeiro")).toEqual({
      city: "Greater Rio de Janeiro",
      state: null,
    });
  });
});
