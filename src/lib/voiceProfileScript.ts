/**
 * The voice-onboarding question script.
 *
 * Four parts, matching the four sections of Complete profile. The questions in
 * each part are exactly the ones `getAboutYouStatus` checks when it decides a
 * section is confirmed — so finishing a part by voice genuinely ticks that
 * section off, rather than collecting answers that leave it still incomplete.
 *
 * Part order follows the app's own SECTION_DISPLAY_ORDER (financial → preferences
 * → tax → goals), not the internal section indexes.
 */

export type QuestionKind = "amount" | "percent" | "choice" | "multi" | "regime";

export interface VoiceQuestion {
  id: string;
  /** Read aloud and shown on screen. Keep it speakable — this is TTS copy. */
  prompt: string;
  /** Shown under the prompt as a spoken-answer hint. */
  hint: string;
  kind: QuestionKind;
  /** Options for choice / multi questions, in the order Complete profile lists them. */
  options?: string[];
  /** Short labels for the option chips when the real option text is a paragraph. */
  optionLabels?: string[];
}

export interface VoicePart {
  /** Complete-profile section index this part completes (matches SECTION_TITLES). */
  sectionIndex: number;
  title: string;
  blurb: string;
  questions: VoiceQuestion[];
}

// Mirrors /profile/complete. Kept here rather than imported so the voice flow
// does not drag the whole 3,000-line page into the chat bundle — if the options
// there change, change them here too.
const HORIZON_OPTIONS = ["< 2 years", "2–5 years", "5+ years"];

const EXPERIENCE_OPTIONS = [
  "I am a novice. I am new to investing and financial markets.",
  "I have a basic understanding of investing. I understand basic investment concepts like diversification and risks.",
  "I am enthusiastic about investing. I understand how markets fluctuate and the pros and cons of different investment classes.",
  "I am an experienced investor. I have invested in different markets and understand different investment strategies. I have developed my own investment philosophy.",
];
const EXPERIENCE_LABELS = ["Novice", "Basic", "Enthusiastic", "Experienced"];

const FOCUS_OPTIONS = [
  "Keep it safe — I'll accept low returns to protect my money",
  "Mostly steady — small dips are fine for modest growth",
  "Balanced — I'll ride moderate ups and downs for moderate growth",
  "Growth-first — I can handle big swings for higher long-term returns",
  "Maximise growth — I'm comfortable with large losses while chasing the highest returns",
];
const FOCUS_LABELS = ["Keep it safe", "Mostly steady", "Balanced", "Growth-first", "Maximise growth"];

const DROP_OPTIONS = [
  "Capital preservation is paramount. Cut losses immediately and liquidate all investments.",
  "Transfer investments to safer asset classes to prevent further loss.",
  "Would feel worried but would wait to give your investments a little more time.",
  "Accept volatility and dips in portfolio value as part of investing. Will keep investments as they are.",
  "Buy the dip to bring the average buying price lower. Comfortable sitting with lower portfolio values and waiting for the market to recover in the long term.",
];
const DROP_LABELS = ["Sell everything", "Move to safety", "Wait it out", "Hold", "Buy the dip"];

const OBJECTIVES = [
  "Wealth growth",
  "Retirement",
  "Child's education",
  "Wedding",
  "Home purchase",
  "Estate planning",
];

export const VOICE_PARTS: VoicePart[] = [
  {
    sectionIndex: 0,
    title: "Your financial picture",
    blurb: "Income, spending and what you've already built up",
    questions: [
      {
        id: "annual_income",
        prompt: "Roughly what's your annual income, before tax?",
        hint: "Say an amount — for example, twelve lakhs",
        kind: "amount",
      },
      {
        id: "monthly_household_expense",
        prompt: "And about how much does your household spend in a month?",
        hint: "For example, eighty thousand",
        kind: "amount",
      },
      {
        id: "financial_assets",
        prompt:
          "What are your financial assets worth in total? That's cash, deposits and investments together.",
        hint: "For example, forty five lakhs",
        kind: "amount",
      },
    ],
  },
  {
    sectionIndex: 2,
    title: "Your investment preference and focus",
    blurb: "Your horizon, and how you behave when markets move",
    questions: [
      {
        id: "investment_horizon",
        prompt: "How long do you expect to stay invested? Under two years, two to five years, or five years and beyond?",
        hint: "Say a horizon, or the option number",
        kind: "choice",
        options: HORIZON_OPTIONS,
      },
      {
        id: "investment_experience",
        prompt:
          "How would you describe your investing experience? Are you a novice, do you have a basic understanding, are you an enthusiast, or are you experienced?",
        hint: "Say one of those four, or its number",
        kind: "choice",
        options: EXPERIENCE_OPTIONS,
        optionLabels: EXPERIENCE_LABELS,
      },
      {
        id: "investment_focus",
        prompt:
          "What matters more to you? Keeping it safe, staying mostly steady, a balanced approach, growth first, or maximising growth?",
        hint: "Say one of those five, or its number",
        kind: "choice",
        options: FOCUS_OPTIONS,
        optionLabels: FOCUS_LABELS,
      },
      {
        id: "drop_reaction",
        prompt:
          "If your portfolio fell about twenty percent, what would you do? Sell everything, move to safer assets, wait it out, hold, or buy the dip?",
        hint: "Say what you'd do, or the option number",
        kind: "choice",
        options: DROP_OPTIONS,
        optionLabels: DROP_LABELS,
      },
    ],
  },
  {
    sectionIndex: 3,
    title: "Tax details",
    blurb: "Your slab and regime, so advice can be tax-efficient",
    questions: [
      {
        id: "income_tax_rate",
        prompt: "What's your marginal income tax rate?",
        hint: "Say a percentage — for example, thirty percent",
        kind: "percent",
      },
      {
        id: "tax_regime",
        prompt: "And are you on the old tax regime or the new one?",
        hint: "Say old, or new",
        kind: "regime",
      },
    ],
  },
  {
    sectionIndex: 1,
    title: "What are you trying to achieve?",
    blurb: "The objectives your money is working toward",
    questions: [
      {
        id: "objectives",
        prompt:
          "Last one. What are you investing for? You can name more than one — wealth growth, retirement, your child's education, a wedding, a home, or estate planning.",
        hint: "Name as many as apply",
        kind: "multi",
        options: OBJECTIVES,
      },
    ],
  },
];
