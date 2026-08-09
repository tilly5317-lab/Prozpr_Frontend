import { ArrowLeft, Archive, Eye, Lock, Scale, type LucideIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import BottomNav from "@/components/BottomNav";

interface Group {
  icon: LucideIcon;
  title: string;
  points: string[];
}

/**
 * The long-form companion to the one-line note on the sign-in screen. Kept as
 * plain bullets on purpose — this is what a customer reads when they want to
 * know exactly who can see their data and how long it is kept, so it has to be
 * skimmable rather than a wall of policy prose.
 */
const GROUPS: Group[] = [
  {
    icon: Lock,
    title: "How your data is stored",
    points: [
      "Everything you upload — statements, holdings, documents — is stored encrypted, both in transit and at rest.",
      "Access is restricted to the systems that need it to run your account. Nobody browses it casually.",
      "Statement passwords are used once to open the PDF and are never stored.",
    ],
  },
  {
    icon: Eye,
    title: "Who looks at it",
    points: [
      "Our team does not track or review individual customer data as a matter of course.",
      "Your holdings and chats are processed automatically to produce your plan — not read by a person.",
      "Any analysis we run internally uses aggregated, de-identified data.",
    ],
  },
  {
    icon: Scale,
    title: "The exceptions",
    points: [
      "Individual transactions are reviewed only where we are required to do so by law, regulation, or a valid order from a competent authority.",
      "Outside of that, a review happens only in exceptional circumstances — and only when every member of the management team has agreed to it.",
      "Where the law allows us to tell you that a review took place, we will.",
    ],
  },
  {
    icon: Archive,
    title: "How long we keep it",
    points: [
      "What you upload and what you discuss with us has to be retained — local law and financial regulations set the minimum period, and we keep records for the number of years those rules require.",
      "That applies to imported statements, transaction records, and chat history alike.",
      "We cannot delete records early where a retention rule still applies to them. Once the period lapses, they are removed.",
      "Closing your account stops new data being collected; it does not shorten a retention period already running.",
    ],
  },
];

const PrivacyDisclaimer = () => {
  const navigate = useNavigate();

  return (
    <div className="mobile-container min-h-screen bg-background pb-20">
      <div className="flex items-center gap-3 px-5 pb-3 pt-10">
        <button
          onClick={() => navigate("/profile")}
          aria-label="Back to profile"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-muted transition-colors hover:bg-muted/80"
        >
          <ArrowLeft className="h-4 w-4 text-foreground" />
        </button>
        <div>
          <h1 className="text-lg font-semibold text-foreground">Your data &amp; privacy</h1>
          <p className="text-[11px] text-muted-foreground">
            What we store, who sees it, and how long we keep it
          </p>
        </div>
      </div>

      <div className="space-y-3 px-5">
        <div
          className="rounded-[14px] px-4 py-3"
          style={{
            border: "1px solid rgba(212, 168, 104, 0.45)",
            background: "linear-gradient(135deg, rgba(212,168,104,0.10) 0%, transparent 70%)",
          }}
        >
          <p className="text-[12.5px] leading-relaxed text-foreground">
            Anything you upload to Prozpr is stored securely, and our team does not track or review
            individual customer data. The points below set out the limited exceptions and the
            retention rules we have to follow.
          </p>
        </div>

        {GROUPS.map(({ icon: Icon, title, points }) => (
          <section key={title} className="wealth-card !p-4">
            <div className="mb-2.5 flex items-center gap-2.5">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-secondary">
                <Icon className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <h2 className="text-[13px] font-semibold text-foreground">{title}</h2>
            </div>
            <ul className="space-y-2">
              {points.map((point) => (
                <li key={point} className="flex gap-2.5">
                  <span
                    aria-hidden="true"
                    className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: "#D4A868" }}
                  />
                  <span className="text-[12px] leading-relaxed text-muted-foreground">{point}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}

        <p className="px-1 pb-2 text-[11px] leading-relaxed text-muted-foreground/70">
          Questions about your data, or want to know what we hold on you? Use Report an Issue on the
          profile screen and we&apos;ll come back to you.
        </p>
      </div>

      <BottomNav />
    </div>
  );
};

export default PrivacyDisclaimer;
