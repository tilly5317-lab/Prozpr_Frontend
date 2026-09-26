import { describe, it, expect } from "vitest";

import { plainName } from "./utils";

describe("plainName", () => {
  it("strips a trailing '- Growth Plan'", () => {
    expect(plainName("HDFC Balanced Advantage Fund - Growth Plan")).toBe(
      "HDFC Balanced Advantage Fund",
    );
  });

  it("strips a plain trailing 'Growth'", () => {
    expect(plainName("HDFC Top 100 Growth")).toBe("HDFC Top 100");
  });

  it("strips a '- Direct Plan - Growth' suffix", () => {
    expect(plainName("ICICI Ultra Short - Direct Plan - Growth")).toBe("ICICI Ultra Short");
  });

  it("drops a folio suffix", () => {
    expect(plainName("Parag Parikh Flexi Cap · Folio 12345")).toBe("Parag Parikh Flexi Cap");
  });

  it("leaves a clean name untouched", () => {
    expect(plainName("Parag Parikh Flexi Cap Fund")).toBe("Parag Parikh Flexi Cap Fund");
  });

  it("keeps 'Growth' when it is mid-name, not a trailing plan suffix", () => {
    expect(plainName("Mirae Asset Growth Fund")).toBe("Mirae Asset Growth Fund");
  });
});
