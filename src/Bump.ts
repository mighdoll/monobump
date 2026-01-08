import fs from "node:fs/promises";
import path from "node:path";
import type { Package } from "./Pnpm.ts";

/** Semantic version bump type */
export type BumpType = "major" | "minor" | "patch" | "alpha" | "beta" | "rc";

/** Prerelease type with prefix mapping */
const prereleasePrefix = {
  alpha: "a",
  beta: "b",
  rc: "rc",
} as const;

type PrereleaseType = keyof typeof prereleasePrefix;

/** Parsed version components */
interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  prerelease?: { type: PrereleaseType; num: number };
}

/** Parse a version string into components */
export function parseVersion(version: string): ParsedVersion {
  // Match: major.minor.patch[-prerelease]
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:-(a|b|rc)(\d+))?$/);
  if (!match) {
    throw new Error(`Invalid version: ${version}`);
  }

  const [, major, minor, patch, preType, preNum] = match;
  const result: ParsedVersion = {
    major: Number(major),
    minor: Number(minor),
    patch: Number(patch),
  };

  if (preType) {
    const typeMap: Record<string, PrereleaseType> = { a: "alpha", b: "beta", rc: "rc" };
    result.prerelease = { type: typeMap[preType], num: Number(preNum) };
  }

  return result;
}

/** Format a parsed version back to string */
function formatVersion(v: ParsedVersion): string {
  const base = `${v.major}.${v.minor}.${v.patch}`;
  if (v.prerelease) {
    return `${base}-${prereleasePrefix[v.prerelease.type]}${v.prerelease.num}`;
  }
  return base;
}

/** Result of bumping a package version */
export interface BumpResult {
  package: string;
  oldVersion: string;
  newVersion: string;
  reason: string;
}

/** Bump a semver version */
export function bumpVersion(version: string, type: BumpType): string {
  const v = parseVersion(version);

  // Handle stable version bumps (major/minor/patch)
  if (type === "major" || type === "minor" || type === "patch") {
    // If currently prerelease, graduate to stable base version
    if (v.prerelease) {
      delete v.prerelease;
      // For patch, just remove prerelease (0.7.0-a1 -> 0.7.0)
      // For minor/major, bump accordingly
      if (type === "minor") {
        v.minor++;
        v.patch = 0;
      } else if (type === "major") {
        v.major++;
        v.minor = 0;
        v.patch = 0;
      }
      return formatVersion(v);
    }
    // Normal stable bump
    switch (type) {
      case "major":
        return `${v.major + 1}.0.0`;
      case "minor":
        return `${v.major}.${v.minor + 1}.0`;
      case "patch":
        return `${v.major}.${v.minor}.${v.patch + 1}`;
    }
  }

  // Handle prerelease bumps (alpha/beta/rc)
  const prereleaseType = type as PrereleaseType;

  if (v.prerelease) {
    // Already in prerelease
    if (v.prerelease.type === prereleaseType) {
      // Same type: increment number (0.7.0-a1 -> 0.7.0-a2)
      v.prerelease.num++;
    } else {
      // Different type: start new prerelease at 1 (0.7.0-a2 -> 0.7.0-b1)
      v.prerelease = { type: prereleaseType, num: 1 };
    }
  } else {
    // Starting prerelease from stable: bump minor, add prerelease
    // (0.7.0 + alpha -> 0.8.0-a1)
    v.minor++;
    v.patch = 0;
    v.prerelease = { type: prereleaseType, num: 1 };
  }

  return formatVersion(v);
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
