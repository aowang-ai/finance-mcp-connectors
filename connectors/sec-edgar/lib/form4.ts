/** Minimal Form 4 XML parser (regex based: Workers have no DOMParser). */

const CODE_LABELS: Record<string, string> = {
  P: "open-market purchase",
  S: "open-market sale",
  A: "grant or award",
  M: "option exercise",
  F: "tax withholding",
  G: "gift",
  C: "conversion",
  D: "disposition to issuer",
  X: "option exercise (in the money)",
  J: "other",
  I: "discretionary",
  W: "will or inheritance",
  K: "equity swap",
};

function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .trim();
}
function tag(xml: string, name: string): string | undefined {
  const m = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  if (!m) return undefined;
  const inner = m[1];
  const v = inner.match(/<value>([\s\S]*?)<\/value>/);
  return decode(v ? v[1] : inner.replace(/<[^>]+>/g, ""));
}
function blocks(xml: string, name: string): string[] {
  return [...xml.matchAll(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, "g"))].map((m) => m[1]);
}
const num = (s?: string) =>
  s === undefined || s === "" || Number.isNaN(Number(s)) ? null : Number(s);
const bool = (s?: string) => s === "1" || s?.toLowerCase() === "true";

export interface Form4Transaction {
  security?: string;
  date?: string;
  code?: string;
  codeLabel?: string;
  shares: number | null;
  price: number | null;
  acquiredOrDisposed?: "A" | "D";
  sharesOwnedAfter: number | null;
  value: number | null;
  derivative: boolean;
}
export interface Form4Summary {
  owner?: string;
  ownerCik?: string;
  roles: string[];
  officerTitle?: string;
  periodOfReport?: string;
  tenb5_1?: boolean;
  transactions: Form4Transaction[];
}

export function parseForm4(xml: string): Form4Summary {
  const ownerBlock = blocks(xml, "reportingOwner")[0] ?? "";
  const rel = blocks(ownerBlock, "reportingOwnerRelationship")[0] ?? "";
  const roles: string[] = [];
  if (bool(tag(rel, "isDirector"))) roles.push("director");
  if (bool(tag(rel, "isOfficer"))) roles.push("officer");
  if (bool(tag(rel, "isTenPercentOwner"))) roles.push("10% owner");
  if (bool(tag(rel, "isOther"))) roles.push("other");
  const tx = (b: string, derivative: boolean): Form4Transaction => {
    const shares = num(tag(b, "transactionShares"));
    const price = num(tag(b, "transactionPricePerShare"));
    const code = tag(b, "transactionCode");
    const ad = tag(b, "transactionAcquiredDisposedCode");
    return {
      security: tag(b, "securityTitle"),
      date: tag(b, "transactionDate"),
      code,
      codeLabel: code ? CODE_LABELS[code] : undefined,
      shares,
      price,
      acquiredOrDisposed: ad === "A" || ad === "D" ? ad : undefined,
      sharesOwnedAfter: num(tag(b, "sharesOwnedFollowingTransaction")),
      value: shares !== null && price !== null ? Math.round(shares * price * 100) / 100 : null,
      derivative,
    };
  };
  const a10 = tag(xml, "aff10b5One");
  return {
    owner: tag(ownerBlock, "rptOwnerName"),
    ownerCik: tag(ownerBlock, "rptOwnerCik"),
    roles,
    officerTitle: tag(rel, "officerTitle") || undefined,
    periodOfReport: tag(xml, "periodOfReport"),
    tenb5_1: a10 === undefined ? undefined : bool(a10),
    transactions: [
      ...blocks(xml, "nonDerivativeTransaction").map((b) => tx(b, false)),
      ...blocks(xml, "derivativeTransaction").map((b) => tx(b, true)),
    ],
  };
}

/** Aggregate open-market buys and sells across parsed filings. */
export function summarizeInsiders(items: Form4Summary[]) {
  let buyShares = 0,
    buyValue = 0,
    sellShares = 0,
    sellValue = 0,
    buys = 0,
    sells = 0;
  for (const f of items)
    for (const t of f.transactions) {
      if (t.derivative) continue;
      if (t.code === "P") {
        buys++;
        buyShares += t.shares ?? 0;
        buyValue += t.value ?? 0;
      }
      if (t.code === "S") {
        sells++;
        sellShares += t.shares ?? 0;
        sellValue += t.value ?? 0;
      }
    }
  const r = (x: number) => Math.round(x);
  return {
    openMarketBuys: { transactions: buys, shares: r(buyShares), value: r(buyValue) },
    openMarketSales: { transactions: sells, shares: r(sellShares), value: r(sellValue) },
    netShares: r(buyShares - sellShares),
  };
}
