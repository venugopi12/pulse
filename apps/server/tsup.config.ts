import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node22",
  clean: true,
  // @pulse/shared ships TypeScript source (no build step of its own), so we
  // bundle it INTO the server output. Real npm deps stay external.
  noExternal: ["@pulse/shared"],
});
