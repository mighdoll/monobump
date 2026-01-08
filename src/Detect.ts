import { exec as execCallback } from "node:child_process";
import { realpath } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { Package } from "./Pnpm.ts";

const exec = promisify(execCallback);

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
    return tags.length > 0 ? tags[0] : null;
  } catch {
    return null;
  }
}

/** Get all files changed since a specific commit */
export async function getChangedFiles(
  since: string | null,
  cwd: string = process.cwd(),
): Promise<string[]> {
  // If no previous release, compare against first commit (initial release)
  const range = since
    ? `${since}..HEAD`
    : `$(git rev-list --max-parents=0 HEAD)..HEAD`;
  const { stdout } = await exec(`git diff --name-only ${range}`, { cwd });
  return stdout.trim().split("\n").filter(Boolean);
}

/** Get commit history for changed files since last release */
export async function getCommitHistory(
  since: string | null,
  cwd: string = process.cwd(),
): Promise<CommitInfo[]> {
  // If no previous release, get all commits (initial release)
  const range = since
    ? `${since}..HEAD`
    : `$(git rev-list --max-parents=0 HEAD)..HEAD`;
  const { stdout } = await exec(`git log --oneline ${range}`, { cwd });
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
  // If no previous release, get all commits (initial release)
  const range = since
    ? `${since}..HEAD`
    : `$(git rev-list --max-parents=0 HEAD)..HEAD`;
  const pathArgs = paths.join(" ");
  const { stdout } = await exec(`git log --oneline ${range} -- ${pathArgs}`, {
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
  for (const pkg of packages) {
    if (
      absoluteFile.startsWith(pkg.realPath + path.sep) ||
      absoluteFile === pkg.realPath
    ) {
      return pkg.name;
    }
  }
  return null;
}

/** Detect which packages have changes since last release */
export async function detectChangedPackages(
  packages: Package[],
  cwd: string = process.cwd(),
): Promise<{ changed: Set<string>; commits: CommitInfo[] }> {
  const changed = new Set<string>();
  const allCommits: CommitInfo[] = [];

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
    const range = lastTag ? `${lastTag}..HEAD` : `$(git rev-list --max-parents=0 HEAD)..HEAD`;
    const pkgRelPath = path.relative(cwd, pkg.path);
    const { stdout } = await exec(
      `git diff --name-only ${range} -- "${pkgRelPath}"`,
      { cwd },
    );
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}
