import { exec as execCallback } from "node:child_process";
import { realpath } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { Package } from "./Pnpm.ts";

const exec = promisify(execCallback);

/** Build git range from optional starting commit to HEAD */
function gitRange(since: string | null): string {
  // If no starting point, compare against first commit (initial release)
  return since ? `${since}..HEAD` : `$(git rev-list --max-parents=0 HEAD)..HEAD`;
}

/** Commit information from git log */
export interface CommitInfo {
  hash: string;
  message: string;
}

/** Find the last release commit (matching "chore: release") */
export async function findLastReleaseCommit(
  cwd: string = process.cwd(),
): Promise<string | null> {
  try {
    const { stdout } = await exec(
      'git log --oneline --grep="chore: release" -1',
      { cwd },
    );
    const match = stdout.trim().match(/^([a-f0-9]+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/** Find the last release tag for a specific package */
export async function findLastPackageTag(
  packageName: string,
  cwd: string = process.cwd(),
): Promise<string | null> {
  try {
    // Tags are formatted as "packageName@version"
    // Get most recent tag matching this package
    const { stdout } = await exec(
      `git tag --list "${packageName}@*" --sort=-version:refname`,
      { cwd },
    );
    const tags = stdout.trim().split("\n").filter(Boolean);
    return tags.at(0) ?? null;
  } catch {
    return null;
  }
}

/** Get all files changed since a specific commit */
export async function getChangedFiles(
  since: string | null,
  cwd: string = process.cwd(),
): Promise<string[]> {
  const { stdout } = await exec(`git diff --name-only ${gitRange(since)}`, { cwd });
  return stdout.trim().split("\n").filter(Boolean);
}

/** Get commit history for changed files since last release */
export async function getCommitHistory(
  since: string | null,
  cwd: string = process.cwd(),
): Promise<CommitInfo[]> {
  const { stdout } = await exec(`git log --oneline ${gitRange(since)}`, { cwd });
  return stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .map(parseCommitLine)
    .filter((commit): commit is CommitInfo => commit !== null);
}

/** Get commits that touched specific files/directories */
export async function getCommitsForPaths(
  paths: string[],
  since: string | null,
  cwd: string = process.cwd(),
): Promise<CommitInfo[]> {
  if (paths.length === 0) return [];
  const pathArgs = paths.join(" ");
  const { stdout } = await exec(`git log --oneline ${gitRange(since)} -- ${pathArgs}`, {
    cwd,
  });
  return stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .map(parseCommitLine)
    .filter((commit): commit is CommitInfo => commit !== null);
}

function parseCommitLine(line: string): CommitInfo | null {
  const match = line.match(/^([a-f0-9]+)\s+(.+)$/);
  return match ? { hash: match[1], message: match[2] } : null;
}

/** Map changed files to packages */
export async function mapFilesToPackages(
  changedFiles: string[],
  packages: Package[],
  cwd: string = process.cwd(),
): Promise<Set<string>> {
  const normalizedPackages = await normalizePackagePaths(packages);
  const sortedPackages = sortByDepth(normalizedPackages);
  const changedPackages = new Set<string>();

  for (const file of changedFiles) {
    const absoluteFile = await resolveFilePath(cwd, file);
    if (!absoluteFile) continue;

    const pkg = findMatchingPackage(absoluteFile, sortedPackages);
    if (pkg) changedPackages.add(pkg);
  }

  return changedPackages;
}

async function normalizePackagePaths(packages: Package[]) {
  return Promise.all(
    packages.map(async pkg => ({
      name: pkg.name,
      realPath: await realpath(pkg.path),
    })),
  );
}

function sortByDepth(packages: Array<{ name: string; realPath: string }>) {
  return packages.sort((a, b) => {
    const depthA = path.normalize(a.realPath).split(path.sep).length;
    const depthB = path.normalize(b.realPath).split(path.sep).length;
    return depthB - depthA;
  });
}

async function resolveFilePath(
  cwd: string,
  file: string,
): Promise<string | null> {
  try {
    return await realpath(path.resolve(cwd, file));
  } catch {
    return null; // File deleted or doesn't exist
  }
}

function findMatchingPackage(
  absoluteFile: string,
  packages: Array<{ name: string; realPath: string }>,
): string | null {
  const match = packages.find(
    pkg =>
      absoluteFile.startsWith(pkg.realPath + path.sep) ||
      absoluteFile === pkg.realPath,
  );
  return match?.name ?? null;
}

/** Detect which packages have changes since last release */
export async function detectChangedPackages(
  packages: Package[],
  cwd: string = process.cwd(),
): Promise<{ changed: Set<string>; commits: CommitInfo[] }> {
  const changed = new Set<string>();

  // Check each package individually against its own last release tag
  for (const pkg of packages) {
    const lastTag = await findLastPackageTag(pkg.name, cwd);
    const hasChanges = await packageHasChanges(pkg, lastTag, cwd);
    if (hasChanges) {
      changed.add(pkg.name);
    }
  }

  // Get overall commit history for changelog (use global last release)
  const lastRelease = await findLastReleaseCommit(cwd);
  const commits = await getCommitHistory(lastRelease, cwd);

  return { changed, commits };
}

/** Check if a package has changes since its last tag */
async function packageHasChanges(
  pkg: Package,
  lastTag: string | null,
  cwd: string,
): Promise<boolean> {
  try {
    // Resolve symlinks to ensure consistent paths (e.g., /tmp vs /private/tmp on macOS)
    const realCwd = await realpath(cwd);
    const realPkgPath = await realpath(pkg.path);
    const pkgRelPath = path.relative(realCwd, realPkgPath);
    const { stdout } = await exec(
      `git diff --name-only ${gitRange(lastTag)} -- "${pkgRelPath}"`,
      { cwd: realCwd },
    );
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}
