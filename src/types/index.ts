export type Language = "en" | "ta";
export type Page = "dashboard" | "customers" | "tickets" | "payments" | "reports";
export type PaymentMethod = "Cash" | "UPI" | "Other";
export type InterestMethod = "daily" | "monthly" | "annual";

export interface Customer {
  id: string;
  customerNo: string;
  name: string;
  mobile: string;
  address: string;
  idReference: string;
  createdAt: string;
}

export interface PawnTicket {
  id: string;
  receiptNo: string;
  customerId: string;
  jewelleryType: string;
  purity: "24K" | "22K" | "20K" | "18K";
  grossWeight: number;
  stoneWeight: number;
  loanPaise: number;
  annualRateBps: number;
  approximateValuePaise: number;
  declaredMonthlyIncomePaise: number;
  signatureCiphertext: string | null;
  pawnDate: string;
  maturityDate: string;
  notes: string;
  status: "active" | "redeemed";
  createdAt: string;
}

export interface Payment {
  id: string;
  transactionNo: string;
  ticketId: string;
  amountPaise: number;
  interestPaise: number;
  principalPaise: number;
  method: PaymentMethod;
  paidAt: string;
}

export interface ShopSettings {
  name: string;
  defaultRateBps: number;
  interestMethod: InterestMethod;
  dayCountBasis: 360 | 365;
  currency: string;
}

export interface LedgerData {
  customers: Customer[];
  tickets: PawnTicket[];
  payments: Payment[];
  settings: ShopSettings;
}
