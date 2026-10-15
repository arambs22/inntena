import { describe, expect, it } from "vitest";
import { TRANSLATIONS, type Language } from "./i18n";
import { buildPrivacy, buildTerms, resolveLegalContext } from "./legalContent";

const languages: Language[] = ["en", "es"];
const ctx = { operator: "Jane Doe", contact: "help@example.com" };
const allText = (doc: { sections: { heading: string; paragraphs: string[] }[] }) =>
  doc.sections.flatMap((s) => [s.heading, ...s.paragraphs]).join("\n");

describe.each(languages)("legal documents (%s)", (language) => {
  it("have no empty headings or paragraphs", () => {
    for (const doc of [buildTerms(language, ctx), buildPrivacy(language, ctx)]) {
      expect(doc.sections.length).toBeGreaterThan(0);
      for (const section of doc.sections) {
        expect(section.heading.trim()).not.toBe("");
        expect(section.paragraphs.length).toBeGreaterThan(0);
        for (const paragraph of section.paragraphs) expect(paragraph.trim()).not.toBe("");
      }
    }
  });

  it("leave no template placeholder behind", () => {
    expect(allText(buildTerms(language, ctx))).not.toMatch(/[{}]|undefined|null/);
    expect(allText(buildPrivacy(language, ctx))).not.toMatch(/[{}]|undefined|null/);
  });

  it("name the operator and the contact address", () => {
    expect(allText(buildTerms(language, ctx))).toContain("Jane Doe");
    expect(allText(buildTerms(language, ctx))).toContain("help@example.com");
    expect(allText(buildPrivacy(language, ctx))).toContain("Jane Doe");
    expect(allText(buildPrivacy(language, ctx))).toContain("help@example.com");
  });

  it("carry Etsy's required disclaimer in the Terms, with the operator as the App Developer", () => {
    const terms = allText(buildTerms(language, ctx));
    expect(terms).toContain("ETSY, INC.");
    expect(terms).toContain("Jane Doe");
  });

  it("carry exactly the Etsy trademark notice shown in the footer", () => {
    expect(allText(buildTerms(language, ctx))).toContain(TRANSLATIONS[language].footer.etsyNotice);
  });

  it("name every service that processes personal data, so the policy cannot drift from the deployment", () => {
    const privacy = allText(buildPrivacy(language, ctx));
    for (const processor of ["Render", "Neon", "SendGrid", "Google Fonts", "i.etsystatic.com"]) expect(privacy).toContain(processor);
  });
});

describe("the two languages describe the same structure", () => {
  it("have the same number of sections in each document", () => {
    expect(buildTerms("es", ctx).sections).toHaveLength(buildTerms("en", ctx).sections.length);
    expect(buildPrivacy("es", ctx).sections).toHaveLength(buildPrivacy("en", ctx).sections.length);
  });
});

describe("resolveLegalContext", () => {
  it("uses the configured operator and support email", () => {
    expect(resolveLegalContext("en", { operatorName: "Jane Doe", supportEmail: "h@example.com", termsVersion: "x" })).toEqual({
      operator: "Jane Doe",
      contact: "h@example.com",
    });
  });

  it("falls back to neutral wording, never to a blank or 'null', when nothing is configured", () => {
    for (const language of languages) {
      const fallback = resolveLegalContext(language, { operatorName: null, supportEmail: null, termsVersion: "x" });
      expect(fallback.operator.length).toBeGreaterThan(5);
      expect(fallback.contact.length).toBeGreaterThan(5);
      expect(resolveLegalContext(language, null)).toEqual(fallback);
    }
  });
});
