import { describe, expect, it } from "vitest";
import type { Payment, PawnTicket } from "../types";
import { calculateInterestPaise, netWeight, ticketBalance } from "./finance";

describe("pawn finance", () => {
  it("calculates net gold weight and rejects impossible stone weights", () => {
    expect(netWeight(12.345, 1.125)).toBe(11.22);
    expect(() => netWeight(4, 5)).toThrow(/stone weight/i);
  });

  it("uses the configured daily day-count basis and rounds to paise", () => {
    expect(calculateInterestPaise(1_000_000, 1600, "2025-01-01", "2025-01-31", "daily", 365)).toBe(13_151);
    expect(calculateInterestPaise(1_000_000, 1600, "2025-01-01", "2025-01-31", "daily", 360)).toBe(13_333);
  });

  it("accrues full calendar months and years under those selected methods", () => {
    expect(calculateInterestPaise(120_000, 1200, "2025-01-01", "2025-02-01", "monthly", 365)).toBe(1_200);
    expect(calculateInterestPaise(120_000, 1600, "2024-01-01", "2025-01-01", "annual", 365)).toBe(19_200);
  });

  it("carries unpaid interest and reduces future interest after principal repayment", () => {
    const ticket: PawnTicket = {
      id: "ticket-1", receiptNo: "GL-1", customerId: "customer-1", jewelleryType: "Chain",
      purity: "22K", grossWeight: 10, stoneWeight: 0, loanPaise: 1_000_000,
      annualRateBps: 1600, approximateValuePaise: 1_200_000,
      declaredMonthlyIncomePaise: 0, signatureCiphertext: null,
      pawnDate: "2025-01-01", maturityDate: "2025-04-01",
      notes: "", status: "active", createdAt: "2025-01-01T00:00:00.000Z",
    };
    const paidInterest: Payment = {
      id: "payment-1", transactionNo: "TXN-1", ticketId: ticket.id,
      amountPaise: 13_151, interestPaise: 13_151, principalPaise: 0,
      method: "Cash", paidAt: "2025-01-31T12:00:00.000Z",
    };
    const partialPrincipal: Payment = {
      id: "payment-2", transactionNo: "TXN-2", ticketId: ticket.id,
      amountPaise: 100_000, interestPaise: 13_151, principalPaise: 86_849,
      method: "UPI", paidAt: "2025-03-02T12:00:00.000Z",
    };
    const balance = ticketBalance(
      ticket, [paidInterest, partialPrincipal], "2025-03-12", "daily", 365,
    );
    expect(balance.principalPaise).toBe(913_151);
    expect(balance.interestPaise).toBe(4_003);
    expect(balance.totalPaise).toBe(917_154);
  });

  it("rejects malformed dates instead of producing a financial amount", () => {
    expect(() => calculateInterestPaise(100, 1600, "not-a-date", "2025-01-01", "daily", 365)).toThrow(/date/i);
    expect(() => calculateInterestPaise(100, 1600, "2025-02-30", "2025-03-01", "daily", 365)).toThrow(/date/i);
    expect(() => calculateInterestPaise(100, 1600, "2025-02-01", "2025-01-01", "daily", 365)).toThrow(/before/i);
  });
});
