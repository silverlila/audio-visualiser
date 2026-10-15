import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  root: "playground",
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^audio-visualiser\/react$/, replacement: fromRoot("./src/react/index.ts") },
      { find: /^audio-visualiser$/, replacement: fromRoot("./src/index.ts") },
    ],
  },
});
