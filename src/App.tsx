import { useEffect, useMemo, useRef, useState, type FormEvent, type InputHTMLAttributes, type ReactNode } from "react";
import {
  Archive, Check, ChevronDown, CircleDollarSign, FileClock, Gem, Languages,
  Pencil, Plus, Printer, RotateCcw, Search, ShieldCheck, Trash2, Users, WalletCards,
} from "lucide-react";
import ReceiptPrint from "./components/ReceiptPrint";
import SignaturePad from "./components/SignaturePad";
import {
  createId, deleteTicket, loadLedger, restoreLedger, savePawnRecord,
  savePayment, updatePawnRecord,
} from "./services/database";
import {
  sendPasswordReset, signIn, signOut, subscribeToAuthChanges,
} from "./services/auth";
import type { User } from "@firebase/auth";
import AuthGate from "./components/AuthGate";
import { decryptSignature, encryptSignature } from "./services/signature";
import { translate as t } from "./translations";
import type { Customer, Language, LedgerData, Payment, PaymentMethod, PawnTicket } from "./types";
import { localDateKey } from "./utils/date";
import { formatMoney, netWeight, ticketBalance } from "./utils/finance";

type Draft = {
  customerName: string;
  customerAddress: string;
  mobile: string;
  jewelleryType: string;
  purity: PawnTicket["purity"];
  kilograms: string;
  grams: string;
  milligrams: string;
  loan: string;
  rate: string;
  pawnDate: string;
  maturityDate: string;
  approximateValue: string;
  monthlyIncome: string;
  notes: string;
};

const today = () => localDateKey(new Date());
const dateAfterDays = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return localDateKey(date);
};
const emptyLedger: LedgerData = {
  customers: [], tickets: [], payments: [],
  settings: { name: "Sri Vasanthi Jewellery Pawn Broker", defaultRateBps: 1600, interestMethod: "daily", dayCountBasis: 365, currency: "INR" },
};

function blankDraft(rateBps = 1600): Draft {
  return {
    customerName: "", customerAddress: "", mobile: "", jewelleryType: "", purity: "22K",
    kilograms: "0", grams: "", milligrams: "0", loan: "", rate: String(rateBps / 100),
    pawnDate: today(), maturityDate: dateAfterDays(90), approximateValue: "",
    monthlyIncome: "", notes: "",
  };
}

