import type { BumpResult } from "./Bump.ts";
import { bumpPackages } from "./Bump.ts";
import { getPackagesToBump } from "./Cascade.ts";
import { formatChangelog, formatResults } from "./Changelog.ts";
import type { CliOptions } from "./Cli.ts";
import { parseCliArgs } from "./Cli.ts";
import { detectChangedPackages } from "./Detect.ts";
import { createCommit, createTag, findGitRoot, push } from "./Git.ts";
import type { Package } from "./Pnpm.ts";
import { findWorkspacePackages } from "./Pnpm.ts";

export async function main(): Promise<void> {
  const options = parseCliArgs();

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
  const cwd = await findGitRoot();
  logVerbose(options.verbose, "Options:", options);
  logVerbose(options.verbose, "Working directory:", cwd);

  logVerbose(options.verbose, "Discovering packages...");
  const packages = await findWorkspacePackages(cwd);
  const publicCount = packages.filter(p => !p.private).length;
  logVerbose(
    options.verbose,
    `Found ${packages.length} packages (${publicCount} public)`,
  );

  logVerbose(options.verbose, "Detecting changes since last release...");
  const { changed } = await detectChangedPackages(packages, cwd);
  logVerbose(
    options.verbose,
    `Changed packages: ${Array.from(changed).join(", ")}`,
  );

  if (changed.size === 0) {
    console.log("No changes detected. Nothing to bump!");
    return;
  }

  logVerbose(options.verbose, "Computing dependency cascade...");
  const { toBump, reasons } = await getPackagesToBump(packages, changed);

  if (toBump.size === 0) {
    console.log("No public packages affected. Nothing to bump!");
    return;
  }

  const results = await bumpPackages(
    packages,
    toBump,
    reasons,
    options.type,
    options.dryRun,
  );
  await displayResults(results, packages, options, cwd);

  if (!options.dryRun && !options.noCommit) {
    await performGitOps(results, options, cwd);
  }
}

async function displayResults(
  results: BumpResult[],
  packages: Package[],
  options: CliOptions,
  cwd: string,
) {
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
) {
  const newVersion = results[0]?.newVersion;
  if (!newVersion) return;

  console.log("\nCreating commit...");
  await createCommit(`chore: release v${newVersion}`, cwd);

  if (options.tag) {
    console.log(`Creating tag v${newVersion}...`);
    await createTag(`v${newVersion}`, cwd);
  }

  if (options.push) {
    console.log("Pushing to remote...");
    await push(options.tag, cwd);
  }
}

function logVerbose(verbose: boolean, ...args: any[]) {
  if (verbose) console.log(...args);
}
