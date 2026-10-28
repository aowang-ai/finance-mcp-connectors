/**
 * Normalize SEC XBRL companyfacts into comparable statement lines.
 * Pure functions (no I/O) so they are unit-testable with fixtures.
 */

export interface Fact {
  start?: string;
  end: string;
  val: number;
  accn: string;
  fy?: number;
  fp?: string;
  form?: string;
  filed?: string;
  frame?: string;
}
export interface CompanyFacts {
  cik?: number;
  entityName?: string;
  facts?: Record<string, Record<string, { units?: Record<string, Fact[]> }>>;
}

type Kind = "flow" | "instant";
interface LineSpec {
  key: string;
  kind: Kind;
  unit: string;
  tags: string[];
  taxonomy?: string;
}

/** Ordered tag fallbacks per line (first tag with a value for that period wins). */
export const LINES: LineSpec[] = [
  {
    key: "revenue",
    kind: "flow",
    unit: "USD",
    tags: [
      "Revenues",
      "RevenueFromContractWithCustomerExcludingAssessedTax",
      "RevenueFromContractWithCustomerIncludingAssessedTax",
      "SalesRevenueNet",
      "SalesRevenueGoodsNet",
      "RevenuesNetOfInterestExpense",
    ],
  },
  {
    key: "costOfRevenue",
    kind: "flow",
    unit: "USD",
    tags: [
      "CostOfRevenue",
      "CostOfGoodsAndServicesSold",
      "CostOfGoodsSold",
      "CostOfGoodsAndServiceExcludingDepreciationDepletionAndAmortization",
    ],
  },
  { key: "grossProfit", kind: "flow", unit: "USD", tags: ["GrossProfit"] },
  {
    key: "researchAndDevelopment",
    kind: "flow",
    unit: "USD",
    tags: [
      "ResearchAndDevelopmentExpense",
      "ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost",
    ],
  },
  { key: "operatingIncome", kind: "flow", unit: "USD", tags: ["OperatingIncomeLoss"] },
  {
    key: "netIncome",
    kind: "flow",
    unit: "USD",
    tags: ["NetIncomeLoss", "ProfitLoss", "NetIncomeLossAvailableToCommonStockholdersBasic"],
  },
  {
    key: "epsDiluted",
    kind: "flow",
    unit: "USD/shares",
    tags: ["EarningsPerShareDiluted", "EarningsPerShareBasicAndDiluted"],
  },
  {
    key: "sharesDiluted",
    kind: "flow",
    unit: "shares",
    tags: [
      "WeightedAverageNumberOfDilutedSharesOutstanding",
      "WeightedAverageNumberOfShareOutstandingBasicAndDiluted",
    ],
  },
  { key: "totalAssets", kind: "instant", unit: "USD", tags: ["Assets"] },
  { key: "totalLiabilities", kind: "instant", unit: "USD", tags: ["Liabilities"] },
  {
    key: "totalEquity",
    kind: "instant",
    unit: "USD",
    tags: [
      "StockholdersEquity",
      "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest",
    ],
  },
  {
    key: "liabilitiesAndEquity",
    kind: "instant",
    unit: "USD",
    tags: ["LiabilitiesAndStockholdersEquity"],
  },
  {
    key: "cash",
    kind: "instant",
    unit: "USD",
    tags: [
      "CashAndCashEquivalentsAtCarryingValue",
      "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents",
      "Cash",
    ],
  },
  {
    key: "shortTermInvestments",
    kind: "instant",
    unit: "USD",
    tags: [
      "ShortTermInvestments",
      "MarketableSecuritiesCurrent",
      "AvailableForSaleSecuritiesDebtSecuritiesCurrent",
    ],
  },
  {
    key: "longTermDebt",
    kind: "instant",
    unit: "USD",
    tags: [
      "LongTermDebt",
      "LongTermDebtAndCapitalLeaseObligations",
      "DebtInstrumentCarryingAmount",
    ],
  },
  {
    key: "longTermDebtNoncurrent",
    kind: "instant",
    unit: "USD",
    tags: ["LongTermDebtNoncurrent", "LongTermDebtAndCapitalLeaseObligationsNoncurrent"],
  },
  {
    key: "debtCurrent",
    kind: "instant",
    unit: "USD",
    tags: ["LongTermDebtCurrent", "DebtCurrent", "LongTermDebtAndCapitalLeaseObligationsCurrent"],
  },
  {
    key: "shortTermBorrowings",
    kind: "instant",
    unit: "USD",
    tags: ["ShortTermBorrowings", "CommercialPaper"],
  },
  {
    key: "operatingCashFlow",
    kind: "flow",
    unit: "USD",
    tags: [
      "NetCashProvidedByUsedInOperatingActivities",
      "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations",
    ],
  },
  {
    key: "capex",
    kind: "flow",
    unit: "USD",
    tags: [
      "PaymentsToAcquirePropertyPlantAndEquipment",
      "PaymentsToAcquireProductiveAssets",
      "PaymentsForCapitalImprovements",
    ],
  },
  {
    key: "dividendsPaid",
    kind: "flow",
    unit: "USD",
    tags: ["PaymentsOfDividends", "PaymentsOfDividendsCommonStock"],
  },
  { key: "buybacks", kind: "flow", unit: "USD", tags: ["PaymentsForRepurchaseOfCommonStock"] },
  {
    key: "sharesOutstanding",
    kind: "instant",
    unit: "shares",
    taxonomy: "dei",
    tags: ["EntityCommonStockSharesOutstanding"],
  },
];

