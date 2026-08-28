/**
 * Testes do mapeamento Bright Data -> NormalizedJob.
 *
 * Rodam sem rede: as fixtures abaixo imitam a forma dos registros de cada
 * dataset. Elas NÃO são cópias de resposta real — os nomes de campo variam por
 * conta e por versão do dataset, e é justamente por isso que o mapeamento é
 * tolerante. O que estes testes garantem é o comportamento do mapeamento, não a
 * forma exata da resposta da Bright Data.
 *
 *   bun test src/lib/ingest/adapters/bright-data.test.ts
 */
import { describe, expect, it } from "bun:test";

import {
  brightDataGlassdoorAdapter,
  brightDataIndeedAdapter,
  brightDataLinkedinJobsAdapter,
  jobgetherAdapter,
} from "./bright-data";
import type { AdapterConfig } from "../types";

const cfg: AdapterConfig = {};

describe("mapeamento para NormalizedJob", () => {
  it("converte um registro do LinkedIn com os campos principais", () => {
    const [vaga] = brightDataLinkedinJobsAdapter.collect(
      [
        {
          job_posting_id: "3901234567",
          job_title: "Senior DevOps Engineer",
          company_name: "Acme Cloud",
          job_location: "São Paulo, Brazil",
          country_code: "BR",
          job_seniority_level: "Mid-Senior level",
          job_employment_type: "Full-time",
          job_posted_date: "2026-08-20T10:00:00Z",
          job_description_formatted: "<p>Kubernetes e <b>Terraform</b></p>",
          apply_link: "https://linkedin.com/jobs/view/3901234567",
        },
      ],
      cfg,
    );

    expect(vaga).toBeDefined();
    expect(vaga!.external_id).toBe("3901234567");
    expect(vaga!.source_key).toBe("bd_linkedin_jobs");
    expect(vaga!.title).toBe("Senior DevOps Engineer");
    expect(vaga!.company_name).toBe("Acme Cloud");
    expect(vaga!.country).toBe("BR");
    expect(vaga!.seniority_hint).toBe("Mid-Senior level");
    expect(vaga!.posted_at).toBe("2026-08-20T10:00:00.000Z");
    // HTML vira texto legível para o extrator de skills.
    expect(vaga!.description_text).toContain("Kubernetes");
    expect(vaga!.description_text).not.toContain("<p>");
    // O registro cru é preservado inteiro.
    expect(vaga!.raw["job_posting_id"]).toBe("3901234567");
  });

  it("aceita nomes de campo diferentes entre fontes", () => {
    const [indeed] = brightDataIndeedAdapter.collect(
      [{ jobkey: "abc123", title: "Data Engineer", company: "Beta", location: "Remote" }],
      cfg,
    );
    const [glassdoor] = brightDataGlassdoorAdapter.collect(
      [{ job_listing_id: "gd-9", position: "SRE", employer: "Gamma", city: "Lisboa" }],
      cfg,
    );

    expect(indeed!.external_id).toBe("abc123");
    expect(indeed!.title).toBe("Data Engineer");
    expect(glassdoor!.external_id).toBe("gd-9");
    expect(glassdoor!.company_name).toBe("Gamma");
  });

  it("descarta registro sem id, título ou empresa em vez de gravar lixo", () => {
    const vagas = brightDataLinkedinJobsAdapter.collect(
      [
        { job_posting_id: "1", job_title: "Sem empresa" },
        { job_title: "Sem id", company_name: "X" },
        { job_posting_id: "3", company_name: "Sem titulo" },
      ],
      cfg,
    );
    expect(vagas).toHaveLength(0);
  });

  it("ignora as linhas de erro que vêm com include_errors", () => {
    const vagas = brightDataIndeedAdapter.collect(
      [
        { error: "page not found", input: { url: "x" } },
        { warning: "rate limited" },
        { jobkey: "ok1", title: "Backend", company: "Delta" },
      ],
      cfg,
    );
    expect(vagas).toHaveLength(1);
    expect(vagas[0]!.external_id).toBe("ok1");
  });

  it("deduz remoto pelo texto quando não há campo booleano", () => {
    const [comFlag] = brightDataLinkedinJobsAdapter.collect(
      [{ job_posting_id: "1", job_title: "A", company_name: "B", is_remote: true }],
      cfg,
    );
    const [porTexto] = brightDataLinkedinJobsAdapter.collect(
      [{ job_posting_id: "2", job_title: "A", company_name: "B", job_work_type: "Remote" }],
      cfg,
    );
    const [presencial] = brightDataLinkedinJobsAdapter.collect(
      [{ job_posting_id: "3", job_title: "A", company_name: "B", job_work_type: "On-site" }],
      cfg,
    );

    expect(comFlag!.is_remote).toBe(true);
    expect(porTexto!.is_remote).toBe(true);
    expect(presencial!.is_remote).toBe(false);
  });

  it("normaliza salário escrito como texto com símbolo e separador", () => {
    const [vaga] = brightDataIndeedAdapter.collect(
      [
        {
          jobkey: "s1",
          title: "A",
          company: "B",
          salary_min: "R$ 8.000",
          salary_max: "R$ 12.000",
          salary_currency: "BRL",
        },
      ],
      cfg,
    );
    expect(vaga!.salary_min).toBe(8000);
    expect(vaga!.salary_max).toBe(12000);
    expect(vaga!.salary_currency).toBe("BRL");
  });

  it("aceita data em epoch além de ISO", () => {
    const segundos = Math.floor(Date.parse("2026-08-01T00:00:00Z") / 1000);
    const [vaga] = brightDataGlassdoorAdapter.collect(
      [{ job_listing_id: "d1", position: "A", employer: "B", posted_at: segundos }],
      cfg,
    );
    expect(vaga!.posted_at).toBe("2026-08-01T00:00:00.000Z");
  });

  it("é idempotente: o mesmo registro produz sempre o mesmo external_id", () => {
    const reg = { job_posting_id: "42", job_title: "A", company_name: "B" };
    const a = brightDataLinkedinJobsAdapter.collect([reg], cfg);
    const b = brightDataLinkedinJobsAdapter.collect([reg], cfg);
    // O upsert do pipeline é por (source_id, external_id): id estável = sem duplicata.
    expect(a[0]!.external_id).toBe(b[0]!.external_id);
    expect(a[0]!.source_key).toBe(b[0]!.source_key);
  });
});

