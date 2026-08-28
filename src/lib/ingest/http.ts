/** HTTP de ingestão: backoff exponencial e no máximo 5 requisições concorrentes. */

const MAX_CONCURRENCY = 5;
let active = 0;
const queue: Array<() => void> = [];

async function acquire(): Promise<void> {
  if (active < MAX_CONCURRENCY) {
    active += 1;
    return;
  }
  await new Promise<void>((resolve) => queue.push(resolve));
  active += 1;
}

function release(): void {
  active -= 1;
  const next = queue.shift();
  if (next) next();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function fetchJson<T>(url: string, init: RequestInit = {}, attempts = 4): Promise<T> {
  await acquire();
  try {
    let lastError: unknown = null;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const res = await fetch(url, {
          ...init,
          headers: {
            accept: "application/json",
            "user-agent": "RUMVIA-ingest/1.0",
            ...(init.headers ?? {}),
          },
        });
        if (res.status === 429 || res.status >= 500) {
          const retryAfter = Number(res.headers.get("retry-after"));
          const wait =
            Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2 ** attempt * 750;
          lastError = new Error(`HTTP ${res.status} em ${url}`);
          await sleep(wait);
          continue;
        }
        if (!res.ok) {
          throw new Error(`HTTP ${res.status} em ${url}: ${(await res.text()).slice(0, 300)}`);
        }
        return (await res.json()) as T;
      } catch (error) {
        lastError = error;
        if (attempt === attempts - 1) break;
        await sleep(2 ** attempt * 750);
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  } finally {
    release();
  }
}

/** Executa tarefas com o mesmo teto de concorrência do fetch. */
export async function mapPool<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
): Promise<Array<PromiseSettledResult<R>>> {
  const results: Array<PromiseSettledResult<R>> = [];
  let index = 0;
  const workers = Array.from({ length: Math.min(MAX_CONCURRENCY, items.length || 1) }, async () => {
    while (index < items.length) {
      const current = index;
      index += 1;
      const item = items[current]!;
      try {
        results[current] = { status: "fulfilled", value: await fn(item) };
      } catch (reason) {
        results[current] = { status: "rejected", reason };
      }
    }
  });
  await Promise.all(workers);
  return results;
}
