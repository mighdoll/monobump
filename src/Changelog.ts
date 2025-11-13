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

  const packageMap = new Map(packages.map(p => [p.name, p]));
  const resultMap = new Map(results.map(r => [r.package, r]));
  const lastRelease = await findLastReleaseCommit(cwd);
  let output = "";

  for (const result of results) {
    output += `## ${result.package}\n`;

    if (result.reason === "changed") {
      const pkg = packageMap.get(result.package);
      if (pkg) {
        const commits = await getCommitsForPaths([pkg.path], lastRelease, cwd);
        for (const commit of commits) {
          output += `- ${commit.hash} ${commit.message}\n`;
        }
      }
    } else {
      const depName = extractDependencyName(result.reason);
      const depResult = resultMap.get(depName);
      if (depResult) {
        output += `- Dependency: ${depName} ${depResult.newVersion}\n`;
      }
    }

    output += "\n";
  }

  return output;
}

function extractDependencyName(reason: string): string {
  const match = reason.match(/depends on (.+?)( ->|$)/);
  return match ? match[1] : "";
}

/** Format bump results for display */
export function formatResults(results: BumpResult[]): string {
  if (results.length === 0) {
    return "No packages to bump.";
  }

  let output = "\nPackages to bump:\n\n";

  for (const result of results) {
    const icon = result.reason === "changed" ? "*" : "^";
    output += `  ${icon} ${result.package}: ${result.oldVersion} -> ${result.newVersion} (${result.reason})\n`;
  }

  return output;
}
