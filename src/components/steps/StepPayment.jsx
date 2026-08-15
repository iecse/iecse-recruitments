import { useState } from "react";
import { CheckboxField, TextInput } from "../ui/Form";
import {
  MEMBERSHIP_FEE,
  TIERS,
  UPI_ACCOUNTS,
  paysOnApplication,
} from "../../lib/constants";
import { Check, Copy, ShieldCheck } from "../ui/icons";
import { useCoarsePointer } from "../../lib/hooks";
import qr1 from "../../assets/qr1.jpg";
import qr2 from "../../assets/qr2.jpg";

const QR_IMAGES = { qr1, qr2 };

function UpiCard({ account, amount, reference, coarse }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(account.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard is blocked outside secure contexts. The id is selectable
      // on screen, so there is nothing to recover from.
    }
  };

  // The audience is on a phone, where a QR on their own screen is useless. The
  // intent URL hands the payment straight to whichever UPI app they have.
  const note = `IECSE ${reference || "membership"}`.trim();
  const intent =
    `upi://pay?pa=${encodeURIComponent(account.id)}` +
    `&pn=${encodeURIComponent("IECSE Manipal")}` +
    `&am=${amount}&cu=INR&tn=${encodeURIComponent(note)}`;

  return (
    <div className="flex flex-col gap-3 rounded-md border border-line bg-surface p-4">
      <div className="flex items-baseline justify-between">
        <p className="font-display text-[13px] font-semibold text-paper">
          {account.label}
        </p>
        <p className="font-mono text-[11px] tracking-[0.12em] text-faint">UPI</p>
      </div>

      {/* A QR on your own phone screen cannot be scanned by that phone, and an
          intent link does nothing on a laptop. Lead with whichever one the
          device can actually use. */}
      {coarse ? (
        <a
          href={intent}
          className="flex min-h-[48px] items-center justify-center rounded-sm bg-paper px-4 font-display text-[14px] font-semibold text-ink transition-colors duration-200 hover:bg-white"
        >
          Pay Rs {amount}
        </a>
      ) : (
        <img
          src={QR_IMAGES[account.qr]}
          alt={`UPI QR code for the IECSE ${account.label} account`}
          loading="lazy"
          decoding="async"
          width="240"
          height="240"
          className="aspect-square w-full rounded-sm bg-white object-contain p-2"
        />
      )}

      <details className="group">
        <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-2 text-[13px] text-faint transition-colors duration-200 hover:text-muted">
          <span
            aria-hidden="true"
            className="transition-transform duration-200 group-open:rotate-90"
          >
            &rsaquo;
          </span>
          {coarse ? "Or scan the QR code" : "On a phone? Open in a UPI app"}
        </summary>
        {coarse ? (
          <img
            src={QR_IMAGES[account.qr]}
            alt={`UPI QR code for the IECSE ${account.label} account`}
            loading="lazy"
            decoding="async"
            width="240"
            height="240"
            className="mt-3 aspect-square w-full rounded-sm bg-white object-contain p-2"
          />
        ) : (
          <a
            href={intent}
            className="mt-3 flex min-h-[44px] items-center justify-center rounded-sm border border-line-strong px-4 font-mono text-[12px] text-muted transition-colors duration-200 hover:text-paper"
          >
            Open UPI app
          </a>
        )}
      </details>

      <button
        type="button"
        onClick={copy}
        className="flex min-h-[44px] items-center justify-between gap-2 rounded-sm border border-line px-3 text-left transition-colors duration-200 hover:border-line-strong"
      >
        <span className="break-all py-2 font-mono text-[12px] leading-snug text-muted">
          {account.id}
        </span>
        <span className="flex shrink-0 items-center gap-1.5 font-display text-[11px] font-medium text-cyan">
          {copied ? (
            <>
              <Check size={13} strokeWidth={3} aria-hidden="true" />
              Copied
            </>
          ) : (
            <>
              <Copy size={13} strokeWidth={2} aria-hidden="true" />
              Copy
            </>
          )}
        </span>
      </button>
    </div>
  );
}