function receiptSequence(tickets: PawnTicket[]) {
  const last = tickets.reduce((max, ticket) => {
    const match = /^SV-(\d+)$/i.exec(ticket.receiptNo);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 1000);
  return `SV-${last + 1}`;
}

function weightToGrams(draft: Draft) {
  return Number(draft.kilograms || 0) * 1000 +
    Number(draft.grams || 0) + Number(draft.milligrams || 0) / 1000;
}

function validateBackup(value: unknown): value is LedgerData {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<LedgerData>;
  return Array.isArray(data.customers) && Array.isArray(data.tickets) &&
    Array.isArray(data.payments) && !!data.settings &&
    data.customers.every((item) => item && typeof item.id === "string" &&
      typeof item.customerNo === "string" && typeof item.name === "string" &&
      typeof item.mobile === "string" && typeof item.address === "string") &&
    data.tickets.every((item) => item && typeof item.id === "string" &&
      typeof item.receiptNo === "string" && typeof item.customerId === "string" &&
      ["24K", "22K", "20K", "18K"].includes(item.purity) &&
      ["active", "redeemed"].includes(item.status)) &&
    data.payments.every((item) => item && typeof item.id === "string" &&
      typeof item.transactionNo === "string" && typeof item.ticketId === "string") &&
    typeof data.settings.name === "string" &&
    ["daily", "monthly", "annual"].includes(data.settings.interestMethod);
}

function App() {
  const [language, setLanguage] = useState<Language>("ta");
  const [ledger, setLedger] = useState<LedgerData>(emptyLedger);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authBusy, setAuthBusy] = useState(true);
  const [authError, setAuthError] = useState("");
  const [activeTab, setActiveTab] = useState<"new" | "ledger">("new");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "redeemed">("all");
  const [draft, setDraft] = useState<Draft>(() => blankDraft());
  const [signatureData, setSignatureData] = useState("");
  const [signatureConsent, setSignatureConsent] = useState(false);
  const [signatureKey, setSignatureKey] = useState(0);
  const [editingTicketId, setEditingTicketId] = useState("");
  const [selectedTicketId, setSelectedTicketId] = useState("");
  const [paymentDialog, setPaymentDialog] = useState<"payment" | "redeem" | "history" | null>(null);
  const [printTicketId, setPrintTicketId] = useState("");
  const [printSignature, setPrintSignature] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const tr = (key: Parameters<typeof t>[1]) => t(language, key);

  async function refresh(showLoading = true) {
    if (showLoading) setLoading(true);
    try {
      setLedger(await loadLedger());
      setError("");
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : tr("dataError"));
      return false;
    } finally {
      setLoading(false);
    }
  }

  function connectLocal(nextUser: User | null) {
    setFirebaseUser(nextUser);
    setAuthError("");
    setAuthBusy(false);
  }

  async function syncNow() {
    await refresh(false);
  }

  async function handleSignIn(email: string, password: string) {
    setAuthBusy(true);
    setAuthError("");
    try {
      await signIn(email, password);
    } catch (reason) {
      setAuthError(reason instanceof Error ? reason.message : "Sign-in failed.");
      throw reason;
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleSignOut() {
    setAuthBusy(true);
    try {
      await signOut();
      setFirebaseUser(null);
    } catch (reason) {
      setAuthError(reason instanceof Error ? reason.message : "Sign-out failed.");
    } finally {
      setAuthBusy(false);
    }
  }

  useEffect(() => {
    void refresh();
    const unsubscribe = subscribeToAuthChanges((nextUser, authFailure) => {
      if (authFailure) {
        setAuthError(authFailure.message);
        setAuthBusy(false);
        return;
      }
      connectLocal(nextUser);
    });
    const handleOnline = () => void syncNow();
    window.addEventListener("online", handleOnline);
    return () => {
      unsubscribe();
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  function notify(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3200);
  }

  const activeTickets = ledger.tickets.filter((ticket) => ticket.status === "active");
  const redeemedTickets = ledger.tickets.filter((ticket) => ticket.status === "redeemed");
  const activePrincipal = activeTickets.reduce((sum, ticket) => sum + ticketBalance(
    ticket, ledger.payments, today(), ledger.settings.interestMethod, ledger.settings.dayCountBasis,
  ).principalPaise, 0);
  const redeemedPrincipal = redeemedTickets.reduce((sum, ticket) => sum + ticket.loanPaise, 0);
  const filteredTickets = useMemo(() => ledger.tickets.filter((ticket) => {
    const customer = ledger.customers.find((entry) => entry.id === ticket.customerId);
    const matchesText = `${ticket.receiptNo} ${customer?.name ?? ""} ${customer?.mobile ?? ""}`
      .toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
    return matchesText && (statusFilter === "all" || ticket.status === statusFilter);
  }), [ledger, query, statusFilter]);
  const selectedTicket = ledger.tickets.find((ticket) => ticket.id === selectedTicketId);
  const selectedCustomer = selectedTicket && ledger.customers.find((customer) => customer.id === selectedTicket.customerId);
  const selectedBalance = selectedTicket ? ticketBalance(
    selectedTicket, ledger.payments, today(), ledger.settings.interestMethod, ledger.settings.dayCountBasis,
  ) : undefined;
  const printTicket = ledger.tickets.find((ticket) => ticket.id === printTicketId);
  const printCustomer = printTicket && ledger.customers.find((customer) => customer.id === printTicket.customerId);
  const previewWeight = Number.isFinite(weightToGrams(draft)) ? weightToGrams(draft) : 0;
  const draftReceiptNo = editingTicketId
    ? ledger.tickets.find((ticket) => ticket.id === editingTicketId)?.receiptNo ?? receiptSequence(ledger.tickets)
    : receiptSequence(ledger.tickets);
  const previewTicket: PawnTicket = {
    id: editingTicketId || "preview",
    receiptNo: draftReceiptNo,
    customerId: editingTicketId ? ledger.tickets.find((ticket) => ticket.id === editingTicketId)?.customerId ?? "preview" : "preview",
    jewelleryType: draft.jewelleryType,
    purity: draft.purity,
    grossWeight: previewWeight,
    stoneWeight: 0,
    loanPaise: Math.max(0, Math.round(Number(draft.loan || 0) * 100)),
    annualRateBps: Math.max(0, Math.round(Number(draft.rate || 0) * 100)),
    approximateValuePaise: Math.max(0, Math.round(Number(draft.approximateValue || 0) * 100)),
    declaredMonthlyIncomePaise: Math.max(0, Math.round(Number(draft.monthlyIncome || 0) * 100)),
    signatureCiphertext: null,
    pawnDate: draft.pawnDate || today(),
    maturityDate: draft.maturityDate || dateAfterDays(90),
    notes: draft.notes,
    status: "active",
    createdAt: new Date().toISOString(),
  };
  const previewCustomer: Customer = {
    id: "preview",
    customerNo: "PREVIEW",
    name: draft.customerName,
    mobile: draft.mobile,
    address: draft.customerAddress,
    idReference: "",
    createdAt: new Date().toISOString(),
  };

  function updateDraft<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function clearDraft() {
    setDraft(blankDraft(ledger.settings.defaultRateBps));
    setEditingTicketId("");
    setSignatureData("");
    setSignatureConsent(false);
    setSignatureKey((key) => key + 1);
  }

  async function printReceipt(ticket: PawnTicket) {
    try {
      const signature = ticket.signatureCiphertext ? await decryptSignature(ticket.signatureCiphertext) : "";
      setPrintSignature(signature);
      setPrintTicketId(ticket.id);
      window.setTimeout(() => window.print(), 120);
    } catch (reason) {
      notify(`${tr("printError")} ${reason instanceof Error ? reason.message : ""}`);
    }
  }

  async function editTicket(ticket: PawnTicket) {
    const customer = ledger.customers.find((item) => item.id === ticket.customerId);
    if (!customer || ticket.status !== "active") return;
    let signature = "";
    try {
      if (ticket.signatureCiphertext) signature = await decryptSignature(ticket.signatureCiphertext);
    } catch (reason) {
      notify(`${tr("printError")} ${reason instanceof Error ? reason.message : ""}`);
      return;
    }
    const weightMilli = Math.round(ticket.grossWeight * 1000);
    setDraft({
      customerName: customer.name,
      customerAddress: customer.address,
      mobile: customer.mobile,
      jewelleryType: ticket.jewelleryType,
      purity: ticket.purity,
      kilograms: String(Math.floor(weightMilli / 1_000_000)),
      grams: String(Math.floor((weightMilli % 1_000_000) / 1000)),
      milligrams: String(weightMilli % 1000),
      loan: (ticket.loanPaise / 100).toFixed(2),
      rate: (ticket.annualRateBps / 100).toString(),
      pawnDate: ticket.pawnDate,
      maturityDate: ticket.maturityDate,
      approximateValue: (ticket.approximateValuePaise / 100).toFixed(2),
      monthlyIncome: (ticket.declaredMonthlyIncomePaise / 100).toFixed(2),
      notes: ticket.notes,
    });
    setSignatureData(signature);
    setSignatureConsent(Boolean(signature));
    setEditingTicketId(ticket.id);
    setSignatureKey((key) => key + 1);
    setActiveTab("new");
  }

  async function submitPawn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const printAfterSave = submitter instanceof HTMLButtonElement && submitter.dataset.print === "true";
    const customerName = draft.customerName.trim();
    const customerAddress = draft.customerAddress.trim();
    const grossWeight = weightToGrams(draft);
    const loanPaise = Math.round(Number(draft.loan) * 100);
    const rateBps = Math.round(Number(draft.rate) * 100);
    const valuePaise = Math.round(Number(draft.approximateValue) * 100);
    const incomePaise = Math.round(Number(draft.monthlyIncome) * 100);
    if (!customerName || !draft.mobile.trim() || !draft.jewelleryType.trim() ||
      !/^[6-9]\d{9}$/.test(draft.mobile.trim()) ||
      !Number.isFinite(grossWeight) || grossWeight <= 0 ||
      !Number.isSafeInteger(loanPaise) || loanPaise <= 0 ||
      !Number.isSafeInteger(rateBps) || rateBps < 0 ||
      !Number.isSafeInteger(valuePaise) || valuePaise < 0 ||
      !Number.isSafeInteger(incomePaise) || incomePaise < 0) {
      notify(!/^[6-9]\d{9}$/.test(draft.mobile.trim()) && draft.mobile.trim()
        ? tr("invalidMobile") : tr("required"));
      return;
    }
    try {
      netWeight(grossWeight, 0);
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : tr("saveFailed"));
      return;
    }
    if (!draft.pawnDate || !draft.maturityDate || draft.maturityDate <= draft.pawnDate) {
      notify(tr("futureDate"));
      return;
    }
    if (!signatureData || !signatureConsent) {
      notify(tr("signatureRequired"));
      return;
    }
    let signatureCiphertext: string;
    try {
      signatureCiphertext = await encryptSignature(signatureData);
    } catch (reason) {
      notify(`${tr("signatureUnavailable")} ${reason instanceof Error ? reason.message : ""}`);
      return;
    }

    const oldTicket = ledger.tickets.find((ticket) => ticket.id === editingTicketId);
    let customer = oldTicket
      ? ledger.customers.find((item) => item.id === oldTicket.customerId)
      : ledger.customers.find((item) => item.mobile === draft.mobile.trim() &&
        item.name.toLocaleLowerCase() === customerName.toLocaleLowerCase());
    const createdAt = new Date().toISOString();
    if (!customer) {
      customer = {
        id: createId(), customerNo: `CUS-${Date.now()}`, name: customerName,
        mobile: draft.mobile.trim(), address: customerAddress, idReference: "", createdAt,
      };
    } else {
      customer = { ...customer, name: customerName, mobile: draft.mobile.trim(), address: customerAddress };
    }
    const ticket: PawnTicket = {
      id: oldTicket?.id ?? createId(),
      receiptNo: oldTicket?.receiptNo ?? draftReceiptNo,
      customerId: customer.id,
      jewelleryType: draft.jewelleryType.trim(),
      purity: draft.purity,
      grossWeight,
      stoneWeight: 0,
      loanPaise,
      annualRateBps: rateBps,
      approximateValuePaise: valuePaise,
      declaredMonthlyIncomePaise: incomePaise,
      signatureCiphertext,
      pawnDate: draft.pawnDate,
      maturityDate: draft.maturityDate,
      notes: draft.notes.trim(),
      status: oldTicket?.status ?? "active",
      createdAt: oldTicket?.createdAt ?? createdAt,
    };
    try {
      if (oldTicket) await updatePawnRecord(customer, ticket);
      else await savePawnRecord(customer, ticket, ledger.customers.some((item) => item.id === customer.id));
      await refresh(false);
      void syncNow();
      setEditingTicketId("");
      setSignatureData("");
      setSignatureConsent(false);
      setSignatureKey((key) => key + 1);
      setDraft(blankDraft(ledger.settings.defaultRateBps));
      notify(tr("ticketSuccess"));
      if (printAfterSave) void printReceipt(ticket);
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : tr("saveFailed"));
    }
  }

  function openPayment(ticket: PawnTicket, mode: "payment" | "redeem" | "history") {
    setSelectedTicketId(ticket.id);
    setPaymentDialog(mode);
  }

  async function submitPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedTicket || !selectedBalance || !selectedCustomer) return;
    const form = new FormData(event.currentTarget);
    const amountPaise = Math.round(Number(form.get("amount")) * 100);
    const redeem = paymentDialog === "redeem" || amountPaise === selectedBalance.totalPaise;
    if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) {
      notify(tr("required"));
      return;
    }
    if (amountPaise > selectedBalance.totalPaise || (redeem && amountPaise !== selectedBalance.totalPaise)) {
      notify(tr("amountTooHigh"));
      return;
    }
    const interestPaise = Math.min(amountPaise, selectedBalance.interestPaise);
    const payment: Payment = {
      id: createId(),
      transactionNo: `TXN-${Date.now()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`,
      ticketId: selectedTicket.id,
      amountPaise,
      interestPaise,
      principalPaise: amountPaise - interestPaise,
      method: String(form.get("method")) as PaymentMethod,
      paidAt: new Date().toISOString(),
    };
    try {
      await savePayment(payment, redeem);
      await refresh(false);
      void syncNow();
      setPaymentDialog(null);
      notify(tr("paymentSuccess"));
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : tr("saveFailed"));
    }
  }

  async function removeTicket(ticket: PawnTicket) {
    if (ticket.status !== "active" || !window.confirm(tr("confirmDelete"))) return;
    try {
      await deleteTicket(ticket.id);
      await refresh(false);
      void syncNow();
      notify(tr("ticketDeleted"));
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : tr("saveFailed"));
    }
  }

  function exportBackup() {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob(
      [JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), ledger }, null, 2)],
      { type: "application/json" },
    ));
    link.download = `vasanthi-ledger-${today()}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    notify(tr("backupDownloaded"));
  }

  async function importBackup(file?: File) {
    if (!file) return;
    try {
      const contents: unknown = JSON.parse(await file.text());
      const wrapped = contents && typeof contents === "object" && "ledger" in contents
        ? (contents as { ledger: unknown }).ledger
        : contents;
      if (!validateBackup(wrapped)) throw new Error(tr("invalidBackup"));
      if (ledger.customers.length || ledger.tickets.length || ledger.payments.length) {
        throw new Error(tr("restoreEmptyOnly"));
      }
      await restoreLedger(wrapped);
      await refresh(false);
      void syncNow();
      notify(tr("restoreSuccess"));
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : tr("invalidBackup"));
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  const paymentHistory = selectedTicket
    ? ledger.payments.filter((payment) => payment.ticketId === selectedTicket.id)
    : [];

  if (!firebaseUser) {
    return (
      <AuthGate
        busy={authBusy}
        error={authError}
        onSignIn={handleSignIn}
        onPasswordReset={sendPasswordReset}
      />
    );
  }

  return (
    <div className={`admin-app ${language === "ta" ? "admin-tamil" : ""}`}>
      <header className="admin-header">
        <div className="admin-brand">
          <div className="admin-brand-mark"><Gem size={22} /></div>
          <div>
            <strong>{tr("shopName")}</strong>
            <span>{tr("shopAddress")}</span>
            <small>{tr("shopPhone")}</small>
          </div>
        </div>
        <div className="admin-header-actions">
          <span className="admin-local"><i /> Local device ledger</span>
          <button className="admin-button admin-button-light" type="button" onClick={() => void syncNow()}>Refresh</button>
          <button className="admin-button admin-button-light" type="button" onClick={() => void handleSignOut()}>Sign out</button>
          <label className="admin-language"><Languages size={17} /><select aria-label="Language" value={language} onChange={(event) => setLanguage(event.target.value as Language)}><option value="ta">தமிழ்</option><option value="en">English</option></select><ChevronDown size={14} /></label>
          <button className="admin-button admin-button-light" onClick={exportBackup}><Archive size={16} />{tr("backup")}</button>
          <button className="admin-button admin-button-light" onClick={() => fileInput.current?.click()}><RotateCcw size={16} />{tr("restore")}</button>
          <input ref={fileInput} className="visually-hidden" type="file" accept="application/json,.json" onChange={(event) => void importBackup(event.currentTarget.files?.[0])} />
        </div>
      </header>

      <main className="admin-main">
        {error && <div className="error-banner" role="alert">{error}</div>}
        {loading && <div className="loading-banner">{language === "ta" ? "பதிவேடு ஏற்றப்படுகிறது…" : "Loading ledger…"}</div>}
        <section className="admin-metrics">
          <AdminMetric icon={FileClock} label={tr("totalReceipts")} value={String(ledger.tickets.length)} meta={language === "ta" ? "அனைத்து அடகு ரசீதுகள்" : "All pawn receipts"} />
          <AdminMetric icon={CircleDollarSign} label={tr("activePrincipal")} value={formatMoney(activePrincipal, "INR", language)} meta={`${activeTickets.length} ${tr("statusActive")}`} />
          <AdminMetric icon={Check} label={tr("redeemedPrincipal")} value={formatMoney(redeemedPrincipal, "INR", language)} meta={`${redeemedTickets.length} ${tr("statusRedeemed")}`} />
        </section>

        <nav className="admin-tabs" aria-label="Pawn management">
          <button className={activeTab === "new" ? "selected" : ""} onClick={() => setActiveTab("new")}><Plus size={16} />{tr("newPawnTab")}</button>
          <button className={activeTab === "ledger" ? "selected" : ""} onClick={() => setActiveTab("ledger")}><Archive size={16} />{tr("ledgerTab")}<span>{ledger.tickets.length}</span></button>
        </nav>

        {activeTab === "new" && (
          <section className="pawn-workspace">
            <form className="pawn-form-card" onSubmit={(event) => void submitPawn(event)}>
              <div className="admin-section-heading">
                <div className="admin-section-icon"><Plus size={18} /></div>
                <div><h1>{editingTicketId ? tr("edit") : tr("newPawnTab")}</h1><p>{tr("license")} · {draftReceiptNo}</p></div>
              </div>
              <div className="pawn-form-grid">
                <AdminInput label={tr("name")} value={draft.customerName} onChange={(value) => updateDraft("customerName", value)} autoComplete="name" required />
                <AdminInput label={`${tr("address")} (${tr("optional")})`} value={draft.customerAddress} onChange={(value) => updateDraft("customerAddress", value)} />
                <AdminInput label={tr("mobile")} value={draft.mobile} onChange={(value) => updateDraft("mobile", value)} required maxLength={10} inputMode="numeric" />
                <AdminInput label={tr("date")} value={draft.pawnDate} onChange={(value) => updateDraft("pawnDate", value)} type="date" required />
                <label className="admin-field admin-field-full">
                  <span>{tr("itemDetails")} *</span>
                  <textarea rows={2} value={draft.jewelleryType} onChange={(event) => updateDraft("jewelleryType", event.target.value)} placeholder={tr("itemPlaceholder")} required />
                  <div className="quick-items">
                    {(["addChain", "addBangle", "addRing", "addEarring"] as const).map((key) => (
                      <button key={key} type="button" onClick={() => updateDraft("jewelleryType", [draft.jewelleryType.trim(), tr(key)].filter(Boolean).join(", "))}><Plus size={12} />{tr(key)}</button>
                    ))}
                  </div>
                </label>
                <label className="admin-field">
                  <span>{tr("purity")} *</span>
                  <select value={draft.purity} onChange={(event) => updateDraft("purity", event.target.value as PawnTicket["purity"])}>
                    {(["24K", "22K", "20K", "18K"] as const).map((purity) => <option key={purity}>{purity}</option>)}
                  </select>
                </label>
                <div className="admin-field">
                  <span>{tr("grossWeight")} *</span>
                  <div className="weight-inputs">
                    <AdminInput compact aria-label={tr("kilograms")} value={draft.kilograms} onChange={(value) => updateDraft("kilograms", value)} type="number" min="0" step="1" />
                    <AdminInput compact aria-label={tr("grams")} value={draft.grams} onChange={(value) => updateDraft("grams", value)} type="number" min="0" max="999" step="1" />
                    <AdminInput compact aria-label={tr("milligrams")} value={draft.milligrams} onChange={(value) => updateDraft("milligrams", value)} type="number" min="0" max="999" step="1" />
                  </div>
                  <div className="weight-units"><span>{tr("kilograms")}</span><span>{tr("grams")}</span><span>{tr("milligrams")}</span></div>
                </div>
                <AdminInput label={tr("principal")} value={draft.loan} onChange={(value) => updateDraft("loan", value)} type="number" min="0.01" step="0.01" required />
                <AdminInput label={tr("annualRate")} value={draft.rate} onChange={(value) => updateDraft("rate", value)} type="number" min="0" step="0.01" required />
                <AdminInput label={`${tr("approximateValue")} (${tr("optional")})`} value={draft.approximateValue} onChange={(value) => updateDraft("approximateValue", value)} type="number" min="0" step="0.01" />
                <AdminInput label={`${tr("monthlyIncome")} (${tr("optional")})`} value={draft.monthlyIncome} onChange={(value) => updateDraft("monthlyIncome", value)} type="number" min="0" step="0.01" />
                <AdminInput label={tr("dueDate")} value={draft.maturityDate} onChange={(value) => updateDraft("maturityDate", value)} type="date" required />
                <label className="admin-field admin-field-full"><span>{tr("notes")}</span><textarea rows={2} value={draft.notes} onChange={(event) => updateDraft("notes", event.target.value)} /></label>
                <SignaturePad key={signatureKey} label={tr("drawSignature")} clearLabel={tr("clearSignature")} onChange={setSignatureData} />
                <label className="admin-consent admin-field-full"><input type="checkbox" checked={signatureConsent} onChange={(event) => setSignatureConsent(event.target.checked)} />{tr("signatureConsent")}</label>
              </div>
              <p className="admin-form-note"><ShieldCheck size={15} />{editingTicketId ? tr("editNote") : tr("dataStored")}</p>
              <div className="admin-form-actions">
                {editingTicketId && <button className="admin-button admin-button-light" type="button" onClick={clearDraft}>{tr("cancel")}</button>}
                <button className="admin-button admin-button-light" type="button" onClick={clearDraft}>{tr("reset")}</button>
                <button className="admin-button admin-button-outline" type="submit" data-print="false">{editingTicketId ? tr("saveChanges") : tr("saveOnly")}</button>
                {!editingTicketId && <button className="admin-button admin-button-gold" type="submit" data-print="true"><Printer size={16} />{tr("savePrint")}</button>}
              </div>
            </form>

            <aside className="receipt-preview-card">
              <div className="receipt-preview-heading"><div><h2>{tr("receiptPreview")}</h2><p>{draftReceiptNo}</p></div><span className="preview-live"><i /> LIVE</span></div>
              <div className="receipt-preview-frame"><div className="receipt-preview-scale"><ReceiptPrint ticket={previewTicket} customer={previewCustomer} signature={signatureData} language={language} /></div></div>
              <p className="preview-caption">{tr("receiptNote")}</p>
            </aside>
          </section>
        )}

        {activeTab === "ledger" && (
          <section className="ledger-card">
            <div className="ledger-heading">
              <div><h1>{tr("ledgerTab")}</h1><p>{filteredTickets.length} / {ledger.tickets.length}</p></div>
              <button className="admin-button admin-button-gold" onClick={() => { clearDraft(); setActiveTab("new"); }}><Plus size={16} />{tr("newPawnTab")}</button>
            </div>
            <div className="ledger-filters">
              <label className="ledger-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tr("searchReceipts")} /></label>
              <label className="ledger-status"><span>{tr("status")}</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
                <option value="all">{tr("allStatus")}</option><option value="active">{tr("statusActive")}</option><option value="redeemed">{tr("statusRedeemed")}</option>
              </select></label>
            </div>
            {filteredTickets.length === 0 ? <div className="admin-empty"><Gem size={26} /><p>{tr("noLedger")}</p></div> : (
              <div className="ledger-table-scroll"><table className="ledger-table">
                <thead><tr><th>{tr("receipt")}</th><th>{tr("customer")}</th><th>{tr("mobile")}</th><th>{tr("date")}</th><th>{tr("jewellery")}</th><th>{tr("loanAmount")}</th><th>{tr("status")}</th><th>{tr("actions")}</th></tr></thead>
                <tbody>{filteredTickets.map((ticket) => {
                  const customer = ledger.customers.find((item) => item.id === ticket.customerId);
                  return <tr key={ticket.id}>
                    <td><strong className="receipt-code">{ticket.receiptNo}</strong></td>
                    <td><div className="ledger-customer"><span>{customer?.name.charAt(0).toUpperCase() ?? "?"}</span><strong>{customer?.name ?? "—"}</strong></div></td>
                    <td>{customer?.mobile ?? "—"}</td>
                    <td>{new Intl.DateTimeFormat(language === "ta" ? "ta-IN" : "en-IN", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${ticket.pawnDate}T00:00:00Z`))}</td>
                    <td className="ledger-item-cell">{ticket.jewelleryType}</td>
                    <td className="ledger-money">{formatMoney(ticket.loanPaise, "INR", language)}</td>
                    <td><span className={`ledger-status-pill ${ticket.status}`}>{ticket.status === "active" ? tr("statusActive") : tr("statusRedeemed")}</span></td>
                    <td><div className="ledger-row-actions">
                      <RowAction label={tr("print")} onClick={() => void printReceipt(ticket)}><Printer size={16} /></RowAction>
                      <RowAction label={tr("paymentsLabel")} onClick={() => openPayment(ticket, "history")}><FileClock size={16} /></RowAction>
                      {ticket.status === "active" && <>
                        <RowAction label={tr("edit")} onClick={() => void editTicket(ticket)}><Pencil size={16} /></RowAction>
                        <RowAction label={tr("recordPayment")} onClick={() => openPayment(ticket, "payment")}><WalletCards size={16} /></RowAction>
                        <RowAction label={tr("redeem")} onClick={() => openPayment(ticket, "redeem")}><RotateCcw size={16} /></RowAction>
                        <RowAction label={tr("delete")} danger onClick={() => void removeTicket(ticket)}><Trash2 size={16} /></RowAction>
                      </>}
                    </div></td>
                  </tr>;
                })}</tbody>
              </table></div>
            )}
          </section>
        )}

        <footer className="admin-footer"><span><ShieldCheck size={15} />Firebase login + local cache</span><span>{tr("shopName")}</span></footer>
      </main>

      {paymentDialog && selectedTicket && selectedCustomer && selectedBalance && (
        <div className="admin-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setPaymentDialog(null); }}>
          <div className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="payment-title">
            {paymentDialog === "history" ? <>
              <div className="admin-modal-heading"><div><h2 id="payment-title">{tr("paymentsLabel")} · {selectedTicket.receiptNo}</h2><p>{selectedCustomer.name} · {selectedCustomer.mobile}</p></div><button className="admin-modal-close" onClick={() => setPaymentDialog(null)}>×</button></div>
              {paymentHistory.length === 0 ? <div className="admin-empty compact"><WalletCards size={22} /><p>{tr("noRecords")}</p></div> : <div className="history-list">{paymentHistory.map((payment) => <div key={payment.id}><span>{payment.transactionNo}<small>{new Intl.DateTimeFormat(language === "ta" ? "ta-IN" : "en-IN", { dateStyle: "medium" }).format(new Date(payment.paidAt))} · {payment.method}</small></span><strong>{formatMoney(payment.amountPaise, "INR", language)}</strong></div>)}</div>}
              <div className="admin-modal-actions"><button className="admin-button admin-button-light" onClick={() => setPaymentDialog(null)}>{tr("close")}</button></div>
            </> : <form onSubmit={(event) => void submitPayment(event)}>
              <div className="admin-modal-heading"><div><h2 id="payment-title">{paymentDialog === "redeem" ? tr("confirmRedeem") : tr("recordPayment")}</h2><p>{selectedTicket.receiptNo} · {selectedCustomer.name}</p></div><button type="button" className="admin-modal-close" onClick={() => setPaymentDialog(null)}>×</button></div>
              <div className="settlement-summary">
                <div><span>{tr("interestDue")}</span><strong>{formatMoney(selectedBalance.interestPaise, "INR", language)}</strong></div>
                <div><span>{tr("principalDue")}</span><strong>{formatMoney(selectedBalance.principalPaise, "INR", language)}</strong></div>
                <div className="settlement-total"><span>{tr("balance")}</span><strong>{formatMoney(selectedBalance.totalPaise, "INR", language)}</strong></div>
              </div>
              {paymentDialog === "redeem" && <p className="redeem-warning">{tr("confirmRedeemMessage")}</p>}
              <div className="admin-payment-fields">
                <AdminInput label={tr("amount")} value={paymentDialog === "redeem" ? (selectedBalance.totalPaise / 100).toFixed(2) : undefined} name="amount" type="number" min="0.01" max={(selectedBalance.totalPaise / 100).toFixed(2)} step="0.01" defaultValue={paymentDialog === "redeem" ? undefined : (selectedBalance.totalPaise / 100).toFixed(2)} required readOnly={paymentDialog === "redeem"} />
                <label className="admin-field"><span>{tr("method")}</span><select name="method"><option value="Cash">{tr("cash")}</option><option value="UPI">UPI</option><option value="Other">{tr("other")}</option></select></label>
              </div>
              {paymentDialog === "payment" && <p className="payment-note">{tr("fullPaymentNote")}</p>}
              <div className="admin-modal-actions"><button type="button" className="admin-button admin-button-light" onClick={() => setPaymentDialog(null)}>{tr("cancel")}</button><button className="admin-button admin-button-gold" type="submit">{paymentDialog === "redeem" ? tr("confirmRedeem") : tr("savePayment")}</button></div>
            </form>}
          </div>
        </div>
      )}

      {printTicket && printCustomer && <div className="receipt-print-root"><ReceiptPrint ticket={printTicket} customer={printCustomer} signature={printSignature} language={language} /></div>}
      {notice && <div className="admin-toast" role="status"><Check size={17} />{notice}</div>}
    </div>
  );
}

function AdminMetric({ icon: Icon, label, value, meta }: { icon: typeof Users; label: string; value: string; meta: string }) {
  return <article className="admin-metric"><div className="admin-metric-top"><span><Icon size={18} /></span><small>{label}</small></div><strong>{value}</strong><p>{meta}</p></article>;
}

function AdminInput({
  label, value, onChange, compact = false, ...props
}: {
  label?: string;
  value?: string;
  onChange?: (value: string) => void;
  compact?: boolean;
  name?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "onChange">) {
  return <label className={`admin-field ${compact ? "admin-field-compact" : ""}`}>
    {label && <span>{label}{props.required ? " *" : ""}</span>}
    <input {...props} value={value} onChange={onChange ? (event) => onChange(event.target.value) : undefined} />
  </label>;
}

function RowAction({ label, onClick, danger = false, children }: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: ReactNode;
}) {
  return <button className={`ledger-action ${danger ? "danger" : ""}`} type="button" title={label} aria-label={label} onClick={onClick}>{children}</button>;
}

export default App;
