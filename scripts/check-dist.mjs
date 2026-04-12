import fs from "node:fs";

const index = "dist/index.html";
if (!fs.existsSync(index)) {
  console.error(
    `Missing ${index}. Your dist/ only has public/ assets — run a full Vite build from the repo root:\n` +
      "  npm ci && npm run build\n",
  );
  process.exit(1);
}
console.log(`${index} OK`);
