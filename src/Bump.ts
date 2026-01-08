import fs from "node:fs/promises";
import path from "node:path";
import { readPackageJson, type Package } from "./Pnpm.ts";

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

/** Mapping from short prerelease prefix to full type name */
const prefixToType: Record<string, PrereleaseType> = {
  a: "alpha",
  b: "beta",
  rc: "rc",
};

/** Parse a version string into components */
export function parseVersion(version: string): ParsedVersion {
  // Match: major.minor.patch[-prerelease]
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:-(a|b|rc)(\d+))?$/);
  if (!match) throw new Error(`Invalid version: ${version}`);

  const [, major, minor, patch, preType, preNum] = match;
  return {
    major: Number(major),
    minor: Number(minor),
    patch: Number(patch),
    ...(preType && {
      prerelease: { type: prefixToType[preType], num: Number(preNum) },
    }),
  };
}

/** Format a parsed version back to string */
function formatVersion(ver: ParsedVersion): string {
  const base = `${ver.major}.${ver.minor}.${ver.patch}`;
  if (!ver.prerelease) return base;
  return `${base}-${prereleasePrefix[ver.prerelease.type]}${ver.prerelease.num}`;
}

/** Result of bumping a package version */
export interface BumpResult {
  package: string;
  oldVersion: string;
  newVersion: string;
  reason: string;
}

/** Check if bump type is a stable version bump */
function isStableBump(type: BumpType): type is "major" | "minor" | "patch" {
  return type === "major" || type === "minor" || type === "patch";
}

/** Graduate prerelease to stable, applying the bump type */
function graduateToStable(ver: ParsedVersion, type: "major" | "minor" | "patch"): ParsedVersion {
  // For patch, just remove prerelease (0.7.0-a1 -> 0.7.0)
  if (type === "patch") return { ...ver, prerelease: undefined };
  // For minor: bump minor, reset patch (0.7.0-a1 -> 0.8.0)
  if (type === "minor") return { ...ver, minor: ver.minor + 1, patch: 0, prerelease: undefined };
  // For major: bump major, reset minor and patch (0.7.0-a1 -> 1.0.0)
  return { major: ver.major + 1, minor: 0, patch: 0 };
}

/** Apply stable bump to a stable version */
function applyStableBump(ver: ParsedVersion, type: "major" | "minor" | "patch"): ParsedVersion {
  if (type === "major") return { major: ver.major + 1, minor: 0, patch: 0 };
  if (type === "minor") return { ...ver, minor: ver.minor + 1, patch: 0 };
  return { ...ver, patch: ver.patch + 1 };
}

/** Apply prerelease bump */
function applyPrereleaseBump(ver: ParsedVersion, type: PrereleaseType): ParsedVersion {
  // Already in prerelease of same type: increment (0.7.0-a1 -> 0.7.0-a2)
  if (ver.prerelease?.type === type) {
    return { ...ver, prerelease: { type, num: ver.prerelease.num + 1 } };
  }
  // Different prerelease type: start at 1 (0.7.0-a2 -> 0.7.0-b1)
  if (ver.prerelease) {
    return { ...ver, prerelease: { type, num: 1 } };
  }
  // Starting prerelease from stable: bump minor (0.7.0 + alpha -> 0.8.0-a1)
  return { ...ver, minor: ver.minor + 1, patch: 0, prerelease: { type, num: 1 } };
}

/** Bump a semver version */
export function bumpVersion(version: string, type: BumpType): string {
  const parsed = parseVersion(version);

  if (isStableBump(type)) {
    const bumped = parsed.prerelease
      ? graduateToStable(parsed, type)
      : applyStableBump(parsed, type);
    return formatVersion(bumped);
  }

  return formatVersion(applyPrereleaseBump(parsed, type));
}

/** Update version in a package.json file */
export async function updatePackageVersion(
  packagePath: string,
  newVersion: string,
): Promise<void> {
  const packageJsonPath = path.join(packagePath, "package.json");
  const packageJson = await readPackageJson(packagePath);

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
  const packagesToBump = packages.filter(pkg => toBump.has(pkg.name));

  const results = packagesToBump.map(pkg => ({
    package: pkg.name,
    oldVersion: pkg.version,
    newVersion: bumpVersion(pkg.version, type),
    reason: reasons.get(pkg.name) || "changed",
  }));

  if (!dryRun) {
    await Promise.all(
      packagesToBump.map((pkg, i) =>
        updatePackageVersion(pkg.path, results[i].newVersion),
      ),
    );
  }

  return results;
}
