import { describe, it, expect } from "vitest";
import {
  formatAmountForConfirm,
  parseAmount,
  parseChoice,
  parseMultiChoice,
  parsePercent,
  parseRegime,
} from "./voiceProfileParse";

// The real behavioural options from /profile/complete — parsing has to cope with
// long sentences, not toy strings.
const HORIZONS = ["< 2 years", "2–5 years", "5+ years"];
const FOCUS = [
  "Keep it safe — I'll accept low returns to protect my money",
  "Mostly steady — small dips are fine for modest growth",
  "Balanced — I'll ride moderate ups and downs for moderate growth",
  "Growth-first — I can handle big swings for higher long-term returns",
  "Maximise growth — I'm comfortable with large losses while chasing the highest returns",
];
const OBJECTIVES = [
  "Wealth growth",
  "Retirement",
  "Child's education",
  "Wedding",
  "Home purchase",
  "Estate planning",
];

describe("parseAmount", () => {
  it("reads Indian magnitude words", () => {
    expect(parseAmount("about twelve lakhs")).toBe(1_200_000);
    expect(parseAmount("12 lakh")).toBe(1_200_000);
    expect(parseAmount("1.2 crore")).toBe(12_000_000);
    expect(parseAmount("fifty thousand")).toBe(50_000);
  });

  it("reads plain and comma-grouped digits", () => {
    expect(parseAmount("4500000")).toBe(4_500_000);
    expect(parseAmount("45,00,000")).toBe(4_500_000);
  });

  it("strips currency words and symbols", () => {
    expect(parseAmount("rupees 8 lakhs")).toBe(800_000);
    expect(parseAmount("₹8,00,000")).toBe(800_000);
    expect(parseAmount("Rs. 25 lakh")).toBe(2_500_000);
  });

  it("handles compound word-numbers", () => {
    expect(parseAmount("twenty five lakhs")).toBe(2_500_000);
    expect(parseAmount("thirty thousand")).toBe(30_000);
  });

  it("keeps the largest reading rather than the last", () => {
    // "12 lakhs 50 thousand" must not collapse to 50,000.
    expect(parseAmount("12 lakhs 50 thousand")).toBe(1_200_000);
  });

  it("returns null when there is no number to read", () => {
    expect(parseAmount("I'm not really sure")).toBeNull();
    expect(parseAmount("")).toBeNull();
  });
});

describe("parsePercent", () => {
  it("reads digits and words", () => {
    expect(parsePercent("thirty percent")).toBe(30);
    expect(parsePercent("30%")).toBe(30);
    expect(parsePercent("about 22")).toBe(22);
  });

  it("ignores out-of-range numbers", () => {
    expect(parsePercent("120")).toBeNull();
  });

  it("returns null with no number", () => {
    expect(parsePercent("no idea")).toBeNull();
  });
});

describe("parseRegime", () => {
  it("picks a regime when only one is named", () => {
    expect(parseRegime("the old regime")).toBe("old");
    expect(parseRegime("new one please")).toBe("new");
  });

  it("refuses when both or neither are named", () => {
    // A keyword test cannot tell "not the old one, the new one" from a mention
    // of both — better to re-ask than coin-flip a tax setting.
    expect(parseRegime("not the old one, the new one")).toBeNull();
    expect(parseRegime("whichever is better")).toBeNull();
  });
});

describe("parseChoice", () => {
  it("takes positional phrasing first", () => {
    expect(parseChoice("the second one", FOCUS)).toBe(1);
    expect(parseChoice("option 3", FOCUS)).toBe(2);
    expect(parseChoice("number two", FOCUS)).toBe(1);
    expect(parseChoice("first", FOCUS)).toBe(0);
  });

  it("ignores a position past the end of the list", () => {
    expect(parseChoice("option 9", HORIZONS)).toBeNull();
  });

  it("matches on content words", () => {
    expect(parseChoice("I want to keep it safe and protect my money", FOCUS)).toBe(0);
    expect(parseChoice("balanced, ride moderate ups and downs", FOCUS)).toBe(2);
  });

  it("returns null when nothing matches", () => {
    expect(parseChoice("hmm let me think", FOCUS)).toBeNull();
  });

  it("returns null on a tie rather than guessing", () => {
    const tied = ["Gold and silver", "Silver and gold"];
    expect(parseChoice("gold silver", tied)).toBeNull();
  });

  it("does not favour a long option just for having more words", () => {
    // The short option is the right answer; the long one shares one word.
    const opts = ["Retirement", "Saving toward a wedding for my retirement-age parents"];
    expect(parseChoice("retirement", opts)).toBe(0);
  });
});

describe("parseMultiChoice", () => {
  it("returns every objective mentioned", () => {
    expect(parseMultiChoice("retirement and my child's education", OBJECTIVES)).toEqual([1, 2]);
  });

  it("returns one when only one is mentioned", () => {
    expect(parseMultiChoice("mainly wealth growth", OBJECTIVES)).toEqual([0]);
  });

  it("returns empty when nothing matches", () => {
    expect(parseMultiChoice("not sure yet", OBJECTIVES)).toEqual([]);
  });
});

describe("formatAmountForConfirm", () => {
  it("reads amounts back in the units they were spoken in", () => {
    expect(formatAmountForConfirm(1_200_000)).toBe("₹12 lakh");
    expect(formatAmountForConfirm(12_000_000)).toBe("₹1.20 crore");
    expect(formatAmountForConfirm(50_000)).toBe("₹50k");
    expect(formatAmountForConfirm(800)).toBe("₹800");
  });
});
