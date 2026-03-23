/**
 * Enrich events with LLM analysis using Gemini Flash API
 * Run with: npm run enrich
 */

import { readFileSync, writeFileSync, existsSync, renameSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { EventEnrichment } from "../src/types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");

const EVENTS_PATH = join(PROJECT_ROOT, "public", "events.json");
const ENRICHMENT_PATH = join(PROJECT_ROOT, "public", "enrichment.json");

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error("Missing GEMINI_API_KEY env variable. Set it in .env or export it.");
  process.exit(1);
}
const GEMINI_MODEL = "gemini-2.0-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

const BATCH_SIZE = 25;
const PARALLEL_REQUESTS = 5;
const MAX_RETRIES = 2;

interface EventSummary {
  id: string;
  name: string;
  description: string;
  guest_count: number;
  is_free: boolean;
  price_cents: number | null;
  city: string;
  hosts: string;
}

function loadEnrichment(): Record<string, EventEnrichment> {
  if (!existsSync(ENRICHMENT_PATH)) return {};
  try {
    return JSON.parse(readFileSync(ENRICHMENT_PATH, "utf-8"));
  } catch {
    console.warn("Could not parse enrichment.json, starting fresh.");
    return {};
  }
}

function saveEnrichment(data: Record<string, EventEnrichment>): void {
  const tmpPath = ENRICHMENT_PATH + ".tmp";
  writeFileSync(tmpPath, JSON.stringify(data, null, 2));
  renameSync(tmpPath, ENRICHMENT_PATH);
}

function summarizeEvent(entry: any): EventSummary {
  const event = entry.event ?? {};
  const hosts = (entry.hosts ?? [])
    .slice(0, 3)
    .map((h: any) => {
      const bio = h.bio_short ? ` (${h.bio_short.slice(0, 80)})` : "";
      return `${h.name}${bio}`;
    })
    .join(", ");

  return {
    id: event.api_id,
    name: event.name ?? "",
    description: (event.description ?? "").slice(0, 500),
    guest_count: entry.guest_count ?? 0,
    is_free: entry.ticket_info?.is_free ?? false,
    price_cents: entry.ticket_info?.price?.amount ?? null,
    city: event.geo_address_info?.city ?? "",
    hosts,
  };
}

function buildPrompt(batch: EventSummary[]): string {
  return `You are analyzing events for Refix Prism, a B2C tech/SaaS startup building an AI-powered revenue expansion copilot for product and growth teams. They're visiting San Francisco in March 2026 to meet:
- ICPs: product managers, growth leads, data/analytics people at B2C tech & SaaS companies
- Potential investors (VCs, angels)
- Highly cracked founders in adjacent spaces (NOT gaming, health tech, biotech, hardware)

For each event below, provide enrichment data. Return ONLY a valid JSON object. The keys MUST be the exact "id" field from each event (e.g. "evt-abc123"). Do NOT use array indices as keys.

Example output format:
{
  "evt-abc123": {
    "relevance_score": 7,
    "audience_categories": ["founder", "investor"],
    "event_type": "meetup",
    "networking_potential": "high",
    "why_attend": "Great networking opportunity.",
    "has_food_drinks": true,
    "food_drinks_details": "dinner + open bar"
  }
}

Events to analyze:
${batch.map((e) => `- id: ${e.id} | name: ${e.name} | desc: ${e.description} | guests: ${e.guest_count} | free: ${e.is_free} | city: ${e.city} | hosts: ${e.hosts}`).join("\n")}`;
}

async function callGemini(prompt: string): Promise<string> {
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json",
    },
  };

  const res = await fetch(GEMINI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini API ${res.status}: ${text.slice(0, 200)}`);
  }

  const json = await res.json();
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Empty response from Gemini");
  return text;
}

function parseResponse(raw: string): Record<string, EventEnrichment> {
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  const parsed = JSON.parse(cleaned);
  const result: Record<string, EventEnrichment> = {};

  for (const [id, data] of Object.entries(parsed)) {
    const d = data as any;
    result[id] = {
      relevance_score: Math.max(1, Math.min(10, Number(d.relevance_score) || 1)),
      audience_categories: Array.isArray(d.audience_categories)
        ? d.audience_categories
        : [],
      event_type: String(d.event_type || "other"),
      networking_potential: ["high", "medium", "low"].includes(
        d.networking_potential,
      )
        ? d.networking_potential
        : "low",
      why_attend: String(d.why_attend || ""),
      has_food_drinks: Boolean(d.has_food_drinks),
      food_drinks_details: String(d.food_drinks_details || ""),
    };
  }

  return result;
}

async function enrichBatch(
  batch: EventSummary[],
): Promise<Record<string, EventEnrichment> | null> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const prompt = buildPrompt(batch);
      const raw = await callGemini(prompt);
      return parseResponse(raw);
    } catch (err: any) {
      console.error(`  Attempt ${attempt + 1} failed: ${err.message}`);
      if (attempt < MAX_RETRIES) {
        const delay = 2000 * (attempt + 1);
        console.log(`  Retrying in ${delay / 1000}s...`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  return null;
}

async function main() {
  if (!existsSync(EVENTS_PATH)) {
    console.error("No events.json found. Run `npm run fetch` first.");
    process.exit(1);
  }

  const events: any[] = JSON.parse(readFileSync(EVENTS_PATH, "utf-8"));
  const enrichment = loadEnrichment();

  const toEnrich = events.filter(
    (e) => e.event?.api_id && !enrichment[e.event.api_id],
  );

  console.log(
    `Total events: ${events.length}, already enriched: ${Object.keys(enrichment).length}, to enrich: ${toEnrich.length}`,
  );

  if (toEnrich.length === 0) {
    console.log("Nothing to do.");
    return;
  }

  const summaries = toEnrich.map(summarizeEvent);

  const batches: EventSummary[][] = [];
  for (let i = 0; i < summaries.length; i += BATCH_SIZE) {
    batches.push(summaries.slice(i, i + BATCH_SIZE));
  }

  let enriched = 0;
  let failed = 0;

  // Process batches in parallel groups
  for (let i = 0; i < batches.length; i += PARALLEL_REQUESTS) {
    const group = batches.slice(i, i + PARALLEL_REQUESTS);
    const groupStart = i + 1;
    const groupEnd = Math.min(i + PARALLEL_REQUESTS, batches.length);
    console.log(
      `\nBatches ${groupStart}-${groupEnd} of ${batches.length} (${PARALLEL_REQUESTS} parallel)...`,
    );

    const results = await Promise.all(
      group.map((batch, j) =>
        enrichBatch(batch).then((result) => ({
          batchIndex: i + j,
          batch,
          result,
        })),
      ),
    );

    for (const { batchIndex, batch, result } of results) {
      if (result) {
        Object.assign(enrichment, result);
        enriched += Object.keys(result).length;
        console.log(`  Batch ${batchIndex + 1}: ${Object.keys(result).length} enriched`);
      } else {
        failed += batch.length;
        console.error(`  Batch ${batchIndex + 1}: FAILED (${batch.length} events skipped)`);
      }
    }

    saveEnrichment(enrichment);
    console.log(`  Total enriched: ${Object.keys(enrichment).length}/${events.length}`);
  }

  console.log(
    `\nDone. Enriched: ${enriched}, Failed: ${failed}, Total in file: ${Object.keys(enrichment).length}`,
  );
}

main().catch((err) => {
  console.error("Enrichment failed:", err);
  process.exit(1);
});
