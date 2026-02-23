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

async function fetchPage(cursor?: string): Promise<ApiResponse> {
  const params: FetchPageParams = {
    slug: "ai",
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

async function fetchAllEvents(): Promise<unknown[]> {
  const allEvents: unknown[] = [];
  let cursor: string | undefined;
  let page = 1;

  console.log("Fetching Luma AI events for Bay Area...");

  while (true) {
    process.stdout.write(`  Page ${page}... `);

    const data = await fetchPage(cursor);
    const entries = data.entries ?? [];
    console.log(`${entries.length} events`);

    allEvents.push(...entries);

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

  console.log(`\nTotal events fetched: ${allEvents.length}`);
  return allEvents;
}

async function main() {
  const events = await fetchAllEvents();

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
