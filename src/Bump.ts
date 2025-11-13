import fs from "node:fs/promises";
import path from "node:path";
import type { Package } from "./Pnpm.ts";

/** Semantic version bump type */
export type BumpType = "major" | "minor" | "patch";

/** Result of bumping a package version */
export interface BumpResult {
  package: string;
  oldVersion: string;
  newVersion: string;
  reason: string;
}

/** Bump a semver version */
export function bumpVersion(version: string, type: BumpType): string {
  const parts = version.split(".").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) {
    throw new Error(`Invalid version: ${version}`);
  }

  const [major, minor, patch] = parts;

  switch (type) {
    case "major":
      return `${major + 1}.0.0`;
    case "minor":
      return `${major}.${minor + 1}.0`;
    case "patch":
      return `${major}.${minor}.${patch + 1}`;
  }
}

/** Update version in a package.json file */
export async function updatePackageVersion(
  packagePath: string,
  newVersion: string,
): Promise<void> {
  const packageJsonPath = path.join(packagePath, "package.json");
  const content = await fs.readFile(packageJsonPath, "utf-8");
  const packageJson = JSON.parse(content);

  packageJson.version = newVersion;

  // Write back with pretty formatting
  await fs.writeFile(
    packageJsonPath,
    JSON.stringify(packageJson, null, 2) + "\n",
  );
}

/** Bump versions for all packages in the toBump set */
export async function bumpPackages(
  packages: Package[],
  toBump: Set<string>,
  reasons: Map<string, string>,
  type: BumpType,
  dryRun = false,
): Promise<BumpResult[]> {
  const results: BumpResult[] = [];

  for (const pkg of packages) {
    if (!toBump.has(pkg.name)) continue;

    const oldVersion = pkg.version;
    const newVersion = bumpVersion(oldVersion, type);
    const reason = reasons.get(pkg.name) || "changed";

    if (!dryRun) {
      await updatePackageVersion(pkg.path, newVersion);
    }

    results.push({
      package: pkg.name,
      oldVersion,
      newVersion,
      reason,
    });
  }

  return results;
}
