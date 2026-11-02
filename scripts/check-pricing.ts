import { PLAN_PRICING, planPricing } from "../src/lib/plan-pricing";

const PRICING_URL = "https://portal.neuralwatt.com/pricing";
const FAQ_URL = "https://docs.neuralwatt.com/billing/faq.md";
const DEFAULT_API_BASE_URL = "https://api.neuralwatt.com";
const EPSILON = 0.01;

interface Discrepancy {
  source: "portal" | "faq" | "quota";
  plan: string;
  field: string;
  table: unknown;
  live: unknown;
}

interface Fetched {
  ok: boolean;
  status?: number;
  body: string;
}

async function fetchText(url: string): Promise<Fetched> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(15_000),
      headers: {
        Referer: "https://github.com/aliou/pi-neuralwatt",
        "X-Title": "npm:@aliou/pi-neuralwatt",
      },
    });
    if (!response.ok) {
      return { ok: false, status: response.status, body: "" };
    }
    return { ok: true, body: await response.text() };
  } catch {
    return { ok: false, body: "" };
  }
}

function visibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&mdash;/g, "\u2014")
    .replace(/\s+/g, " ");
}

function closeEnough(a: number, b: number): boolean {
  return Math.abs(a - b) <= EPSILON;
}

function checkPortal(
  html: string,
  discrepancies: Discrepancy[],
): "ok" | "unparsed" {
  const text = visibleText(html);
  const headings = [
    ...text.matchAll(
      /(Basic|Standard|Pro|Max) \$(\d+(?:\.\d+)?) \/month (\d+(?:\.\d+)?) kWh included/g,
    ),
  ].map((m) => ({
    plan: m[1].toLowerCase() as keyof typeof PLAN_PRICING,
    price: Number(m[2]),
    kwh: Number(m[3]),
    index: m.index ?? 0,
  }));
  if (headings.length < Object.keys(PLAN_PRICING).length) return "unparsed";

  for (const [i, heading] of headings.entries()) {
    const table = PLAN_PRICING[heading.plan];
    const end = headings[i + 1]?.index ?? text.length;
    const segment = text.slice(heading.index, end);
    const overage = segment.match(/Overage at \$(\d+(?:\.\d+)?)/);
    if (!overage) return "unparsed";
    const rate = Number(overage[1]);

    if (!closeEnough(table.priceMonthlyUsd, heading.price)) {
      discrepancies.push({
        source: "portal",
        plan: heading.plan,
        field: "priceMonthlyUsd",
        table: table.priceMonthlyUsd,
        live: heading.price,
      });
    }
    if (!closeEnough(table.kwhIncluded, heading.kwh)) {
      discrepancies.push({
        source: "portal",
        plan: heading.plan,
        field: "kwhIncluded",
        table: table.kwhIncluded,
        live: heading.kwh,
      });
    }
    if (!closeEnough(table.overageMonthlyPerKwh, rate)) {
      discrepancies.push({
        source: "portal",
        plan: heading.plan,
        field: "overageMonthlyPerKwh",
        table: table.overageMonthlyPerKwh,
        live: rate,
      });
    }
  }
  return "ok";
}

function checkFaq(
  markdown: string,
  discrepancies: Discrepancy[],
): "ok" | "unparsed" {
  const rows = [
    ...markdown.matchAll(
      /^\|\s*(Basic|Standard|Pro|Max)\s*\|\s*\\?\$(\d+(?:\.\d+)?)\/kWh\s*\|\s*\\?\$(\d+(?:\.\d+)?)\/kWh\s*\|$/gm,
    ),
  ].map((m) => ({
    plan: m[1].toLowerCase() as keyof typeof PLAN_PRICING,
    monthly: Number(m[2]),
    annual: Number(m[3]),
  }));
  if (rows.length < Object.keys(PLAN_PRICING).length) return "unparsed";

  for (const row of rows) {
    const table = PLAN_PRICING[row.plan];
    if (!closeEnough(table.overageMonthlyPerKwh, row.monthly)) {
      discrepancies.push({
        source: "faq",
        plan: row.plan,
        field: "overageMonthlyPerKwh",
        table: table.overageMonthlyPerKwh,
        live: row.monthly,
      });
    }
    if (!closeEnough(table.overageAnnualPerKwh, row.annual)) {
      discrepancies.push({
        source: "faq",
        plan: row.plan,
        field: "overageAnnualPerKwh",
        table: table.overageAnnualPerKwh,
        live: row.annual,
      });
    }
  }
  return "ok";
}

