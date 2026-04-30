import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig(({ command }) => {
  if (command === "serve") {
    return {
      root: resolve(__dirname, "demo"),
      server: { port: 5180 },
    };
  }

  return {
    base: "./",
    build: {
      lib: {
        entry: resolve(__dirname, "src/index.ts"),
        name: "FactoryFloor",
        fileName: "factory-floor",
        formats: ["es", "umd"],
      },
      outDir: resolve(__dirname, "dist"),
      rollupOptions: {
        output: {
          assetFileNames: "assets/[name]-[hash][extname]",
        },
      },
    },
  };
});
