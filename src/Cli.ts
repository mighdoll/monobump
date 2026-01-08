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
  packages: string[];
}

const BUMP_TYPES: BumpType[] = ["major", "minor", "patch", "alpha", "beta", "rc"];

const CLI_OPTIONS = {
  // Bump type flags
  major: { type: "boolean", default: false },
  minor: { type: "boolean", default: false },
  patch: { type: "boolean", default: false },
  alpha: { type: "boolean", default: false },
  beta: { type: "boolean", default: false },
  rc: { type: "boolean", default: false },
  // Other options
  "dry-run": { type: "boolean", default: false },
  changelog: { type: "boolean", default: false },
  commit: { type: "boolean", default: true },
  tag: { type: "boolean", default: true },
  push: { type: "boolean", default: false },
  verbose: { type: "boolean", short: "v", default: false },
  version: { type: "boolean", default: false },
  help: { type: "boolean", short: "h", default: false },
} as const;

/** Parse command line arguments and return options */
export async function parseCliArgs(): Promise<CliOptions> {
  const { values, positionals } = parseArgs({
    options: CLI_OPTIONS,
    allowPositionals: true,
    allowNegative: true,
  });

  if (values.version) {
    await printVersion();
    process.exit(0);
  }

  if (values.help) {
    printHelp();
    process.exit(0);
  }

  const bumpType = resolveBumpType(values);

  return {
    type: bumpType,
    dryRun: Boolean(values["dry-run"]),
    changelog: Boolean(values.changelog),
    commit: Boolean(values.commit),
    tag: Boolean(values.tag),
    push: Boolean(values.push),
    verbose: Boolean(values.verbose),
    packages: positionals,
  };
}

/** Read and print the package version from package.json */
async function printVersion(): Promise<void> {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const pkgPath = path.join(scriptDir, "..", "package.json");
  const pkg = JSON.parse(await fs.readFile(pkgPath, "utf-8"));
  console.log(pkg.version);
}

/** Resolve bump type from CLI flags, defaulting to patch */
function resolveBumpType(values: Record<string, unknown>): BumpType {
  const enabledTypes = BUMP_TYPES.filter(t => values[t]);

  if (enabledTypes.length > 1) {
    console.error(`Only one bump type allowed. Got: ${enabledTypes.join(", ")}`);
    process.exit(1);
  }

  return enabledTypes[0] ?? "patch";
}

function printHelp(): void {
  console.log(`
monobump - Smart version bumping for pnpm monorepos

Usage: monobump [options] [packages...]

Arguments:
  packages               Package names to bump (if omitted, auto-detects changed packages)

Bump type:
  --patch                Bump patch version (default)
  --minor                Bump minor version
  --major                Bump major version
  --alpha                Start or increment alpha prerelease
  --beta                 Start or increment beta prerelease
  --rc                   Start or increment release candidate

Options:
  --dry-run              Show what would be bumped without making changes
  --changelog            Output changelog markdown grouped by package
  --commit, --no-commit  Create a git commit (default: true)
  --tag, --no-tag        Create git tags (default: true)
  --push                 Push commit and tags to remote
  -v, --verbose          Show verbose output
  -V, --version          Show version number
  -h, --help             Show this help message

Prerelease behavior:
  alpha/beta/rc from stable    Bumps minor, starts prerelease (0.7.0 -> 0.8.0-a1)
  alpha/beta/rc from same      Increments number (0.7.0-a1 -> 0.7.0-a2)
  alpha/beta/rc from different Starts new prerelease (0.7.0-a2 -> 0.7.0-b1)
  patch/minor/major from pre   Graduates to stable (0.7.0-a1 -> 0.7.0)

Examples:
  monobump                     # Bump patch version (auto-detect changes)
  monobump @myorg/pkg-a        # Bump only @myorg/pkg-a
  monobump pkg-a pkg-b --minor # Bump specific packages with minor version
  monobump --minor --dry-run   # Preview minor version bump
  monobump --alpha             # Start or increment alpha prerelease
  monobump --changelog         # Bump and output changelog
  monobump --push              # Bump, commit, tag, and push
`);
}
