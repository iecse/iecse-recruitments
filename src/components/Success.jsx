import { useEffect, useRef } from "react";
import {
  MEMBERSHIP_FEE,
  TIERS,
  WHATSAPP_GROUP_LINK,
  paysOnApplication,
} from "../lib/constants";
import { CheckCircle, ExternalLink } from "./ui/icons";
import { Seal } from "./Seal";

export default function Success({ form }) {
  const headingRef = useRef(null);

  // The submit button unmounts with the form, so without this focus falls to
  // body and a screen reader announces nothing at the one moment that matters.
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  const tier = TIERS.find((entry) => entry.value === form.tier);
  const paid = paysOnApplication(form.tier);
  const needsInterview = !paid;
  const registration = form.registrationNumber.trim();

  const timeline = [
    paid
      ? {
          title: "We match your payment",
          body: `Someone checks reference ${form.paymentId.trim()} against the club account. This usually takes a few days.`,
        }
      : {
          title: "We read your application",
          body: "The committee goes through every application for the domains you picked. Nothing is owed while that happens.",
        },
    needsInterview
      ? {
          title: "You get an interview slot",
          body: `${tier ? tier.name : "This tier"} needs a short conversation about your domains. We will contact you via WhatsApp at ${form.phoneNumber.trim()}. The Rs ${MEMBERSHIP_FEE} fee is only asked for if you are selected.`,
        }
      : {
          title: "You are on the list",
          body: `Member applications need no interview. Watch your WhatsApp at ${form.phoneNumber.trim()} for the welcome message.`,
        },
    {
      title: "Sessions start",
      body: "Workshops, project teams and everything else open up once the cohort is confirmed.",
    },
  ];

  return (
    <div
      role="status"
      aria-live="polite"
      ref={headingRef}
      tabIndex={-1}
      className="rise-in flex flex-col gap-8 rounded-lg border border-line bg-panel p-7 outline-none sm:p-9"
    >
      {/* The tick is the message; the seal is the souvenir. Previously the
          decoration was 84px and the confirmation was a 22px outline icon
          tucked beside it. */}
      <div className="flex items-start justify-between gap-5">
        <div className="flex flex-col gap-4">
          <CheckCircle
            size={34}
            strokeWidth={1.8}
            className="text-cyan"
            aria-hidden="true"
          />
          <div className="flex flex-col gap-2">
            <h2 className="font-display text-[26px] font-semibold leading-tight text-paper sm:text-[30px]">
              That is in,{" "}
              <span className="text-cyan">
                {form.fullName.trim().split(" ")[0]}
              </span>
            </h2>
            <p className="max-w-prose text-[14px] leading-relaxed text-muted">
              Your application is saved. The mark is generated from your
              registration number, so it is yours and nobody else gets it.
            </p>
          </div>
        </div>

        <Seal
          registration={form.registrationNumber.trim()}
          size={56}
          className="mt-1 shrink-0"
        />
      </div>

      {/* The one thing an applicant needs to keep. */}
      <div className="flex flex-col gap-1 rounded-md border border-cyan/40 bg-cyan/[0.05] p-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-cyan">
          Screenshot this
        </p>
        <p className="font-mono text-[15px] text-paper">
          {paid ? form.paymentId.trim() : registration}
        </p>
        <p className="text-[12px] leading-relaxed text-faint">
          {paid
            ? `Your payment reference, against registration ${registration}. Quote it if you need to chase this up.`
            : "Your registration number. Quote it if you need to chase this up."}
        </p>
      </div>

      <ol className="flex flex-col gap-5 border-t border-line pt-7">
        {timeline.map((item, index) => (
          <li key={item.title} className="flex gap-4">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line bg-ink font-mono text-[12px] text-cyan">
              {index + 1}
            </span>
            <span className="flex flex-col gap-1 pt-0.5">
              <span className="font-display text-[14px] font-semibold text-paper">
                {item.title}
              </span>
              <span className="text-[13px] leading-relaxed text-muted">
                {item.body}
              </span>
            </span>
          </li>
        ))}
      </ol>

      <div className="flex flex-col gap-3 border-t border-line pt-7">
        <p className="text-[13px] leading-relaxed text-muted">
          Join the members group so you do not miss the first announcement.
        </p>
        <a
          href={WHATSAPP_GROUP_LINK}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-md bg-paper px-6 font-display text-[14px] font-semibold tracking-wide text-ink transition-colors duration-200 hover:bg-white"
        >
          Open the members group
          <ExternalLink size={15} strokeWidth={2.2} aria-hidden="true" />
        </a>
        <p className="text-[12px] leading-relaxed text-faint">
          {paid
            ? `Membership is Rs ${MEMBERSHIP_FEE} and covers everything the club runs.`
            : `If you are selected, membership is Rs ${MEMBERSHIP_FEE} and covers everything the club runs.`}
        </p>
      </div>
    </div>
  );
}
