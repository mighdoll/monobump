import { defineConfig } from "tsdown";

const toBin = "./bin/monobump";

// ignoreWatch doesn't seem to work with relative paths,
// and watch mode rebuilds in a loop on changes to the binary
// so we use an absolute path to the binary
const thisPath = import.meta.url;
const binPath = new URL(toBin, thisPath).pathname;

export default defineConfig({
  entry: ["./src/main.ts"],
  target: "node22",
  clean: true,
  platform: "node",
  format: "esm",
  outputOptions: {
    dir: undefined,
    file: toBin,
    banner: "#!/usr/bin/env node",
  },
  ignoreWatch: [binPath],
  logLevel: "warn",
});
