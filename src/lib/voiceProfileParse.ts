/**
 * Turning spoken answers into profile field values.
 *
 * Speech recognition gives back prose, not data — "about twelve lakhs", "the
 * second one", "I'd buy the dip". These helpers do the narrow, deterministic
 * part of that conversion and return `null` the moment they are unsure, because
 * the caller shows every parsed value back to the user for confirmation before
 * anything is saved. A wrong guess that the user can see and correct is fine; a
 * confident wrong guess written silently into someone's financial profile is not.
 */

/** Indian-English magnitude words, largest first so "crore" wins over "core". */
const MULTIPLIERS: { words: string[]; factor: number }[] = [
  { words: ["crore", "crores", "cr"], factor: 1e7 },
  { words: ["lakh", "lakhs", "lac", "lacs", "lakhes"], factor: 1e5 },
  { words: ["million", "millions"], factor: 1e6 },
  { words: ["thousand", "thousands", "k"], factor: 1e3 },
];

const UNITS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19,
};

const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60,
  seventy: 70, eighty: 80, ninety: 90,
};

const ORDINALS: Record<string, number> = {
  first: 0, second: 1, third: 2, fourth: 3, fifth: 4,
  "1st": 0, "2nd": 1, "3rd": 2, "4th": 3, "5th": 4,
};

/** Words that carry no signal when matching an answer against option text. */
const STOPWORDS = new Set([
  "a", "the", "and", "or", "of", "to", "in", "on", "for", "with", "my",
  "me", "i", "im", "id", "ill", "is", "am", "are", "be", "would", "will",
  "can", "could", "it", "its", "as", "at", "but", "if", "so", "that", "this",
  "you", "your", "we", "our", "all", "any", "some", "more", "most", "than",
  "then", "them", "they", "there", "have", "has", "had", "do", "does", "did",
  "not", "no", "yes", "very", "just", "about", "like", "want", "think", "one",
]);