async function checkQuota(
  discrepancies: Discrepancy[],
): Promise<"ok" | "skipped"> {
  const base = (
    process.env.NEURALWATT_API_BASE_URL ?? DEFAULT_API_BASE_URL
  ).replace(/\/+$/u, "");
  const apiKey = process.env.NEURALWATT_API_KEY;
  const headers: Record<string, string> =
    apiKey && apiKey !== "-" ? { Authorization: `Bearer ${apiKey}` } : {};

  let response: Response;
  try {
    response = await fetch(`${base}/v1/quota`, {
      headers,
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    console.error(`[check-pricing] live quota unreachable, skipping: ${error}`);
    return "skipped";
  }
  if (response.status === 401 || response.status === 403) {
    console.error(
      `[check-pricing] live quota unauthorized (no NEURALWATT_API_KEY, or base URL rejects anonymous), skipping`,
    );
    return "skipped";
  }
  if (!response.ok) {
    console.error(
      `[check-pricing] live quota failed: ${response.status} ${response.statusText}, skipping`,
    );
    return "skipped";
  }

  const data = await response.json();
  const sub = data?.subscription;
  if (!sub?.plan) return "skipped";
  const pricing = planPricing(sub.plan);
  if (!pricing) return "skipped";

  const expected = pricing.priceMonthlyUsd / pricing.overageMonthlyPerKwh;
  if (
    typeof sub.kwh_included === "number" &&
    !closeEnough(sub.kwh_included, expected)
  ) {
    discrepancies.push({
      source: "quota",
      plan: sub.plan,
      field: "kwh_included (price/rate)",
      table: Number(expected.toFixed(4)),
      live: sub.kwh_included,
    });
  }
  return "ok";
}

function formatTable(discrepancies: Discrepancy[]): string {
  const lines = [
    "| Source | Plan | Field | Table | Live |",
    "|---|---|---|---|---|",
  ];
  for (const d of discrepancies) {
    lines.push(
      `| ${d.source} | ${d.plan} | ${d.field} | ${JSON.stringify(d.table)} | ${JSON.stringify(d.live)} |`,
    );
  }
  return lines.join("\n");
}

function report(discrepancies: Discrepancy[]): void {
  console.log(
    [
      "The hardcoded plan pricing table has drifted from Neuralwatt's public sources.",
      "",
      `Compared \`PLAN_PRICING\` (src/lib/plan-pricing.ts) against ${PRICING_URL} and ${FAQ_URL}. Update the table to match.`,
      "",
      formatTable(discrepancies),
    ].join("\n"),
  );
}

async function main(): Promise<void> {
  const discrepancies: Discrepancy[] = [];
  const failures: string[] = [];

  const [portal, faq] = await Promise.all([
    fetchText(PRICING_URL),
    fetchText(FAQ_URL),
  ]);
  if (!portal.ok) {
    failures.push(`portal pricing page (${portal.status ?? "network error"})`);
  } else if (checkPortal(portal.body, discrepancies) === "unparsed") {
    failures.push("portal pricing page (plan rows not found in markup)");
  }

  if (!faq.ok) {
    failures.push(`billing FAQ (${faq.status ?? "network error"})`);
  } else if (checkFaq(faq.body, discrepancies) === "unparsed") {
    failures.push("billing FAQ (overage table not found in markdown)");
  }

  const quota = await checkQuota(discrepancies);
  if (quota === "skipped") {
    console.error(
      "[check-pricing] live quota cross-check skipped; public sources only.",
    );
  }

  if (discrepancies.length === 0 && failures.length === 0) {
    console.log("No drift: the plan pricing table matches the public sources.");
    return;
  }

  if (discrepancies.length > 0) {
    report(discrepancies);
    process.exitCode = 1;
  }
  if (failures.length > 0) {
    console.error(
      `[check-pricing] sources could not be checked: ${failures.join(", ")}`,
    );
    if (discrepancies.length === 0) process.exit(2);
  }
}

main().catch((error) => {
  console.error(`[check-pricing] could not run: ${error}`);
  process.exit(2);
});
