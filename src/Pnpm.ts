import { exec as execCallback } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const exec = promisify(execCallback);

/** Represents a package in the pnpm workspace */
export interface Package {
  name: string;
  version: string;
  path: string;
  private: boolean;
}

/** Raw package data from pnpm list output */
interface PnpmPackage {
  name: string;
  version?: string;
  path: string;
  private: boolean;
}

const WORKSPACE_FILE = "pnpm-workspace.yaml";

function hasWorkspaceFile(dir: string): boolean {
  return existsSync(path.join(dir, WORKSPACE_FILE));
}

/** Search up from startDir for workspace root */
function findWorkspaceInAncestors(startDir: string): string | undefined {
  let dir = startDir;
  while (dir !== path.parse(dir).root) {
    if (hasWorkspaceFile(dir)) return dir;
    dir = path.dirname(dir);
  }
  return undefined;
}

/** Check immediate subdirectories for workspace root */
function findWorkspaceInSubdirs(startDir: string): string | undefined {
  try {
    const entries = readdirSync(startDir, { withFileTypes: true });
    const subdir = entries.find(
      e => e.isDirectory() && hasWorkspaceFile(path.join(startDir, e.name)),
    );
    return subdir ? path.join(startDir, subdir.name) : undefined;
  } catch {
    return undefined;
  }
}

/** Find pnpm workspace root by looking for pnpm-workspace.yaml */
export function findWorkspaceRoot(startDir: string): string {
  // Search ancestors first, then immediate subdirectories
  // No workspace file found - return startDir and let pnpm validation catch issues
  // (parseWorkspaceJson will fail fast if pnpm outputs multiple arrays)
  return (
    findWorkspaceInAncestors(startDir) ??
    findWorkspaceInSubdirs(startDir) ??
    startDir
  );
}

/** Get all workspace packages using pnpm */
export async function findWorkspacePackages(
  cwd: string = process.cwd(),
): Promise<Package[]> {
  const workspaceRoot = findWorkspaceRoot(cwd);
  const { stdout } = await exec(
    "pnpm list --json --recursive --only-projects",
    { cwd: workspaceRoot },
  );
  const packages = parseWorkspaceJson(stdout);
  return packages
    .filter(pkg => pkg.name)
    .map(pkg => ({
      name: pkg.name,
      version: pkg.version || "0.0.0",
      path: pkg.path,
      private: pkg.private,
    }));
}

/** Extract JSON arrays from pnpm output */
function extractJsonArrays(output: string): string[] {
  const matches = output.trim().matchAll(/\[[\s\S]*?\](?=\s*\[|$)/g);
  return [...matches].map(m => m[0]);
}

/** Parse output from 'pnpm list --json' */
function parseWorkspaceJson(stdout: string): PnpmPackage[] {
  const jsonArrays = extractJsonArrays(stdout);

  // Should always be a single JSON array when run from workspace root
  // Multiple arrays indicates pnpm ran from wrong directory
  if (jsonArrays.length === 0) {
    throw new Error("pnpm output is empty or invalid");
  }
  if (jsonArrays.length > 1) {
    throw new Error(
      `pnpm output contains ${jsonArrays.length} JSON arrays. ` +
        "This indicates pnpm was not run from the workspace root. " +
        "Ensure pnpm-workspace.yaml exists in your repository.",
    );
  }

  const jsonContent = jsonArrays[0];
  try {
    return JSON.parse(jsonContent);
  } catch (error) {
    console.error("Failed to parse pnpm output:", jsonContent.slice(0, 200));
    throw error;
  }
}
