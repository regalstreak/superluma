/**
 * Fetch all Luma AI events using cursor-based pagination
 * Run with: npm run fetch
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");

const BASE_URL = "https://api2.luma.com/discover/get-paginated-events";
const EVENT_URL = "https://api2.luma.com/event/get";

const CONCURRENCY = 5; // parallel detail fetches

const HEADERS: Record<string, string> = {
  accept: "*/*",
  "accept-language": "en-IN",
  origin: "https://luma.com",
  referer: "https://luma.com/",
  "sec-fetch-dest": "empty",
  "sec-fetch-mode": "cors",
  "sec-fetch-site": "same-site",
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
  "x-luma-client-type": "luma-web",
  "x-luma-client-version": "24f60013a530b6c4d810279770bec0b131878e03",
  "x-luma-web-url": "https://luma.com/category/ai/map",
};

// Wider Bay Area bounding box
const BBOX = {
  north: 38.05,
  south: 37.05,
  east: -121.58,
  west: -122.6,
};

interface FetchPageParams {
  slug: string;
  pagination_limit: number;
  north: number;
  south: number;
  east: number;
  west: number;
  pagination_cursor?: string;
}

interface ApiResponse {
  entries: unknown[];
  has_more: boolean;
  next_cursor?: string;
}

const SLUGS = ["ai", "tech"];

async function fetchPage(slug: string, cursor?: string): Promise<ApiResponse> {
  const params: FetchPageParams = {
    slug,
    pagination_limit: 50,
    ...BBOX,
  };

  if (cursor) {
    params.pagination_cursor = cursor;
  }

  const url = new URL(BASE_URL);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }

  const response = await fetch(url.toString(), { headers: HEADERS });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return response.json() as Promise<ApiResponse>;
}

async function fetchEventsForSlug(slug: string): Promise<unknown[]> {
  const events: unknown[] = [];
  let cursor: string | undefined;
  let page = 1;

  console.log(`Fetching Luma "${slug}" events for Bay Area...`);

  while (true) {
    process.stdout.write(`  Page ${page}... `);

    const data = await fetchPage(slug, cursor);
    const entries = data.entries ?? [];
    console.log(`${entries.length} events`);

    events.push(...entries);

    if (!data.has_more) {
      console.log("  No more pages.");
      break;
    }

    cursor = data.next_cursor;
    if (!cursor) {
      console.log("  No cursor found.");
      break;
    }

    page++;
    // Be nice to the API
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`  Subtotal for "${slug}": ${events.length}\n`);
  return events;
}

async function fetchAllEvents(): Promise<unknown[]> {
  const allEvents: unknown[] = [];

  for (const slug of SLUGS) {
    const events = await fetchEventsForSlug(slug);
    allEvents.push(...events);
  }

  // Deduplicate by event api_id
  const seen = new Set<string>();
  const unique = allEvents.filter((entry: any) => {
    const id = entry?.event?.api_id;
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  console.log(`Total fetched: ${allEvents.length}, after dedup: ${unique.length}`);
  return unique;
}

/** Extract plain text from a ProseMirror/TipTap description_mirror doc */
function extractText(node: any): string {
  if (!node) return "";
  if (node.type === "text") return node.text ?? "";
  if (!Array.isArray(node.content)) return "";
  const parts = node.content.map(extractText);
  // Add newline between block-level nodes
  if (["doc", "paragraph", "heading", "blockquote", "listItem"].includes(node.type)) {
    return parts.join("") + "\n";
  }
  return parts.join("");
}

async function fetchEventDescription(apiId: string): Promise<string> {
  const url = `${EVENT_URL}?event_api_id=${apiId}`;
  const response = await fetch(url, { headers: HEADERS });
  if (!response.ok) return "";
  const data = (await response.json()) as any;
  return extractText(data.description_mirror).trim();
}

/** Process items in batches with concurrency limit */
async function mapWithConcurrency<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i]);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}

async function enrichWithDescriptions(events: any[]): Promise<void> {
  console.log(`\nFetching descriptions for ${events.length} events (concurrency: ${CONCURRENCY})...`);
  let done = 0;

  await mapWithConcurrency(
    events,
    async (entry) => {
      const id = entry?.event?.api_id;
      if (id) {
        const desc = await fetchEventDescription(id);
        if (desc) entry.event.description = desc;
      }
      done++;
      if (done % 50 === 0 || done === events.length) {
        console.log(`  ${done}/${events.length} done`);
      }
    },
    CONCURRENCY,
  );
}

async function main() {
  const events = await fetchAllEvents();
  await enrichWithDescriptions(events);

  const outDir = join(PROJECT_ROOT, "public");
  mkdirSync(outDir, { recursive: true });

  const outPath = join(outDir, "events.json");
  writeFileSync(outPath, JSON.stringify(events, null, 2));
  console.log(`Saved to: ${outPath}`);
}

main().catch((err) => {
  console.error("Failed to fetch events:", err);
  process.exit(1);
});
