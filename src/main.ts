import type { BumpResult } from "./Bump.ts";
import { bumpPackages } from "./Bump.ts";
import { getPackagesToBump, getPackagesWithChangedDeps } from "./Cascade.ts";
import { formatChangelog, formatResults } from "./Changelog.ts";
import type { CliOptions } from "./Cli.ts";
import { parseCliArgs } from "./Cli.ts";
import { detectChangedPackages } from "./Detect.ts";
import { createCommit, createTag, findGitRoot, push } from "./Git.ts";
import type { Package } from "./Pnpm.ts";
import { findWorkspacePackages } from "./Pnpm.ts";

interface CascadeResult {
  toBump: Set<string>;
  reasons: Map<string, string>;
}

export async function main(): Promise<void> {
  const options = await parseCliArgs();

  try {
    await runBump(options);
  } catch (error) {
    console.error(
      "Error:",
      error instanceof Error ? error.message : String(error),
    );
    process.exit(1);
  }
}

async function runBump(options: CliOptions): Promise<void> {
  const gitRoot = await findGitRoot();
  const workspaceCwd = process.cwd();
  const log = createVerboseLogger(options.verbose);

  log("Options:", options);
  log("Git root:", gitRoot);
  log("Workspace directory:", workspaceCwd);

  // Discover packages
  log("Discovering packages...");
  const packages = await findWorkspacePackages(workspaceCwd);
  const publicCount = packages.filter(p => !p.private).length;
  log(`Found ${packages.length} packages (${publicCount} public)`);

  // Detect changes
  log("Detecting changes since last release...");
  const { changed } = await detectChangedPackages(packages, gitRoot);
  log(`Changed packages: ${Array.from(changed).join(", ")}`);

  // Compute cascade based on mode
  const cascade = options.packages.length > 0
    ? await computeExplicitModeCascade(packages, options.packages, changed, log)
    : await computeAutoDetectCascade(packages, changed, log);

  if (!cascade) return;

  const { toBump, reasons } = cascade;
  if (toBump.size === 0) {
    console.log("No public packages affected. Nothing to bump!");
    return;
  }

  // Perform bumps and display results
  const results = await bumpPackages(
    packages,
    toBump,
    reasons,
    options.type,
    options.dryRun,
  );
  await displayResults(results, packages, options, gitRoot);

  if (!options.dryRun && options.commit && results.length > 0) {
    await performGitOps(results, options, gitRoot);
  }
}

function createVerboseLogger(verbose: boolean): (...args: unknown[]) => void {
  return verbose ? (...args) => console.log(...args) : () => {};
}

/** Explicit mode: user specifies packages, cascade DOWN to dependencies with changes */
async function computeExplicitModeCascade(
  packages: Package[],
  requestedPackages: string[],
  changed: Set<string>,
  log: (...args: unknown[]) => void,
): Promise<CascadeResult> {
  const packageNames = new Set(packages.map(p => p.name));
  const invalidPackages = requestedPackages.filter(p => !packageNames.has(p));
  if (invalidPackages.length > 0) {
    throw new Error(`Unknown package(s): ${invalidPackages.join(", ")}`);
  }

  const specifiedPackages = new Set(requestedPackages);
  log(`Specified packages: ${Array.from(specifiedPackages).join(", ")}`);
  log("Finding dependencies with changes...");

  return getPackagesWithChangedDeps(packages, specifiedPackages, changed);
}

/** Auto-detect mode: find changed packages, cascade UP to dependents */
async function computeAutoDetectCascade(
  packages: Package[],
  changed: Set<string>,
  log: (...args: unknown[]) => void,
): Promise<CascadeResult | null> {
  if (changed.size === 0) {
    console.log("No changes detected. Nothing to bump!");
    return null;
  }

  log("Computing dependency cascade...");
  return getPackagesToBump(packages, changed);
}

async function displayResults(
  results: BumpResult[],
  packages: Package[],
  options: CliOptions,
  cwd: string,
): Promise<void> {
  console.log(formatResults(results));

  if (options.changelog) {
    console.log("\nChangelog:\n");
    const changelog = await formatChangelog(results, packages, cwd);
    console.log(changelog);
  }

  if (options.dryRun) {
    console.log("\nDry run - no changes made.");
  }
}

async function performGitOps(
  results: BumpResult[],
  options: CliOptions,
  cwd: string,
): Promise<void> {
  const commitMessage = formatCommitMessage(results);
  console.log("\nCreating commit...");
  await createCommit(commitMessage, cwd);

  if (options.tag) {
    for (const result of results) {
      const tag = `${result.package}@${result.newVersion}`;
      console.log(`Creating tag ${tag}...`);
      await createTag(tag, cwd);
    }
  }

  if (options.push) {
    console.log("Pushing to remote...");
    await push(options.tag, cwd);
  }
}

function formatCommitMessage(results: BumpResult[]): string {
  const versions = new Set(results.map(r => r.newVersion));
  if (versions.size === 1) {
    return `chore: release v${results[0].newVersion}`;
  }
  return `chore: release ${results.map(r => `${r.package}@${r.newVersion}`).join(", ")}`;
}
