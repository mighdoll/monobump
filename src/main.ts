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

// Run the CLI
main();

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
  const gitRoot = await findGitRoot();
  const workspaceCwd = process.cwd();
  logVerbose(options.verbose, "Options:", options);
  logVerbose(options.verbose, "Git root:", gitRoot);
  logVerbose(options.verbose, "Workspace directory:", workspaceCwd);

  logVerbose(options.verbose, "Discovering packages...");
  const packages = await findWorkspacePackages(workspaceCwd);
  const publicCount = packages.filter(p => !p.private).length;
  logVerbose(
    options.verbose,
    `Found ${packages.length} packages (${publicCount} public)`,
  );

  logVerbose(options.verbose, "Detecting changes since last release...");
  const { changed } = await detectChangedPackages(packages, gitRoot);
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
  await displayResults(results, packages, options, gitRoot);

  if (!options.dryRun && options.commit) {
    await performGitOps(results, options, gitRoot);
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
  if (results.length === 0) return;

  // Create commit with appropriate message
  const versions = new Set(results.map(r => r.newVersion));
  const commitMessage =
    versions.size === 1
      ? `chore: release v${results[0].newVersion}`
      : `chore: release ${results.map(r => `${r.package}@${r.newVersion}`).join(", ")}`;

  console.log("\nCreating commit...");
  await createCommit(commitMessage, cwd);

  if (options.tag) {
    // Create per-package tags
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

function logVerbose(verbose: boolean, ...args: any[]) {
  if (verbose) console.log(...args);
}
