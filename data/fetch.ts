/**
 * Builds a live planning snapshot from the internet and writes it to disk.
 *
 *   node --experimental-strip-types data/fetch.ts
 *     Downloads a public practice dataset of coffee-shop transactions (a fictitious chain), plus the weather forecast
 *     and public holidays for its stores.
 *
 *   node --experimental-strip-types data/fetch.ts --sales <csv path or URL> --config <json> [--costs <csv>]
 *     Uses your own transaction export. See parseSalesCsv and LiveConfig in data/live.ts
 *     for the formats; the costs CSV has columns item, variable_cost, updated_at.
 *
 * Options: --weeks 8  --items 8  --out .data/live/snapshot.json
 * Serve it by starting the API with PLANNING_SNAPSHOT=<the --out path>.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ContextSignal } from "../contracts/index.ts";
import { buildHistory, holidaySignals, parseCsv, parseSalesCsv, weatherSignals, type HourlyForecast, type ItemCosts, type LiveConfig, type LiveSnapshot } from "./live.ts";
import { addDays } from "./mock.ts";

const SAMPLE_URL = "https://maven-datasets.s3.amazonaws.com/Coffee+Shop+Sales/Coffee+Shop+Sales.zip";
const SAMPLE_SOURCE = "Maven Analytics public 'Coffee Shop Sales' practice dataset (a fictitious chain with three New York stores, Jan–Jun 2023; not a real business's sales)";
const SAMPLE_WORKBOOK = "Coffee Shop Sales.xlsx";

/** Settings for the public sample. Store coordinates are neighborhood centers; the policy and cost share are test assumptions. */
const SAMPLE_CONFIG: LiveConfig = {
  chain: { name: "Maven Roasters", policy: { maxDiscountPct: 10, minContributionPerUnitCents: 100, costFreshnessDays: 45, capacityWarningShare: 0.9 } },
  country: "US",
  stores: {
    "Lower Manhattan": { latitude: 40.7075, longitude: -74.0113, timezone: "America/New_York" },
    "Hell's Kitchen": { latitude: 40.7638, longitude: -73.9918, timezone: "America/New_York" },
    Astoria: { latitude: 40.7644, longitude: -73.9235, timezone: "America/New_York" },
  },
  assumeCostShare: 0.3,
};

async function get(url: string): Promise<Response> {
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response;
}

