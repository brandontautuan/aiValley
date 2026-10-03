import type { RetrievedSource, TavilyResearchRequest, TavilySearchTransport } from "./competitorResearch.ts";

interface TavilySearchResult {
  url?: unknown;
  title?: unknown;
  content?: unknown;
  published_date?: unknown;
}

interface TavilySearchResponse {
  request_id?: unknown;
  results?: unknown;
}

export interface TavilySearchTransportOptions {
  /** Supply only from a server entry point; never import this adapter into the web app. */
  apiKey?: string;
  fetchImplementation?: typeof fetch;
  now?: () => Date;
}

const TAVILY_SEARCH_URL = "https://api.tavily.com/search";

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * Creates a bounded Search API adapter. It returns undefined when no key is
 * configured, allowing the caller to keep fixture-based planning available.
 */
export function createTavilySearchTransport(options: TavilySearchTransportOptions): TavilySearchTransport | undefined {
  const apiKey = options.apiKey?.trim();
  if (!apiKey) return undefined;
  const fetchImplementation = options.fetchImplementation ?? fetch;
  const now = options.now ?? (() => new Date());

  return {
    async search(request: TavilyResearchRequest) {
      const response = await fetchImplementation(TAVILY_SEARCH_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          query: request.query,
          search_depth: "advanced",
          chunks_per_source: 3,
          max_results: request.maxSources,
          include_answer: false,
          include_raw_content: false,
          include_published_date: true,
          safe_search: true,
        }),
      });
      if (!response.ok) throw new Error(`Tavily search failed with HTTP ${response.status}`);

      const payload = (await response.json()) as TavilySearchResponse;
      const retrievedAt = now().toISOString();
      const sources = Array.isArray(payload.results)
        ? payload.results.flatMap((result): RetrievedSource[] => {
            if (!result || typeof result !== "object") return [];
            const record = result as TavilySearchResult;
            const url = text(record.url);
            const title = text(record.title);
            const claimText = text(record.content);
            if (!url || !title || !claimText) return [];
            return [{
              url,
              title,
              claimText: claimText.slice(0, 600),
              retrievedAt,
              publishedAt: text(record.published_date),
            }];
          })
        : [];
      return { providerRequestId: text(payload.request_id) ?? `search-${now().getTime()}`, sources };
    },
  };
}