const DAY = 86_400_000;
const t = (d: string) => Date.parse(`${d}T00:00:00Z`);
const days = (a: string, b: string) => Math.round((t(b) - t(a)) / DAY);
const addDays = (d: string, n: number) => new Date(t(d) + n * DAY).toISOString().slice(0, 10);
const near = (a: string, b: string, tol = 7) => Math.abs(days(a, b)) <= tol;

function factsFor(cf: CompanyFacts, spec: LineSpec, tag: string): Fact[] {
  const tax = cf.facts?.[spec.taxonomy ?? "us-gaap"];
  return tax?.[tag]?.units?.[spec.unit] ?? [];
}

/** Dedupe by (start,end): keep the latest filing's value (restatements win), remember the original accn. */
interface Pt {
  start?: string;
  end: string;
  val: number;
  accn: string;
  filed: string;
  form?: string;
  fy?: number;
  fp?: string;
  origAccn: string;
  origForm?: string;
  origFy?: number;
  origFp?: string;
}
function dedupe(facts: Fact[]): Map<string, Pt> {
  const m = new Map<string, Pt>();
  for (const f of facts) {
    if (typeof f.val !== "number") continue;
    const k = `${f.start ?? ""}|${f.end}`;
    const filed = f.filed ?? "";
    const prev = m.get(k);
    if (!prev) {
      m.set(k, {
        start: f.start,
        end: f.end,
        val: f.val,
        accn: f.accn,
        filed,
        form: f.form,
        fy: f.fy,
        fp: f.fp,
        origAccn: f.accn,
        origForm: f.form,
        origFy: f.fy,
        origFp: f.fp,
      });
      continue;
    }
    if (filed > prev.filed) {
      prev.val = f.val;
      prev.accn = f.accn;
      prev.filed = filed;
      prev.form = f.form;
    }
  }
  // second pass for original filing
  for (const f of facts) {
    const p = m.get(`${f.start ?? ""}|${f.end}`);
    if (!p) continue;
    const pf = facts.find(
      (x) => x.accn === p.origAccn && x.end === f.end && (x.start ?? "") === (f.start ?? ""),
    );
    if ((f.filed ?? "") < (pf?.filed ?? "9999")) {
      p.origAccn = f.accn;
      p.origForm = f.form;
      p.origFy = f.fy;
      p.origFp = f.fp;
    }
  }
  return m;
}

export type Period = "annual" | "quarterly";
interface Window {
  start?: string;
  end: string;
}

class LineIndex {
  private pts = new Map<string, Pt[]>(); // per tag
  constructor(
    cf: CompanyFacts,
    private spec: LineSpec,
  ) {
    for (const tag of spec.tags) this.pts.set(tag, [...dedupe(factsFor(cf, spec, tag)).values()]);
  }
  /** value for a window, trying tags in order; flows may be derived from YTD differences. */
  value(
    w: Window,
    period: Period,
  ): { val: number; tag: string; accn: string; derived?: boolean } | undefined {
    for (const tag of this.spec.tags) {
      const pts = this.pts.get(tag)!;
      if (this.spec.kind === "instant") {
        const p = pts
          .filter((x) => near(x.end, w.end, 3))
          .sort((a, b) => b.filed.localeCompare(a.filed))[0];
        if (p) return { val: p.val, tag, accn: p.accn };
        continue;
      }
      const direct = pts.find(
        (x) => x.start && near(x.start, w.start!, 4) && near(x.end, w.end, 4),
      );
      if (direct) return { val: direct.val, tag, accn: direct.accn };
      if (
        period === "quarterly" &&
        this.spec.unit !== "USD/shares" &&
        this.spec.unit !== "shares"
      ) {
        // YTD(S..end) minus YTD(S..start-1)
        for (const ytd of pts) {
          if (!ytd.start || !near(ytd.end, w.end, 4) || days(ytd.start, w.start!) < 60) continue;
          const prior = pts.find(
            (x) => x.start && near(x.start, ytd.start!, 4) && near(x.end, addDays(w.start!, -1), 6),
          );
          if (prior) return { val: ytd.val - prior.val, tag, accn: ytd.accn, derived: true };
        }
      }
    }
    return undefined;
  }
  windows(
    period: Period,
  ): (Window & { accn: string; form?: string; fy?: number; fp?: string; filed: string })[] {
    const out: (Window & {
      accn: string;
      form?: string;
      fy?: number;
      fp?: string;
      filed: string;
    })[] = [];
    for (const tag of this.spec.tags) {
      for (const p of this.pts.get(tag)!) {
        if (!p.start) continue;
        const d = days(p.start, p.end);
        const ok = period === "annual" ? d >= 340 && d <= 380 : d >= 80 && d <= 100;
        if (ok)
          out.push({
            start: p.start,
            end: p.end,
            accn: p.origAccn,
            form: p.origForm,
            fy: p.origFy,
            fp: p.origFp,
            filed: p.filed,
          });
        if (period === "quarterly" && d >= 340 && d <= 380) {
          // Q4 = annual minus nine months
          const nine = this.pts
            .get(tag)
            ?.find(
              (x) =>
                x.start &&
                near(x.start, p.start!, 4) &&
                days(x.start, x.end) >= 250 &&
                days(x.start, x.end) <= 290,
            );
          if (nine)
            out.push({
              start: addDays(nine.end, 1),
              end: p.end,
              accn: p.origAccn,
              form: p.origForm,
              fy: p.origFy,
              fp: "Q4",
              filed: p.filed,
            });
        }
      }
    }
    return out;
  }
}

