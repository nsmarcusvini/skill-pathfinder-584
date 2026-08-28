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