describe("configuração obrigatória", () => {
  it("recusa disparo sem dataset_id, com mensagem que diz onde obtê-lo", async () => {
    const anterior = process.env["BRIGHT_DATA_API_KEY"];
    process.env["BRIGHT_DATA_API_KEY"] = "chave-de-teste";
    try {
      await expect(brightDataLinkedinJobsAdapter.trigger({})).rejects.toThrow(/dataset_id/);
    } finally {
      if (anterior === undefined) delete process.env["BRIGHT_DATA_API_KEY"];
      else process.env["BRIGHT_DATA_API_KEY"] = anterior;
    }
  });

  it("recusa disparo sem credencial", async () => {
    const anterior = process.env["BRIGHT_DATA_API_KEY"];
    delete process.env["BRIGHT_DATA_API_KEY"];
    try {
      await expect(brightDataLinkedinJobsAdapter.trigger({ dataset_id: "gd_x" })).rejects.toThrow(
        /BRIGHT_DATA_API_KEY/,
      );
    } finally {
      if (anterior !== undefined) process.env["BRIGHT_DATA_API_KEY"] = anterior;
    }
  });

  it("recusa disparo sem entradas de busca", async () => {
    const anterior = process.env["BRIGHT_DATA_API_KEY"];
    process.env["BRIGHT_DATA_API_KEY"] = "chave-de-teste";
    try {
      await expect(
        brightDataLinkedinJobsAdapter.trigger({ dataset_id: "gd_x", discover_inputs: [] }),
      ).rejects.toThrow(/discover_inputs/);
    } finally {
      if (anterior === undefined) delete process.env["BRIGHT_DATA_API_KEY"];
      else process.env["BRIGHT_DATA_API_KEY"] = anterior;
    }
  });
});

