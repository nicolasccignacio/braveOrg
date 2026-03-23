import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function normalizeBase(raw) {
  let b = (raw || "/").trim() || "/";
  if (!b.startsWith("/")) b = "/" + b;
  if (!b.endsWith("/")) b += "/";
  return b;
}

// GitHub Pages project site: set PAGES_BASE_PATH=/repo-name/ in Actions (repository variable).
export default defineConfig({
  plugins: [react()],
  base: normalizeBase(process.env.VITE_BASE_PATH),
  publicDir: "public",
});
