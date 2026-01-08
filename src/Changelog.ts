import type { BumpResult } from "./Bump.ts";
import { findLastReleaseCommit, getCommitsForPaths } from "./Detect.ts";
import type { Package } from "./Pnpm.ts";

/** Generate changelog showing commits per package and dependency updates */
export async function formatChangelog(
  results: BumpResult[],
  packages: Package[],
  cwd: string,
): Promise<string> {
  if (results.length === 0) return "No packages to bump.\n";

  const packageByName = new Map(packages.map(pkg => [pkg.name, pkg]));
  const resultByPackage = new Map(results.map(result => [result.package, result]));
  const lastRelease = await findLastReleaseCommit(cwd);

  const sections = await Promise.all(
    results.map(result => formatPackageSection(result, packageByName, resultByPackage, lastRelease, cwd)),
  );

  return sections.join("\n");
}

async function formatPackageSection(
  result: BumpResult,
  packageByName: Map<string, Package>,
  resultByPackage: Map<string, BumpResult>,
  lastRelease: string | null,
  cwd: string,
): Promise<string> {
  const header = `## ${result.package}\n`;
  const body = result.reason === "changed"
    ? await formatCommitsList(result.package, packageByName, lastRelease, cwd)
    : formatDependencyUpdate(result.reason, resultByPackage);

  return header + body + "\n";
}

async function formatCommitsList(
  packageName: string,
  packageByName: Map<string, Package>,
  lastRelease: string | null,
  cwd: string,
): Promise<string> {
  const pkg = packageByName.get(packageName);
  if (!pkg) return "";

  const commits = await getCommitsForPaths([pkg.path], lastRelease, cwd);
  return commits.map(commit => `- ${commit.hash} ${commit.message}\n`).join("");
}

function formatDependencyUpdate(
  reason: string,
  resultByPackage: Map<string, BumpResult>,
): string {
  const depNameMatch = reason.match(/depends on (.+?)( ->|$)/);
  if (!depNameMatch) return "";

  const depName = depNameMatch[1];
  const depResult = resultByPackage.get(depName);
  if (!depResult) return "";

  return `- Dependency: ${depName} ${depResult.newVersion}\n`;
}

/** Format bump results for display */
export function formatResults(results: BumpResult[]): string {
  if (results.length === 0) return "No packages to bump.";

  const lines = results.map(result => {
    const icon = result.reason === "changed" ? "*" : "^";
    return `  ${icon} ${result.package}: ${result.oldVersion} -> ${result.newVersion} (${result.reason})`;
  });

  return "\nPackages to bump:\n\n" + lines.join("\n") + "\n";
}
