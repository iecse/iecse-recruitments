import { TextArea, TextInput } from "../ui/Form";

export default function StepEvidence({ form, errors, update }) {
  return (
    <div className="flex flex-col gap-6">
      <p className="text-[13px] leading-relaxed text-faint">
        All optional. Leave it empty rather than padding it.
      </p>

      <TextArea
        name="projects"
        label="Things you have built"
        optional
        rows={5}
        value={form.projects}
        onChange={update("projects")}
        error={errors.projects}
        placeholder="A class assignment you took further, a script that saved you an hour, a half finished game."
      />

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <TextInput
          name="githubUrl"
          label="GitHub"
          optional
          inputMode="url"
          value={form.githubUrl}
          onChange={update("githubUrl")}
          error={errors.githubUrl}
          placeholder="github.com/yourname"
        />

        <TextInput
          name="linkedinUrl"
          label="LinkedIn"
          optional
          inputMode="url"
          value={form.linkedinUrl}
          onChange={update("linkedinUrl")}
          error={errors.linkedinUrl}
          placeholder="linkedin.com/in/yourname"
        />

        <TextInput
          name="portfolioUrl"
          label="Portfolio"
          optional
          inputMode="url"
          value={form.portfolioUrl}
          onChange={update("portfolioUrl")}
          error={errors.portfolioUrl}
          placeholder="yourname.dev"
        />

        <TextInput
          name="otherLinks"
          label="Anything else"
          optional
          inputMode="url"
          value={form.otherLinks}
          onChange={update("otherLinks")}
          error={errors.otherLinks}
          placeholder="Behance, Devfolio, a blog"
        />
      </div>

      <TextArea
        name="certifications"
        label="Certifications or coursework"
        optional
        rows={3}
        value={form.certifications}
        onChange={update("certifications")}
        error={errors.certifications}
        placeholder="Only if it is relevant to the domains you picked."
      />
    </div>
  );
}
