import type { InterestMethod, Payment, PawnTicket } from "../types";
import { paymentDateKey } from "./date";

const DAY_MS = 86_400_000;

export function netWeight(grossWeight: number, stoneWeight: number): number {
  if (!Number.isFinite(grossWeight) || !Number.isFinite(stoneWeight) ||
      grossWeight < 0 || stoneWeight < 0 || stoneWeight > grossWeight) {
    throw new Error("Stone weight must be between zero and gross weight.");
  }
  return Math.round((grossWeight - stoneWeight) * 1000) / 1000;
}

export function calculateInterestPaise(
  principalPaise: number,
  annualRateBps: number,
  fromDate: string,
  toDate: string,
  method: InterestMethod,
  dayCountBasis: 360 | 365,
): number {
  if (!Number.isSafeInteger(principalPaise) || principalPaise < 0 ||
      !Number.isSafeInteger(annualRateBps) || annualRateBps < 0) {
    throw new Error("Principal and interest rate must be non-negative integers.");
  }
  const start = parseDateKey(fromDate);
  const end = parseDateKey(toDate);
  if (!Number.isFinite(start) || !Number.isFinite(end)) throw new Error("Invalid interest date.");
  if (end < start) throw new Error("Interest end date cannot be before its start date.");
  const elapsedDays = Math.max(0, Math.floor((end - start) / DAY_MS));
  const rate = annualRateBps / 10_000;
  if (method === "daily") {
    return Math.round(principalPaise * rate * elapsedDays / dayCountBasis);
  }
  if (method !== "monthly" && method !== "annual") throw new Error("Unsupported interest method.");
  let cursor = start;
  let accrued = 0;
  while (cursor < end) {
    const date = new Date(cursor);
    const nextPeriod = method === "monthly"
      ? Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)
      : Date.UTC(date.getUTCFullYear() + 1, 0, 1);
    const periodEnd = Math.min(end, nextPeriod);
    const daysInPeriod = (nextPeriod - Date.UTC(
      date.getUTCFullYear(), method === "monthly" ? date.getUTCMonth() : 0, 1,
    )) / DAY_MS;
    const periodDays = (periodEnd - cursor) / DAY_MS;
    accrued += method === "monthly"
      ? principalPaise * rate / 12 * periodDays / daysInPeriod
      : principalPaise * rate * periodDays / daysInPeriod;
    cursor = periodEnd;
  }
  return Math.round(accrued);
}

function parseDateKey(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return Number.NaN;
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value
    ? parsed
    : Number.NaN;
}

export function ticketBalance(
  ticket: PawnTicket,
  payments: Payment[],
  asOf: string,
  method: InterestMethod,
  dayCountBasis: 360 | 365,
): { principalPaise: number; interestPaise: number; totalPaise: number } {
  const relevant = payments
    .filter((payment) => payment.ticketId === ticket.id && paymentDateKey(payment.paidAt) <= asOf)
    .sort((a, b) => a.paidAt.localeCompare(b.paidAt));
  let principalPaise = ticket.loanPaise;
  let interestDuePaise = 0;
  let cursor = ticket.pawnDate;

  for (const payment of relevant) {
    interestDuePaise += calculateInterestPaise(
      principalPaise, ticket.annualRateBps, cursor, paymentDateKey(payment.paidAt), method, dayCountBasis,
    );
    interestDuePaise = Math.max(0, interestDuePaise - payment.interestPaise);
    principalPaise = Math.max(0, principalPaise - payment.principalPaise);
    cursor = paymentDateKey(payment.paidAt);
  }
  interestDuePaise += calculateInterestPaise(
    principalPaise, ticket.annualRateBps, cursor, asOf, method, dayCountBasis,
  );
  return { principalPaise, interestPaise: interestDuePaise, totalPaise: principalPaise + interestDuePaise };
}

export function formatMoney(paise: number, currency = "INR", language: "en" | "ta" = "en"): string {
  return new Intl.NumberFormat(language === "ta" ? "ta-IN" : "en-IN", {
    style: "currency", currency, maximumFractionDigits: 2,
  }).format(paise / 100);
}
