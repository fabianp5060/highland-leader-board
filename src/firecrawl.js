// Thin wrapper around the Firecrawl v1 scrape API.
// Docs: https://docs.firecrawl.dev/api-reference/endpoint/scrape
const API = "https://api.firecrawl.dev/v1/scrape";

async function scrape(url, { apiKey, waitFor = 3000, formats = ["markdown"] } = {}) {
  if (!apiKey) throw new Error("FIRECRAWL_API_KEY is required");
  const res = await fetch(API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      url,
      formats,
      onlyMainContent: true,
      waitFor,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Firecrawl ${res.status} for ${url}: ${text.slice(0, 200)}`);
  }
  const body = await res.json();
  if (!body?.success) throw new Error(`Firecrawl returned failure for ${url}`);
  return body.data ?? {};
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
