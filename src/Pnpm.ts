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

/** Find pnpm workspace root by looking for pnpm-workspace.yaml */
export function findWorkspaceRoot(startDir: string): string {
  // Search current directory and up the tree
  let currentDir = startDir;
  while (currentDir !== path.parse(currentDir).root) {
    if (existsSync(path.join(currentDir, "pnpm-workspace.yaml"))) {
      return currentDir;
    }
    currentDir = path.dirname(currentDir);
  }

  // If not found going up, check one level down from startDir
  // (handles case where workspace is in subdirectory)
  try {
    const entries = readdirSync(startDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const subdirPath = path.join(startDir, entry.name);
        if (existsSync(path.join(subdirPath, "pnpm-workspace.yaml"))) {
          return subdirPath;
        }
      }
    }
  } catch {
    // Ignore errors reading directory
  }

  // No workspace file found - return startDir and let pnpm validation catch issues
  // (parseWorkspaceJson will fail fast if pnpm outputs multiple arrays)
  return startDir;
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

/** Parse output from 'pnpm list --json' */
function parseWorkspaceJson(stdout: string): PnpmPackage[] {
  const trimmed = stdout.trim();

  // Should always be a single JSON array when run from workspace root
  // Multiple arrays indicates pnpm ran from wrong directory
  const arrayMatches = [...trimmed.matchAll(/\[[\s\S]*?\](?=\s*\[|$)/g)];

  if (arrayMatches.length > 1) {
    throw new Error(
      `pnpm output contains ${arrayMatches.length} JSON arrays. ` +
        "This indicates pnpm was not run from the workspace root. " +
        "Ensure pnpm-workspace.yaml exists in your repository.",
    );
  }

  if (arrayMatches.length === 0) {
    throw new Error("pnpm output is empty or invalid");
  }

  try {
    return JSON.parse(arrayMatches[0][0]);
  } catch (error) {
    console.error(
      "Failed to parse pnpm output:",
      arrayMatches[0][0].slice(0, 200),
    );
    throw error;
  }
}