export interface NormalizedPeriod {
  fiscalYear?: number;
  fiscalPeriod?: string;
  periodStart?: string;
  periodEnd: string;
  form?: string;
  accession: string;
  filingUrl?: string;
  income: Record<string, number | null>;
  balance: Record<string, number | null>;
  cashFlow: Record<string, number | null>;
  ratios: Record<string, number | null>;
  growth: Record<string, number | null>;
  notes?: string[];
}

const round = (x: number | null | undefined, dp = 4) =>
  x === null || x === undefined || !Number.isFinite(x) ? null : Math.round(x * 10 ** dp) / 10 ** dp;
const ratio = (a?: number | null, b?: number | null) =>
  a == null || b == null || b === 0 ? null : round(a / b);
const growth = (a?: number | null, b?: number | null) =>
  a == null || b == null || b === 0 ? null : round((a - b) / Math.abs(b));

export function normalizeFundamentals(
  cf: CompanyFacts,
  period: Period,
  limit: number,
  cikInt?: number,
) {
  const idx: Record<string, LineIndex> = {};
  for (const s of LINES) idx[s.key] = new LineIndex(cf, s);

  // candidate periods from revenue and net income (union), newest first, one per end date
  const cands = [
    ...idx.revenue.windows(period),
    ...idx.netIncome.windows(period),
    ...idx.operatingIncome.windows(period),
  ];
  const byEnd = new Map<string, (typeof cands)[number]>();
  for (const c of cands.sort((a, b) => a.filed.localeCompare(b.filed))) {
    const k = [...byEnd.keys()].find((e) => near(e, c.end, 4)) ?? c.end;
    if (!byEnd.has(k)) byEnd.set(k, c);
  }
  const windows = [...byEnd.values()].sort((a, b) => b.end.localeCompare(a.end));

  const computed = windows.map((w) => {
    const v = (k: string) => idx[k].value(w, period)?.val ?? null;
    const revenue = v("revenue");
    const cost = v("costOfRevenue");
    let grossProfit = v("grossProfit");
    if (grossProfit === null && revenue !== null && cost !== null) grossProfit = revenue - cost;
    const totalAssets = v("totalAssets");
    const totalEquity = v("totalEquity");
    let totalLiabilities = v("totalLiabilities");
    const le = v("liabilitiesAndEquity");
    if (totalLiabilities === null && le !== null && totalEquity !== null)
      totalLiabilities = le - totalEquity;
    const ltd = v("longTermDebt");
    const ltdNc = v("longTermDebtNoncurrent");
    const cur = v("debtCurrent");
    const stb = v("shortTermBorrowings");
    let totalDebt: number | null =
      ltd !== null ? ltd : ltdNc !== null || cur !== null ? (ltdNc ?? 0) + (cur ?? 0) : null;
    if (totalDebt !== null && stb !== null && ltd === null) totalDebt += stb;
    else if (totalDebt !== null && stb !== null) totalDebt += stb;
    const ocf = v("operatingCashFlow");
    const capex = v("capex");
    const fcf = ocf !== null ? ocf - (capex ?? 0) : null;
    const cash = v("cash");
    // shares outstanding (dei) is reported at cover date, after period end: take nearest within 120 days
    let sharesOutstanding: number | null = null;
    {
      const facts = factsFor(
        cf,
        LINES.find((l) => l.key === "sharesOutstanding")!,
        "EntityCommonStockSharesOutstanding",
      )
        .filter((f) => {
          const d = days(w.end, f.end);
          return d >= 0 && d <= 120;
        })
        .sort((a, b) => a.end.localeCompare(b.end));
      sharesOutstanding = facts[0]?.val ?? null;
    }
    const incomeOut = {
      revenue,
      costOfRevenue: cost,
      grossProfit,
      researchAndDevelopment: v("researchAndDevelopment"),
      operatingIncome: v("operatingIncome"),
      netIncome: v("netIncome"),
      epsDiluted: v("epsDiluted"),
      sharesDiluted: v("sharesDiluted"),
    };
    const balanceOut = {
      totalAssets,
      totalLiabilities,
      totalEquity,
      cash,
      shortTermInvestments: v("shortTermInvestments"),
      totalDebt,
      netDebt: totalDebt !== null ? totalDebt - (cash ?? 0) : null,
      sharesOutstanding,
    };
    const cashOut = {
      operatingCashFlow: ocf,
      capex,
      freeCashFlow: fcf,
      dividendsPaid: v("dividendsPaid"),
      buybacks: v("buybacks"),
    };
    return { w, incomeOut, balanceOut, cashOut };
  });

  // fiscal calendar from the latest annual period: label every period by the fiscal year it ends in
  const annualEnds = idx.revenue
    .windows("annual")
    .concat(idx.netIncome.windows("annual"))
    .map((w) => w.end)
    .sort();
  const fyEnd = annualEnds[annualEnds.length - 1];
  const fiscalLabel = (end: string): { fy?: number; fp?: string } => {
    if (!fyEnd) return {};
    const [, m, d] = fyEnd.split("-").map(Number);
    let y = Number(end.slice(0, 4)) - 1;
    for (;;) {
      const cand = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      if (days(end, cand) >= -10) {
        // a fiscal year ending in the first week of January is named after the prior calendar year
        const fy = m === 1 && d <= 10 ? y - 1 : y;
        const q = Math.min(4, Math.max(1, 4 - Math.floor((days(end, cand) + 10) / 91)));
        return { fy, fp: period === "annual" ? "FY" : `Q${q}` };
      }
      y++;
    }
  };

  const findPrior = (end: string, back: number) =>
    computed.find((c) => near(c.w.end, addDays(end, -back), 12));
  const out: NormalizedPeriod[] = computed.slice(0, limit).map((c) => {
    const yoy = findPrior(c.w.end, 365);
    const qoq = period === "quarterly" ? findPrior(c.w.end, 91) : undefined;
    const i = c.incomeOut,
      b = c.balanceOut,
      f = c.cashOut;
    const g: Record<string, number | null> = {
      revenueYoY: growth(i.revenue, yoy?.incomeOut.revenue),
      netIncomeYoY: growth(i.netIncome, yoy?.incomeOut.netIncome),
      epsDilutedYoY: growth(i.epsDiluted, yoy?.incomeOut.epsDiluted),
      freeCashFlowYoY: growth(f.freeCashFlow, yoy?.cashOut.freeCashFlow),
    };
    if (period === "quarterly") g.revenueQoQ = growth(i.revenue, qoq?.incomeOut.revenue);
    const notes: string[] = [];
    if (i.revenue === null) notes.push("revenue not tagged for this period");
    const urls = cikInt
      ? `https://www.sec.gov/Archives/edgar/data/${cikInt}/${c.w.accn.replace(/-/g, "")}/${c.w.accn}-index.htm`
      : undefined;
    const lbl = fiscalLabel(c.w.end);
    if (period === "quarterly" && lbl.fp === "Q4" && i.epsDiluted === null)
      notes.push("Q4 EPS is only reported for the full year");
    return {
      fiscalYear: lbl.fy ?? c.w.fy,
      fiscalPeriod: lbl.fp ?? (period === "annual" ? "FY" : c.w.fp),
      periodStart: c.w.start,
      periodEnd: c.w.end,
      form: c.w.form,
      accession: c.w.accn,
      filingUrl: urls,
      income: i,
      balance: b,
      cashFlow: f,
      ratios: {
        grossMargin: ratio(i.grossProfit, i.revenue),
        operatingMargin: ratio(i.operatingIncome, i.revenue),
        netMargin: ratio(i.netIncome, i.revenue),
        fcfMargin: ratio(f.freeCashFlow, i.revenue),
        debtToEquity: ratio(b.totalDebt, b.totalEquity),
        returnOnEquity: period === "annual" ? ratio(i.netIncome, b.totalEquity) : null,
      },
      growth: g,
      ...(notes.length ? { notes } : {}),
    };
  });
  return { periods: out, availablePeriods: computed.length };
}