describe("JobGether", () => {
  it("fica desativado, com o motivo explícito", async () => {
    expect(jobgetherAdapter.disabled).toBe(true);
    expect(jobgetherAdapter.disabledReason).toContain("Bright Data não oferece");
    await expect(jobgetherAdapter.trigger({})).rejects.toThrow(/indisponível/i);
  });
});

describe("salário aninhado (forma real do LinkedIn)", () => {
  // Esta é a forma que a conta do cliente devolveu de fato em 2026-08-28.
  // Diferente das outras fixtures, ela NÃO é inventada — foi copiada de
  // job_posting_raw depois da primeira coleta real.
  it("lê base_salary aninhado em vez de deixar o salário como null", () => {
    const [vaga] = brightDataLinkedinJobsAdapter.collect(
      [
        {
          job_posting_id: "sal1",
          job_title: "DevOps",
          company_name: "Acme",
          base_salary: {
            currency: "R$",
            min_amount: 10001,
            max_amount: 15000,
            payment_period: "mo",
          },
        },
      ],
      cfg,
    );

    expect(vaga!.salary_min).toBe(10001);
    expect(vaga!.salary_max).toBe(15000);
    expect(vaga!.salary_currency).toBe("R$");
    // "mo" tem de sobreviver até normalize.toAnnual, que converte para ano.
    expect(vaga!.salary_period).toBe("mo");
  });

  it("prefere o campo achatado quando as duas formas existem", () => {
    const [vaga] = brightDataLinkedinJobsAdapter.collect(
      [
        {
          job_posting_id: "sal2",
          job_title: "A",
          company_name: "B",
          salary_min: 999,
          base_salary: { min_amount: 111 },
        },
      ],
      cfg,
    );
    expect(vaga!.salary_min).toBe(999);
  });

  it("não quebra quando base_salary vem nulo ou vazio", () => {
    const [semNada] = brightDataLinkedinJobsAdapter.collect(
      [{ job_posting_id: "sal3", job_title: "A", company_name: "B", base_salary: null }],
      cfg,
    );
    expect(semNada!.salary_min).toBeNull();
    expect(semNada!.salary_currency).toBeNull();
  });
});

describe("Glassdoor — forma real da conta (regressão)", () => {
  // Copiado de um registro real do snapshot sd_mtd7h0i92onkz8frcg (2026-08-28),
  // com os campos reduzidos ao que o mapeamento usa.
  //
  // Esse lote trouxe 177 registros e o mapeamento converteu ZERO, porque
  // procurava o id em `job_listing_id` e o Glassdoor manda `job_posting_id`.
  // Registro sem id é descartado por regra, então a falha não gerou erro:
  // o lote inteiro sumiu em silêncio, com ingestion_runs marcado "success".
  const real = {
    job_posting_id: 1010219372153,
    job_title: "JR Fullstack Engineer - Indaiatuba/SP",
    company_name: "John Deere",
    job_location: "Indaiatuba",
    job_overview: "Trabalhamos para que a vida possa avançar. Buscamos experiência com Java e AWS.",
    job_application_link: "https://www.glassdoor.com.br/job-listing/jr-fullstack-engineer",
    url: "https://www.glassdoor.com.br/job-listing/jr-fullstack-engineer",
    pay_range_currency: "BRL",
  };

  it("converte o registro em vez de descartá-lo", () => {
    const [vaga] = brightDataGlassdoorAdapter.collect([real], cfg);
    expect(vaga).toBeDefined();
    // O id vem como número no JSON; tem de virar texto sem virar null.
    expect(vaga!.external_id).toBe("1010219372153");
    expect(vaga!.title).toBe("JR Fullstack Engineer - Indaiatuba/SP");
    expect(vaga!.company_name).toBe("John Deere");
  });

  it("lê job_overview como descrição — sem ela nenhuma skill é extraída", () => {
    const [vaga] = brightDataGlassdoorAdapter.collect([real], cfg);
    expect(vaga!.description_text).toContain("Java");
    expect(vaga!.description_text).toContain("AWS");
  });

  it("lê job_application_link como link de candidatura", () => {
    const [vaga] = brightDataGlassdoorAdapter.collect([real], cfg);
    expect(vaga!.apply_url).toContain("glassdoor");
  });
});