const csvField = (value: string) => (/[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value);

/** Downloads the sample workbook once and converts its single sheet to the sales CSV format. Needs the `unzip` command. */
async function sampleSalesCsv(rawDir: string): Promise<string> {
  const csvPath = join(rawDir, "coffee-shop-sales.csv");
  if (existsSync(csvPath)) return readFileSync(csvPath, "utf8");
  mkdirSync(rawDir, { recursive: true });
  const zipPath = join(rawDir, "coffee-shop-sales.zip");
  console.log(`Downloading ${SAMPLE_URL}`);
  writeFileSync(zipPath, Buffer.from(await (await get(SAMPLE_URL)).arrayBuffer()));
  execFileSync("unzip", ["-o", "-q", zipPath, SAMPLE_WORKBOOK, "-d", rawDir]);
  const part = (name: string) => execFileSync("unzip", ["-p", join(rawDir, SAMPLE_WORKBOOK), name], { encoding: "utf8", maxBuffer: 512 * 1024 * 1024 });
  const unescape = (value: string) => value.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
  const strings = [...part("xl/sharedStrings.xml").matchAll(/<si><t[^>]*>([^<]*)<\/t><\/si>/g)].map((match) => unescape(match[1]!).trim());

  // Sheet columns: A transaction_id, B date serial, C time fraction, D quantity, E store_id,
  // F store_location, G product_id, H unit_price, I product_category, J product_type, K product_detail.
  const lines = ["order_id,date,time,store,item,category,quantity,unit_price"];
  for (const row of part("xl/worksheets/sheet1.xml").matchAll(/<row [^>]*>(.*?)<\/row>/g)) {
    const cells: Record<string, string> = {};
    for (const cell of row[1]!.matchAll(/<c r="([A-Z]+)\d+"[^>]*?(?: t="(\w+)")?><v>([^<]*)<\/v>/g)) cells[cell[1]!] = cell[2] === "s" ? strings[Number(cell[3])]! : cell[3]!;
    if (!/^\d+$/.test(cells.B ?? "")) continue; // header row
    const date = new Date(Date.UTC(1899, 11, 30) + Number(cells.B) * 86_400_000).toISOString().slice(0, 10);
    const seconds = Math.round(Number(cells.C) * 86_400);
    const time = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map((value) => String(value).padStart(2, "0")).join(":");
    // The sheet has one ID per line item; lines rung up at one store in the same second are treated as one order.
    lines.push([`${cells.E}-${date}T${time}`, date, time, cells.F!, cells.K!, cells.I!, cells.D!, cells.H!].map(csvField).join(","));
  }
  const csv = `${lines.join("\n")}\n`;
  writeFileSync(csvPath, csv);
  return csv;
}

function readCosts(path: string): ItemCosts {
  const [header, ...lines] = parseCsv(readFileSync(path, "utf8"));
  const columns = (header ?? []).map((name) => name.trim().toLowerCase());
  const costs: ItemCosts = {};
  for (const line of lines) {
    const cell = (name: string) => (line[columns.indexOf(name)] ?? "").trim();
    if (!cell("item")) continue;
    const updated = cell("updated_at");
    const cents = Math.round(Number(cell("variable_cost")) * 100);
    if (!Number.isFinite(cents) || Number.isNaN(Date.parse(updated))) throw new Error(`Costs CSV row for "${cell("item")}" needs a numeric variable_cost and an ISO updated_at.`);
    costs[cell("item")] = { variableCostCents: cents, costUpdatedAt: /^\d{4}-\d{2}-\d{2}$/.test(updated) ? `${updated}T12:00:00Z` : updated };
  }
  return costs;
}

async function main() {
  const args: Record<string, string> = {};
  for (let index = 2; index < process.argv.length; index += 2) args[process.argv[index]!.replace(/^--/, "")] = process.argv[index + 1] ?? "";
  const out = args.out ?? ".data/live/snapshot.json";
  const fetchedAt = new Date().toISOString();
  const assumptions: string[] = [];

  let salesCsv: string;
  let config: LiveConfig;
  let source: string;
  if (args.sales) {
    if (!args.config) throw new Error("--sales needs --config <json> with the chain policy and store settings (see LiveConfig in data/live.ts).");
    salesCsv = /^https?:/.test(args.sales) ? await (await get(args.sales)).text() : readFileSync(args.sales, "utf8");
    config = JSON.parse(readFileSync(args.config, "utf8")) as LiveConfig;
    source = `sales imported from ${args.sales}`;
  } else {
    salesCsv = await sampleSalesCsv(join(dirname(out), "raw"));
    config = SAMPLE_CONFIG;
    source = SAMPLE_SOURCE;
    assumptions.push("Sample orders are inferred from line items rung up at one store in the same second; chain policy and store coordinates are test settings.");
  }

  const history = buildHistory(parseSalesCsv(salesCsv), config, {
    weeks: Number(args.weeks ?? 8),
    items: Number(args.items ?? 8),
    fetchedAt,
    ...(args.costs ? { costs: readCosts(args.costs) } : {}),
  });

  // Context is best-effort: a failed source is reported and labeled, and the snapshot is still written.
  const contextSignals: ContextSignal[] = [];
  const today = fetchedAt.slice(0, 10);
  try {
    for (const location of history.locations) {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}&longitude=${location.longitude}&hourly=precipitation,precipitation_probability,apparent_temperature&timezone=${encodeURIComponent(location.timezone)}&forecast_days=16`;
      const forecast = (await (await get(url)).json()) as { hourly: HourlyForecast };
      contextSignals.push(...weatherSignals(location, forecast.hourly, fetchedAt));
    }
  } catch (error) {
    console.warn(`Weather unavailable: ${(error as Error).message}`);
    assumptions.push("Weather forecast was unavailable when this snapshot was fetched.");
  }
  try {
    const until = addDays(today, 60);
    const years = [...new Set([today.slice(0, 4), until.slice(0, 4)])];
    const holidays = (await Promise.all(years.map(async (year) => (await (await get(`https://date.nager.at/api/v3/PublicHolidays/${year}/${config.country}`)).json()) as Array<{ date: string; name: string; global: boolean }>))).flat();
    contextSignals.push(...holidaySignals(history.locations, holidays, fetchedAt, today, until));
  } catch (error) {
    console.warn(`Holidays unavailable: ${(error as Error).message}`);
    assumptions.push("Public holidays were unavailable when this snapshot was fetched.");
  }

  const snapshot: LiveSnapshot = { version: 1, fetchedAt, source, ...history, assumptions: [...assumptions, ...history.assumptions], contextSignals };
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(snapshot));

  const dates = snapshot.orderTotals.map((bucket) => bucket.date).sort();
  console.log(`\nWrote ${out}`);
  console.log(`  Source:   ${source}`);
  console.log(`  History:  ${dates[0]} to ${dates.at(-1)} — ${snapshot.orderTotals.length} order-hours, ${snapshot.itemSales.length} item-hours`);
  for (const location of snapshot.locations) console.log(`  Store:    ${location.name} (${location.id}) open ${location.openingHours.open}–${location.openingHours.close}, capacity ${location.hourlyCapacityOrders}/h`);
  for (const item of snapshot.menu) console.log(`  Item:     ${item.name} $${(item.regularPriceCents / 100).toFixed(2)}, cost ${item.variableCostCents === null ? "unknown" : `$${(item.variableCostCents / 100).toFixed(2)}`}`);
  console.log(`  Signals:  ${contextSignals.filter((signal) => signal.type === "weather").length} weather, ${contextSignals.filter((signal) => signal.type === "holiday").length} holiday`);
  for (const note of snapshot.assumptions) console.log(`  Assumed:  ${note}`);
  console.log(`\nServe it: PLANNING_SNAPSHOT=${out} npm run dev`);
}

main().catch((error: Error) => {
  console.error(`✗ ${error.message}`);
  process.exit(1);
});
