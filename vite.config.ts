import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  root: "playground",
  publicDir: "../assets",
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^@silver\/audio-visualiser\/react$/, replacement: fromRoot("./src/react/index.ts") },
      { find: /^@silver\/audio-visualiser$/, replacement: fromRoot("./src/index.ts") },
    ],
  },
});
