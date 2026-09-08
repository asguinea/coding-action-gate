import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const uiRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: uiRoot,
  build: {
    outDir: "dist",
    emptyOutDir: true
  }
});
