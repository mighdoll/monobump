import { afterEach, describe, expect, it } from "vitest";
import { bumpPackages } from "../src/Bump.ts";
import { getPackagesToBump } from "../src/Cascade.ts";
import { detectChangedPackages } from "../src/Detect.ts";
import { findWorkspacePackages } from "../src/Pnpm.ts";
import {
  createReleaseCommit,
  createTestMonorepo,
  readPackageJson,
  writeFileAndCommit,
} from "./TestHelpers.js";

describe("monobump cascade logic", () => {
  let cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    for (const cleanup of cleanups) {
      await cleanup();
    }
    cleanups = [];
  });

  it("should only bump changed packages", async () => {
    const repo = await createTestMonorepo([
      { name: "pkg-a", version: "1.0.0" },
      { name: "pkg-b", version: "1.0.0" },
    ]);
    cleanups.push(repo.cleanup);

    // Create initial release
    await createReleaseCommit(repo.root, "1.0.0");

    // Change pkg-a
    await writeFileAndCommit(
      repo.root,
      "packages/pkg-a/index.ts",
      "export const x = 1;",
      "Add index",
    );

    // Detect changes
    const packages = await findWorkspacePackages(repo.root);
    const { changed } = await detectChangedPackages(packages, repo.root);
    const { toBump } = await getPackagesToBump(packages, changed);

    expect(changed.has("pkg-a")).toBe(true);
    expect(changed.has("pkg-b")).toBe(false);
    expect(toBump.has("pkg-a")).toBe(true);
    expect(toBump.has("pkg-b")).toBe(false);
  });

  it("should cascade to dependent packages", async () => {
    const repo = await createTestMonorepo([
      { name: "pkg-base", version: "1.0.0" },
      {
        name: "pkg-dependent",
        version: "1.0.0",
        dependencies: { "pkg-base": "workspace:*" },
      },
    ]);
    cleanups.push(repo.cleanup);

    // Create initial release
    await createReleaseCommit(repo.root, "1.0.0");

    // Change pkg-base
    await writeFileAndCommit(
      repo.root,
      "packages/pkg-base/index.ts",
      "export const x = 1;",
      "Add index",
    );

    // Detect changes and cascade
    const packages = await findWorkspacePackages(repo.root);
    const { changed } = await detectChangedPackages(packages, repo.root);
    const { toBump, reasons } = await getPackagesToBump(packages, changed);

    expect(changed.has("pkg-base")).toBe(true);
    expect(toBump.has("pkg-base")).toBe(true);
    expect(toBump.has("pkg-dependent")).toBe(true);
    expect(reasons.get("pkg-base")).toBe("changed");
    expect(reasons.get("pkg-dependent")).toBe("depends on pkg-base");
  });

  it("should skip private packages", async () => {
    const repo = await createTestMonorepo([
      { name: "pkg-public", version: "1.0.0" },
      { name: "pkg-private", version: "1.0.0", private: true },
    ]);
    cleanups.push(repo.cleanup);

    // Create initial release
    await createReleaseCommit(repo.root, "1.0.0");

    // Change both packages
    await writeFileAndCommit(
      repo.root,
      "packages/pkg-public/index.ts",
      "export const x = 1;",
      "Add public",
    );
    await writeFileAndCommit(
      repo.root,
      "packages/pkg-private/index.ts",
      "export const y = 2;",
      "Add private",
    );

    // Detect and bump
    const packages = await findWorkspacePackages(repo.root);
    const { changed } = await detectChangedPackages(packages, repo.root);
    const { toBump } = await getPackagesToBump(packages, changed);

    expect(changed.has("pkg-public")).toBe(true);
    expect(changed.has("pkg-private")).toBe(true);
    expect(toBump.has("pkg-public")).toBe(true);
    expect(toBump.has("pkg-private")).toBe(false); // Private package excluded
  });

  it("should bump versions correctly", async () => {
    const repo = await createTestMonorepo([
      { name: "pkg-a", version: "1.0.0" },
    ]);
    cleanups.push(repo.cleanup);

    await createReleaseCommit(repo.root, "1.0.0");
    await writeFileAndCommit(
      repo.root,
      "packages/pkg-a/index.ts",
      "export const x = 1;",
      "Add index",
    );

    const packages = await findWorkspacePackages(repo.root);
    const { changed } = await detectChangedPackages(packages, repo.root);
    const { toBump, reasons } = await getPackagesToBump(packages, changed);

    // Bump patch version
    const results = await bumpPackages(
      packages,
      toBump,
      reasons,
      "patch",
      false,
    );

    expect(results[0].oldVersion).toBe("1.0.0");
    expect(results[0].newVersion).toBe("1.0.1");

    // Verify file was updated
    const pkgJson = await readPackageJson(repo.root, "pkg-a");
    expect(pkgJson.version).toBe("1.0.1");
  });

  it("should handle transitive dependencies", async () => {
    const repo = await createTestMonorepo([
      { name: "pkg-a", version: "1.0.0" },
      {
        name: "pkg-b",
        version: "1.0.0",
        dependencies: { "pkg-a": "workspace:*" },
      },
      {
        name: "pkg-c",
        version: "1.0.0",
        dependencies: { "pkg-b": "workspace:*" },
      },
    ]);
    cleanups.push(repo.cleanup);

    await createReleaseCommit(repo.root, "1.0.0");
    await writeFileAndCommit(
      repo.root,
      "packages/pkg-a/index.ts",
      "export const x = 1;",
      "Change pkg-a",
    );

    const packages = await findWorkspacePackages(repo.root);
    const { changed } = await detectChangedPackages(packages, repo.root);
    const { toBump, reasons } = await getPackagesToBump(packages, changed);

    // All three packages should be bumped
    expect(toBump.has("pkg-a")).toBe(true);
    expect(toBump.has("pkg-b")).toBe(true);
    expect(toBump.has("pkg-c")).toBe(true);
    expect(reasons.get("pkg-a")).toBe("changed");
    expect(reasons.get("pkg-b")).toBe("depends on pkg-a");
    expect(reasons.get("pkg-c")).toBe("depends on pkg-b -> pkg-a");
  });
});