function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[,₹]/g, "")
    .replace(/\brs\.?\b|\binr\b|\brupees?\b/g, " ")
    .replace(/[^a-z0-9.\s%-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Leading word-number in a token list, e.g. ["twenty","five",…] → 25. */
function wordNumberAt(tokens: string[], i: number): { value: number; next: number } | null {
  const t = tokens[i];
  if (t === undefined) return null;

  if (TENS[t] !== undefined) {
    const unit = tokens[i + 1];
    if (unit !== undefined && UNITS[unit] !== undefined && UNITS[unit] < 10) {
      return { value: TENS[t] + UNITS[unit], next: i + 2 };
    }
    return { value: TENS[t], next: i + 1 };
  }

  if (UNITS[t] !== undefined) {
    // "one hundred", "five hundred"
    if (tokens[i + 1] === "hundred") {
      return { value: UNITS[t] * 100, next: i + 2 };
    }
    return { value: UNITS[t], next: i + 1 };
  }

  if (t === "hundred") return { value: 100, next: i + 1 };
  return null;
}

function multiplierAt(tokens: string[], i: number): { factor: number; next: number } | null {
  const t = tokens[i];
  if (t === undefined) return null;
  for (const m of MULTIPLIERS) {
    if (m.words.includes(t)) return { factor: m.factor, next: i + 1 };
  }
  return null;
}

/**
 * A rupee amount from a spoken answer — "12 lakhs", "twelve lakh", "1.2 crore",
 * "about 45,00,000". Returns null when no number is present at all.
 */
export function parseAmount(text: string): number | null {
  const tokens = normalise(text).split(" ").filter(Boolean);
  let best: number | null = null;

  for (let i = 0; i < tokens.length; i++) {
    let value: number | null = null;
    let next = i;

    const digits = /^(\d+(?:\.\d+)?)$/.exec(tokens[i]);
    if (digits) {
      value = Number(digits[1]);
      next = i + 1;
    } else {
      const word = wordNumberAt(tokens, i);
      if (word) {
        value = word.value;
        next = word.next;
      }
    }
    if (value === null || !Number.isFinite(value)) continue;

    // A magnitude word may sit directly after, or after a filler ("12 or so lakhs"
    // is not handled — one filler token is the useful limit before it's a guess).
    const mult = multiplierAt(tokens, next) ?? multiplierAt(tokens, next + 1);
    if (mult) value *= mult.factor;

    // Keep the largest reading: "12 lakhs 50 thousand" should not resolve to 50k.
    if (best === null || value > best) best = value;
    i = next - 1;
  }

  return best !== null && best > 0 ? Math.round(best) : null;
}

/** A percentage — "thirty percent", "30%", "twenty-two". Clamped to 0-100. */
export function parsePercent(text: string): number | null {
  const tokens = normalise(text).split(" ").filter(Boolean);
  for (let i = 0; i < tokens.length; i++) {
    const digits = /^(\d+(?:\.\d+)?)%?$/.exec(tokens[i]);
    if (digits) {
      const v = Number(digits[1]);
      if (v >= 0 && v <= 100) return v;
      continue;
    }
    const word = wordNumberAt(tokens, i);
    if (word && word.value >= 0 && word.value <= 100) return word.value;
  }
  return null;
}

/** "old regime" / "new" → the tax_regime column's value. */
export function parseRegime(text: string): "old" | "new" | null {
  const t = normalise(text);
  const old = /\bold\b/.test(t);
  const nu = /\bnew\b/.test(t);
  // Both mentioned ("not the old one, the new one") is ambiguous to a keyword
  // test — let the user pick rather than coin-flip it.
  if (old === nu) return null;
  return old ? "old" : "new";
}

function contentWords(text: string): string[] {
  return normalise(text)
    .split(" ")
    .map((w) => w.replace(/[^a-z0-9]/g, ""))
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

/**
 * Pick one option from a spoken answer.
 *
 * Positional phrasing wins first ("the second one") because it is unambiguous.
 * Otherwise options are scored on shared content words, and a winner is only
 * returned when it is strictly ahead — a tie means the user gets asked again
 * rather than having a coin-flip written to their profile.
 */
export function parseChoice(text: string, options: string[]): number | null {
  const t = normalise(text);
  if (!t || options.length === 0) return null;

  const tokens = t.split(" ");
  for (const tok of tokens) {
    if (ORDINALS[tok] !== undefined && ORDINALS[tok] < options.length) {
      return ORDINALS[tok];
    }
  }
  // "option 3", "number two", "answer 4"
  const positional = /\b(?:option|number|answer|choice)\s+(\d+|one|two|three|four|five)\b/.exec(t);
  if (positional) {
    const raw = positional[1];
    const n = /^\d+$/.test(raw) ? Number(raw) : UNITS[raw];
    if (n >= 1 && n <= options.length) return n - 1;
  }

  const answerWords = new Set(contentWords(text));
  if (answerWords.size === 0) return null;

  const scores = options.map((opt) => {
    const words = contentWords(opt);
    if (words.length === 0) return 0;
    const hits = words.filter((w) => answerWords.has(w)).length;
    // Normalise so a long option isn't favoured purely for having more words.
    return hits === 0 ? 0 : hits / Math.sqrt(words.length);
  });

  const top = Math.max(...scores);
  if (top <= 0) return null;
  const winners = scores.filter((s) => s === top).length;
  return winners === 1 ? scores.indexOf(top) : null;
}

/**
 * Every option the answer mentions — for multi-select questions like objectives.
 * Each option is judged on its own, so "retirement and my child's education"
 * returns both.
 */
export function parseMultiChoice(text: string, options: string[]): number[] {
  const answerWords = new Set(contentWords(text));
  if (answerWords.size === 0) return [];
  const picked: number[] = [];
  options.forEach((opt, i) => {
    const words = contentWords(opt);
    if (words.length > 0 && words.some((w) => answerWords.has(w))) picked.push(i);
  });
  return picked;
}

/** Compact ₹ for reading a parsed amount back to the user. */
export function formatAmountForConfirm(n: number): string {
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(n % 1e7 === 0 ? 0 : 2)} crore`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(n % 1e5 === 0 ? 0 : 2)} lakh`;
  if (n >= 1e3) return `₹${(n / 1e3).toFixed(n % 1e3 === 0 ? 0 : 1)}k`;
  return `₹${n.toLocaleString("en-IN")}`;
}
