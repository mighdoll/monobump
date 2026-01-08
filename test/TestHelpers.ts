import { exec as execCallback } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const exec = promisify(execCallback);

export interface TestPackage {
  name: string;
  version?: string;
  private?: boolean;
  dependencies?: Record<string, string>;
  files?: Record<string, string>; // filename -> content
}

export interface TestMonorepo {
  root: string;
  packages: TestPackage[];
  cleanup: () => Promise<void>;
}

interface CreateTestRepoOptions {
  packages: TestPackage[];
  /** If true, place single package at root instead of packages/ */
  atRoot?: boolean;
}

/** Initialize a git repo with standard test config */
async function initGitRepo(root: string): Promise<void> {
  await exec("git init", { cwd: root });
  await exec('git config user.email "test@example.com"', { cwd: root });
  await exec('git config user.name "Test User"', { cwd: root });
  await exec("git add .", { cwd: root });
  await exec('git commit -m "Initial commit"', { cwd: root });
}

/** Write a package.json file */
async function writePackageJson(dir: string, pkg: TestPackage): Promise<void> {
  await fs.writeFile(
    path.join(dir, "package.json"),
    JSON.stringify(
      {
        name: pkg.name,
        version: pkg.version || "1.0.0",
        ...(pkg.private && { private: true }),
        ...(pkg.dependencies && { dependencies: pkg.dependencies }),
      },
      null,
      2,
    ) + "\n",
  );

  if (pkg.files) {
    for (const [filename, content] of Object.entries(pkg.files)) {
      await fs.writeFile(path.join(dir, filename), content);
    }
  }
}

/** Creates a test repo - monorepo or single-package */
async function createTestRepo(options: CreateTestRepoOptions): Promise<TestMonorepo> {
  const { packages, atRoot = false } = options;
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "monobump-test-"));

  if (atRoot) {
    await fs.writeFile(path.join(root, "pnpm-workspace.yaml"), "packages:\n  - .\n");
    await writePackageJson(root, packages[0]);
  } else {
    await fs.writeFile(path.join(root, "pnpm-workspace.yaml"), 'packages:\n  - "packages/*"\n');
    await fs.writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ name: "test-root", private: true, version: "1.0.0" }, null, 2),
    );

    const packagesDir = path.join(root, "packages");
    await fs.mkdir(packagesDir, { recursive: true });

    for (const pkg of packages) {
      const pkgDir = path.join(packagesDir, pkg.name);
      await fs.mkdir(pkgDir, { recursive: true });
      await writePackageJson(pkgDir, pkg);
    }

    await exec("pnpm install --ignore-workspace", { cwd: root }).catch(() => {});
  }

  await initGitRepo(root);

  return {
    root,
    packages,
    cleanup: () => fs.rm(root, { recursive: true, force: true }),
  };
}

/** Creates a temporary monorepo for testing */
export function createTestMonorepo(packages: TestPackage[]): Promise<TestMonorepo> {
  return createTestRepo({ packages });
}

/** Creates a single-package repo (package at root) */
export function createTestSinglePackageRepo(pkg: TestPackage): Promise<TestMonorepo> {
  return createTestRepo({ packages: [pkg], atRoot: true });
}

/** Write content to a file in the test monorepo and commit it */
export async function writeFileAndCommit(
  root: string,
  relativePath: string,
  content: string,
  message = "Update file",
): Promise<void> {
  const filePath = path.join(root, relativePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content);
  await exec(`git add "${relativePath}"`, { cwd: root });
  await exec(`git commit -m "${message}"`, { cwd: root });
}

/** Create a release commit (bumps versions) */
export async function createReleaseCommit(
  root: string,
  version: string,
): Promise<void> {
  await exec("git add .", { cwd: root });
  await exec(`git commit -m "chore: release v${version}" --allow-empty`, {
    cwd: root,
  });
}

/** Read a package.json from the test monorepo */
export async function readPackageJson(
  root: string,
  packageName: string,
): Promise<any> {
  const pkgPath = path.join(root, "packages", packageName, "package.json");
  const content = await fs.readFile(pkgPath, "utf-8");
  return JSON.parse(content);
}
