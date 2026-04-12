import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";

const OnboardingLoading = () => {
  const navigate = useNavigate();
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const start = Date.now();

    const t1 = window.setInterval(() => {
      const elapsed = Date.now() - start;
      // ~3.5s total
      const pct = Math.min(95, Math.round((elapsed / 3500) * 100));
      setProgress(pct);
    }, 100);

    const t2 = window.setTimeout(() => {
      setProgress(100);
      navigate("/chat");
    }, 3500);

    return () => {
      if (t1) window.clearInterval(t1);
      if (t2) window.clearTimeout(t2);
    };
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="w-full max-w-[340px] flex flex-col items-center text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-foreground">Preparing your portfolio</h2>
        <p className="text-xs text-muted-foreground mt-2">This can take a moment. Please wait…</p>
        <div className="w-full mt-5 bg-secondary rounded-full h-2.5 overflow-hidden">
          <div className="h-full bg-foreground transition-all" style={{ width: `${progress}%` }} />
        </div>
        <p className="text-[10px] text-muted-foreground mt-2">{progress}%</p>
      </div>
    </div>
  );
};

export default OnboardingLoading;

