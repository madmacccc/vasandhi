import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Customer, PawnTicket } from "../types";
import ReceiptPrint from "./ReceiptPrint";

const customer: Customer = {
  id: "customer-1",
  customerNo: "CUS-1",
  name: "மாலதி",
  mobile: "9876543210",
  address: "காசிராமன் தெரு",
  idReference: "",
  createdAt: "2026-11-16T00:00:00.000Z",
};

const ticket: PawnTicket = {
  id: "ticket-1",
  receiptNo: "GL-2026-1",
  customerId: customer.id,
  jewelleryType: "சங்கிலி",
  purity: "22K",
  grossWeight: 10.25,
  stoneWeight: 0.25,
  loanPaise: 100_000,
  annualRateBps: 1600,
  approximateValuePaise: 120_000,
  declaredMonthlyIncomePaise: 30_000,
  signatureCiphertext: null,
  pawnDate: "2026-11-16",
  maturityDate: "2027-02-14",
  notes: "",
  status: "active",
  createdAt: "2026-11-16T00:00:00.000Z",
};

describe("pawn receipt", () => {
  it("prints the supplied Tamil shop identity, receipt fields and safekeeping note", () => {
    const markup = renderToStaticMarkup(
      <ReceiptPrint ticket={ticket} customer={customer} signature="" language="ta" />,
    );
    expect(markup).toContain("ஸ்ரீ வசந்தி நகை அடகு கடை");
    expect(markup).toContain("மாநகராட்சி புதிய வணிக வளாகம்");
    expect(markup).toContain("அடியிற்கண்ட பொருள்கள் எங்களிடம் அடகு வைக்கப்பட்டுள்ளன.");
    expect(markup).toContain("வட்டி விகிதம்");
    expect(markup).toContain("உண்மையான சராசரி மாத வருமானம்");
    expect(markup).toContain("இந்த சீட்டை பத்திரமாக பாதுகாப்பாக வைத்துக் கொள்ளவும்.");
    expect(markup).not.toContain(ticket.receiptNo);
  });

  it("uses English receipt labels and shop identity when switched to English", () => {
    const markup = renderToStaticMarkup(
      <ReceiptPrint ticket={ticket} customer={customer} signature="" language="en" />,
    );
    expect(markup).toContain("Sri Vasanthi Jewellery Pawn Broker");
    expect(markup).toContain("PLEDGE RECEIPT");
    expect(markup).toContain("Please keep this receipt safely.");
    expect(markup).not.toContain("அடகு சீட்டு");
  });
});
