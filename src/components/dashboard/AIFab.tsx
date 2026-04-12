import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";

interface Props {
  onClick: () => void;
}

const AIFab = ({ onClick }: Props) => (
  <motion.button
    onClick={onClick}
    whileHover={{ scale: 1.05 }}
    whileTap={{ scale: 0.97 }}
    className="fixed bottom-20 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full wealth-gradient"
    style={{
      boxShadow:
        "0 4px 24px -4px hsl(var(--wealth-navy) / 0.5), 0 0 16px 2px hsl(var(--wealth-blue) / 0.25)",
    }}
  >
    <Sparkles
      className="h-5 w-5 text-primary-foreground drop-shadow-[0_0_6px_hsl(var(--wealth-blue)/0.8)]"
    />
  </motion.button>
);

export default AIFab;
