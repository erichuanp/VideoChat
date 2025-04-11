// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// 处理 __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    https: {
      key: fs.readFileSync(path.resolve(__dirname, "certs/key.pem")),
      cert: fs.readFileSync(path.resolve(__dirname, "certs/cert.pem")),
    },
  },
});
