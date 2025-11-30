import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import type { BumpType } from "./Bump.ts";

/** CLI options parsed from command line arguments */
export interface CliOptions {
  type: BumpType;
  dryRun: boolean;
  changelog: boolean;
  commit: boolean;
  tag: boolean;
  push: boolean;
  verbose: boolean;
}

/** Parse command line arguments and return options */
export async function parseCliArgs(): Promise<CliOptions> {
  const { values } = parseArgs({
    options: {
      type: { type: "string", short: "t", default: "patch" },
      "dry-run": { type: "boolean", default: false },
      changelog: { type: "boolean", default: false },
      commit: { type: "boolean", default: true },
      tag: { type: "boolean", default: true },
      push: { type: "boolean", default: false },
      verbose: { type: "boolean", short: "v", default: false },
      version: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: true,
    allowNegative: true,
  });

  if (values.version) {
    const scriptDir = path.dirname(fileURLToPath(import.meta.url));
    const pkgPath = path.join(scriptDir, "..", "package.json");
    const pkg = JSON.parse(await fs.readFile(pkgPath, "utf-8"));
    console.log(pkg.version);
    process.exit(0);
  }

  if (values.help) {
    printHelp();
    process.exit(0);
  }

  const type = values.type as string;
  if (!["major", "minor", "patch"].includes(type)) {
    console.error(
      `Invalid bump type: ${type}. Must be major, minor, or patch.`,
    );
    process.exit(1);
  }

  return {
    type: type as BumpType,
    dryRun: values["dry-run"] as boolean,
    changelog: values.changelog as boolean,
    commit: values.commit as boolean,
    tag: values.tag as boolean,
    push: values.push as boolean,
    verbose: values.verbose as boolean,
  };
}

function printHelp(): void {
  console.log(`
monobump - Smart version bumping for pnpm monorepos

Usage: monobump [options]

Options:
  -t, --type <type>      Bump type: major, minor, or patch (default: patch)
  --dry-run              Show what would be bumped without making changes
  --changelog            Output changelog markdown grouped by package
  --commit, --no-commit  Create a git commit (default: true)
  --tag, --no-tag        Create git tags (default: true)
  --push                 Push commit and tags to remote
  -v, --verbose          Show verbose output
  -V, --version          Show version number
  -h, --help             Show this help message

Examples:
  monobump                          # Bump patch version
  monobump --type minor --dry-run   # Preview minor version bump
  monobump --changelog              # Bump and output changelog
  monobump --push                   # Bump, commit, tag, and push
`);
}
