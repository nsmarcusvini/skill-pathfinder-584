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

import { inferSeniority, parseLocation, toAnnual } from "./normalize";

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

/**
 * Senioridade. Todos os casos abaixo são títulos ou rótulos que existem na base
 * real — foram levantados quando se descobriu que 2 em cada 3 vagas estavam
 * gravadas como "senior" e a faixa "pleno" tinha 2 ou 3 vagas por trilha.
 *
 *   bun test src/lib/ingest/normalize.test.ts
 */
describe("inferSeniority", () => {
  it('não deixa o rótulo genérico da fonte atropelar o título (bug do "Mid-Senior level")', () => {
    // O LinkedIn manda "Mid-Senior level" em quase tudo. Antes, o "senior" de
    // dentro dele vencia e estas vagas ficavam gravadas como sênior.
    expect(inferSeniority("Desenvolvedor Back-End Pleno", "Mid-Senior level")).toBe("pleno");
    expect(inferSeniority("Engenheiro de Dados Pleno", "Mid-Senior level")).toBe("pleno");
    expect(inferSeniority("Data Engineer II", "Mid-Senior level")).toBe("pleno");
    expect(inferSeniority("Analista de Testes PL", "Mid-Senior level")).toBe("pleno");
    expect(inferSeniority("Mid-Level Full Stack Software Engineer", "Mid-Senior level")).toBe(
      "pleno",
    );
    expect(inferSeniority("Intermediate Backend Java Developer", "Mid-Senior level")).toBe("pleno");
  });

  it("devolve null quando a única pista é a faixa ambígua do LinkedIn", () => {
    // "Mid-Senior" cobre pleno E sênior: fingir que é um dos dois foi o que
    // encheu a base de sênior. Sem senioridade a vaga ainda conta no degrau
    // que aceita _include_unranked.
    expect(inferSeniority("Data Engineer", "Mid-Senior level")).toBeNull();
    expect(inferSeniority("DevOps Engineer", "Mid-Senior level")).toBeNull();
  });

  it("continua reconhecendo sênior de verdade", () => {
    expect(inferSeniority("Senior Data Engineer", null)).toBe("senior");
    expect(inferSeniority("Engenheiro de Dados Sênior", null)).toBe("senior");
    expect(inferSeniority("Sr. Site Reliability Engineer", null)).toBe("senior");
    expect(inferSeniority("Software Engineer III - Mobile", null)).toBe("senior");
    expect(inferSeniority("Data Engineer", "Senior")).toBe("senior");
  });

  it("não trata dígito solto como senioridade", () => {
    // `\b3\b` e `\b2\b` transformavam "L3", "Nível 2" e "3 anos" em senioridade.
    expect(inferSeniority("DevOps Engineer L3", null)).toBeNull();
    expect(inferSeniority("Analista de Suporte Nível 2", null)).toBeNull();
    expect(inferSeniority("Data Engineer (3+ anos)", null)).toBeNull();
  });

  it('não trata "i" solto como júnior', () => {
    // Estes três estavam gravados como júnior. O último usa " I " como separador.
    expect(inferSeniority("Software Engineering Manager I", null)).not.toBe("junior");
    expect(inferSeniority("Site Reliability Engineer Manager I", null)).not.toBe("junior");
    expect(inferSeniority("Software Engineer (foco em back-end) I Híbrido (Joinville)", null)).toBe(
      null,
    );
  });

  it("reconhece júnior de verdade", () => {
    expect(inferSeniority("Desenvolvedor Júnior", null)).toBe("junior");
    expect(inferSeniority("QA Engineer Jr.", null)).toBe("junior");
    expect(inferSeniority("Summer Internship 2027 | Software Engineering", null)).toBe("junior");
    expect(inferSeniority("Data Engineer", "Entry level")).toBe("junior");
  });

  it('não confunde "PL/SQL" com pleno', () => {
    expect(inferSeniority("Desenvolvedor PL/SQL", null)).toBeNull();
    expect(inferSeniority("Analista PL/SQL Oracle", null)).toBeNull();
    // mas a abreviação brasileira de pleno continua valendo
    expect(inferSeniority("Desenvolvedor Full Stack PL", null)).toBe("pleno");
  });

  it("staff vence sênior quando os dois aparecem", () => {
    expect(inferSeniority("Senior Staff Engineer", null)).toBe("staff");
    expect(inferSeniority("Tech Lead DevOps", null)).toBe("staff");
    expect(inferSeniority("Principal Architect", null)).toBe("staff");
  });

  it("tolera título vazio e hint nulo", () => {
    expect(inferSeniority("", null)).toBeNull();
    expect(inferSeniority("Data Engineer", null)).toBeNull();
    expect(inferSeniority("Data Engineer", "")).toBeNull();
  });
});
