import { Select, TextInput } from "../ui/Form";
import { BRANCHES, YEARS } from "../../lib/constants";

export default function StepIdentity({ form, errors, update, onRegistrationBlur, duplicate }) {
  return (
    <div className="flex flex-col gap-6">
      <TextInput
        name="fullName"
        label="Full name"
        autoComplete="name"
        value={form.fullName}
        onChange={update("fullName")}
        error={errors.fullName}
        placeholder="As it appears on your college record"
      />

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <Select
          name="year"
          label="Year"
          value={form.year}
          onChange={update("year")}
          error={errors.year}
        >
          <option value="">Select your year</option>
          {YEARS.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </Select>

        <TextInput
          name="registrationNumber"
          label="Registration number"
          inputMode="numeric"
          value={form.registrationNumber}
          onChange={update("registrationNumber")}
          onBlur={onRegistrationBlur}
          error={errors.registrationNumber}
          placeholder="240900000000"
        />
      </div>

      {duplicate && (
        <p
          role="status"
          className="rounded-md border border-alert/40 bg-alert/[0.07] px-4 py-3 text-[13px] leading-relaxed text-paper"
        >
          An application already exists for this registration number. If that was
          not you, mail hello@iecse-manipal.com with your registration number
          and we will clear it so you can apply.
        </p>
      )}

      {/* A list, not free text. The committee sorts applicants by branch by
          hand, and "CSE", "cse" and "Computer Science & Engg" are three values
          to a spreadsheet and one thing to a person. */}
      <Select
        name="branch"
        label="Branch"
        value={form.branch}
        onChange={update("branch")}
        error={errors.branch}
      >
        <option value="">Select your branch</option>
        {BRANCHES.map((branch) => (
          <option key={branch} value={branch}>
            {branch}
          </option>
        ))}
      </Select>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <TextInput
          name="learnerEmail"
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={form.learnerEmail}
          onChange={update("learnerEmail")}
          error={errors.learnerEmail}
          placeholder="you@learner.manipal.edu"
        />

        <TextInput
          name="phoneNumber"
          label="Phone"
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          maxLength={10}
          value={form.phoneNumber}
          onChange={update("phoneNumber")}
          error={errors.phoneNumber}
          placeholder="10 digits"
        />
      </div>
    </div>
  );
}
