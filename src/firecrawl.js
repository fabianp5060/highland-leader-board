// Thin wrapper around the Firecrawl v1 scrape API.
// Docs: https://docs.firecrawl.dev/api-reference/endpoint/scrape
const API = "https://api.firecrawl.dev/v1/scrape";

// Cloud-edge transient failures we should retry rather than surface.
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 4;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function scrape(url, { apiKey, waitFor = 3000, formats = ["markdown"] } = {}) {
  if (!apiKey) throw new Error("FIRECRAWL_API_KEY is required");
  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let res;
    try {
      res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ url, formats, onlyMainContent: true, waitFor }),
      });
    } catch (err) {
      // Network-level failure — retry.
      lastErr = new Error(`Firecrawl network error for ${url}: ${err.message}`);
      if (attempt === MAX_ATTEMPTS) throw lastErr;
      await sleep(backoffMs(attempt));
      continue;
    }
    if (res.ok) {
      const body = await res.json();
      if (!body?.success) throw new Error(`Firecrawl returned failure for ${url}`);
      return body.data ?? {};
    }
    const text = await res.text().catch(() => "");
    lastErr = new Error(`Firecrawl ${res.status} for ${url}: ${text.slice(0, 200)}`);
    if (!RETRYABLE_STATUS.has(res.status) || attempt === MAX_ATTEMPTS) throw lastErr;
    console.warn(`  ${res.status} from Firecrawl — retrying (${attempt}/${MAX_ATTEMPTS - 1})`);
    await sleep(backoffMs(attempt));
  }
  throw lastErr;
}

// 1.5s, 4s, 9s — gentle exponential backoff with jitter.
function backoffMs(attempt) {
  const base = 1500 * Math.pow(2, attempt - 1);
  return base + Math.floor(Math.random() * 500);
}

export async function scrapeMarkdown(url, opts = {}) {
  const data = await scrape(url, { ...opts, formats: ["markdown"] });
  if (!data.markdown) throw new Error(`Firecrawl returned no markdown for ${url}`);
  return data.markdown;
}

export async function scrapeWithLinks(url, opts = {}) {
  const data = await scrape(url, { ...opts, formats: ["markdown", "links"] });
  return { markdown: data.markdown ?? "", links: data.links ?? [] };
}
