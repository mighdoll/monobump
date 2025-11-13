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

/** Creates a temporary monorepo for testing */
export async function createTestMonorepo(
  packages: TestPackage[],
): Promise<TestMonorepo> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "monobump-test-"));

  // Create pnpm-workspace.yaml
  await fs.writeFile(
    path.join(root, "pnpm-workspace.yaml"),
    'packages:\n  - "packages/*"\n',
  );

  // Create root package.json
  await fs.writeFile(
    path.join(root, "package.json"),
    JSON.stringify(
      {
        name: "test-root",
        private: true,
        version: "1.0.0",
      },
      null,
      2,
    ),
  );

  // Create packages
  const packagesDir = path.join(root, "packages");
  await fs.mkdir(packagesDir, { recursive: true });

  for (const pkg of packages) {
    const pkgDir = path.join(packagesDir, pkg.name);
    await fs.mkdir(pkgDir, { recursive: true });

    const packageJson = {
      name: pkg.name,
      version: pkg.version || "1.0.0",
      ...(pkg.private && { private: true }),
      ...(pkg.dependencies && { dependencies: pkg.dependencies }),
    };

    await fs.writeFile(
      path.join(pkgDir, "package.json"),
      JSON.stringify(packageJson, null, 2) + "\n",
    );

    // Write additional files if provided
    if (pkg.files) {
      for (const [filename, content] of Object.entries(pkg.files)) {
        await fs.writeFile(path.join(pkgDir, filename), content);
      }
    }
  }

  // Initialize pnpm workspace
  // This is crucial - pnpm needs to recognize the workspace
  await exec("pnpm install --ignore-workspace", { cwd: root }).catch(() => {
    // Ignore errors - workspace might not be fully set up yet
  });

  // Initialize git repo
  await exec("git init", { cwd: root });
  await exec('git config user.email "test@example.com"', { cwd: root });
  await exec('git config user.name "Test User"', { cwd: root });
  await exec("git add .", { cwd: root });
  await exec('git commit -m "Initial commit"', { cwd: root });

  return {
    root,
    packages,
    cleanup: async () => {
      await fs.rm(root, { recursive: true, force: true });
    },
  };
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
