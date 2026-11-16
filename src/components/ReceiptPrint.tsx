import type { Customer, Language, PawnTicket } from "../types";
import { formatMoney } from "../utils/finance";
import { translate as t } from "../translations";

interface ReceiptPrintProps {
  ticket: PawnTicket;
  customer: Customer;
  signature: string;
  language: Language;
}

function weightParts(grams: number) {
  const totalMilligrams = Math.round(grams * 1000);
  return {
    kilograms: Math.floor(totalMilligrams / 1_000_000),
    grams: Math.floor((totalMilligrams % 1_000_000) / 1000),
    milligrams: totalMilligrams % 1000,
  };
}

export default function ReceiptPrint({ ticket, customer, signature, language }: ReceiptPrintProps) {
  const tr = (key: Parameters<typeof t>[1]) => t(language, key);
  const weight = weightParts(ticket.grossWeight);
  const date = (value: string) => new Intl.DateTimeFormat(
    language === "ta" ? "ta-IN" : "en-IN",
    { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" },
  ).format(new Date(`${value}T00:00:00Z`));
  const rate = (ticket.annualRateBps / 100).toLocaleString(language === "ta" ? "ta-IN" : "en-IN", {
    minimumFractionDigits: 0, maximumFractionDigits: 2,
  });

  return (
    <article className={`receipt-paper ${language === "ta" ? "receipt-tamil" : "receipt-english"}`}>
      <div className="receipt-margin-box"><span>{tr("receiptNote")}</span></div>
      <header className="receipt-header">
        <div className="receipt-license">{tr("license")}</div>
        <div className="receipt-top-amount">{tr("originalAmount")} <strong>{formatMoney(ticket.loanPaise, "INR", language)}</strong></div>
        <div className="receipt-title-row"><span className="receipt-label">{tr("receiptHeading")}</span><h1>{tr("shopName")}</h1></div>
        <p className="receipt-address">{tr("shopAddress")}</p>
        <p className="receipt-phone">{tr("shopPhone")}</p>
        <p className="receipt-date">{tr("pledgeDate")} <strong>{date(ticket.pawnDate)}</strong></p>
      </header>

      <p className="receipt-statement">{tr("receiptStatement")}</p>

      <section className="receipt-body">
        <div className="receipt-entry receipt-name-entry">
          <div className="receipt-field-label">{tr("pledgerNameAddress")}</div>
          <div className="receipt-writing-lines"><span>{customer.name}</span><span>{customer.address}</span><span /></div>
        </div>
        <div className="receipt-entry receipt-principal-entry">
          <div className="receipt-field-label">{tr("interestPrincipal")} <strong>{rate}% P.A.</strong> {tr("principalRs")}</div>
          <div className="receipt-writing-lines"><span>{formatMoney(ticket.loanPaise, "INR", language)}</span></div>
        </div>
        <div className="receipt-entry receipt-item-entry">
          <div className="receipt-field-label">{tr("pledgedItem")}</div>
          <div className="receipt-writing-lines"><span>{ticket.jewelleryType}</span><span /><span /></div>
        </div>
        <div className="receipt-weight-line">
          <span>{tr("weightIncludingWaste")}</span>
          <strong>{tr("kilo")} <i>{weight.kilograms}</i></strong>
          <strong>{tr("gram")} <i>{weight.grams}</i></strong>
          <strong>{tr("milligram")} <i>{weight.milligrams}</i></strong>
        </div>
        <div className="receipt-entry receipt-value-entry">
          <div className="receipt-field-label">{tr("approximatePledgeValue")}</div>
          <div className="receipt-writing-lines"><span>{formatMoney(ticket.approximateValuePaise, "INR", language)}</span></div>
        </div>
        <div className="receipt-entry receipt-redemption-entry">
          <div className="receipt-field-label">{tr("agreedRedemptionDate")}</div>
          <div className="receipt-writing-lines"><span>{date(ticket.maturityDate)}</span></div>
        </div>
        <p className="receipt-declaration">
          {tr("declaration")} <span className="receipt-inline-value">{formatMoney(ticket.declaredMonthlyIncomePaise, "INR", language)}</span>
          <span className="receipt-contact-label">{tr("phoneNumber")}</span> <span className="receipt-inline-value">{customer.mobile}</span>
        </p>
      </section>

      <footer className="receipt-signatures">
        <div className="receipt-signature-block">
          {signature && <img className="receipt-customer-signature" src={signature} alt="" />}
          <div className="receipt-signature-line" />
          <span>{tr("pledgerSign")}</span>
        </div>
        <div className="receipt-signature-block">
          <div className="receipt-signature-line" />
          <span>{tr("pledgeeSign")}</span>
        </div>
      </footer>
    </article>
  );
}
