import { parseArgs } from "node:util";
import type { BumpType } from "./Bump.ts";

/** CLI options parsed from command line arguments */
export interface CliOptions {
  type: BumpType;
  dryRun: boolean;
  changelog: boolean;
  noCommit: boolean;
  tag: boolean;
  push: boolean;
  verbose: boolean;
}

/** Parse command line arguments and return options */
export function parseCliArgs(): CliOptions {
  const { values } = parseArgs({
    options: {
      type: { type: "string", short: "t", default: "patch" },
      "dry-run": { type: "boolean", default: false },
      changelog: { type: "boolean", default: false },
      "no-commit": { type: "boolean", default: false },
      tag: { type: "boolean", default: true },
      push: { type: "boolean", default: false },
      verbose: { type: "boolean", short: "v", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: true,
  });

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
    noCommit: values["no-commit"] as boolean,
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
  --no-commit            Don't create a git commit
  --tag                  Create a git tag (default: true)
  --push                 Push commit and tags to remote
  -v, --verbose          Show verbose output
  -h, --help             Show this help message

Examples:
  monobump                          # Bump patch version
  monobump --type minor --dry-run   # Preview minor version bump
  monobump --changelog              # Bump and output changelog
  monobump --push                   # Bump, commit, tag, and push
`);
}