export default function StepPayment({ form, errors, update, onToggleConfirm }) {
  const tier = TIERS.find((entry) => entry.value === form.tier);
  const coarse = useCoarsePointer();

  // Working and Management Committee are interview tiers. They pay on
  // selection, not now, so this step has nothing to collect from them.
  if (!paysOnApplication(form.tier)) {
    return (
      <div className="flex flex-col gap-6">
        <div className="rounded-md border border-line-strong bg-surface-strong p-5">
          <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-faint">
            Nothing to pay yet
          </p>
          <p className="mt-3 text-[14px] leading-relaxed text-muted">
            {tier ? tier.name : "This tier"} is interview based. Submit now, and
            if you are selected you will be asked for the Rs {MEMBERSHIP_FEE}
            {" "}membership fee then. Applying costs nothing.
          </p>
        </div>

        <div className="flex items-start gap-3 rounded-md border border-line bg-surface p-4">
          <ShieldCheck
            size={17}
            strokeWidth={2}
            className="mt-[2px] shrink-0 text-cyan"
            aria-hidden="true"
          />
          <p className="text-[13px] leading-relaxed text-faint">
            You will be contacted via WhatsApp at {form.phoneNumber.trim() || "your phone number"}
            {" "}to schedule a short conversation about the domains you picked.
            Nothing else is needed from you until then.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-7">
      <div className="rounded-md border border-line-strong bg-surface-strong p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <p className="font-mono text-[11px] tracking-[0.12em] text-faint">
              Membership fee
            </p>
            <p className="font-mono text-[34px] font-medium leading-none tracking-tight text-paper">
              <span className="text-muted">Rs</span> {MEMBERSHIP_FEE}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1 text-right">
            <p className="font-mono text-[11px] tracking-[0.12em] text-faint">
              Applying as
            </p>
            <p className="font-display text-[15px] font-semibold text-paper">
              {tier ? tier.name : "Not selected"}
            </p>
          </div>
        </div>

        <p className="mt-4 border-t border-line pt-4 text-[13px] leading-relaxed text-muted">
          One payment, once. Pay to either account below, then put the
          transaction reference in the field underneath so we can match it to
          your application.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {UPI_ACCOUNTS.map((account) => (
          <UpiCard
            key={account.id}
            account={account}
            amount={MEMBERSHIP_FEE}
            reference={form.registrationNumber.trim()}
            coarse={coarse}
          />
        ))}
      </div>

      <TextInput
        name="paymentId"
        label="Transaction ID or UTR"
        hint="Your UPI app shows this after the payment completes. Usually 12 digits."
        value={form.paymentId}
        onChange={update("paymentId")}
        error={errors.paymentId}
        placeholder="Paste it exactly as your app shows it"
      />

      <CheckboxField
        name="paymentConfirmed"
        checked={form.paymentConfirmed}
        onChange={onToggleConfirm}
        error={errors.paymentConfirmed}
      >
        I have paid Rs {MEMBERSHIP_FEE} to one of the accounts above and the
        reference I entered is correct.
      </CheckboxField>

      <div className="flex items-start gap-3 rounded-md border border-line bg-surface p-4">
        <ShieldCheck
          size={17}
          strokeWidth={2}
          className="mt-[2px] shrink-0 text-cyan"
          aria-hidden="true"
        />
        <p className="text-[13px] leading-relaxed text-faint">
          Payments are checked by hand against the club account, usually within
          a few days.{" "}
          {tier && tier.value !== "member"
            ? "Because you picked an interview tier, you will also be contacted to schedule a slot."
            : "Nothing else is needed from you after this."}{" "}
          Your reference is stored with your application and is never shown to
          anyone outside the committee.
        </p>
      </div>
    </div>
  );
}
