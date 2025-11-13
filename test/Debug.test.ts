import { exec as execCallback } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { findWorkspacePackages } from "../src/Pnpm.ts";
import {
  createReleaseCommit,
  createTestMonorepo,
  writeFileAndCommit,
} from "./TestHelpers.js";

const exec = promisify(execCallback);

describe("debug pnpm integration", () => {
  it("should find packages in test monorepo", async () => {
    const repo = await createTestMonorepo([
      { name: "pkg-a", version: "1.0.0" },
      { name: "pkg-b", version: "1.0.0" },
    ]);

    try {
      const packages = await findWorkspacePackages(repo.root);

      expect(packages.length).toBeGreaterThan(0);
      expect(packages.some(p => p.name === "pkg-a")).toBe(true);
    } finally {
      await repo.cleanup();
    }
  });

  it("should detect git changes", async () => {
    const repo = await createTestMonorepo([
      { name: "pkg-a", version: "1.0.0" },
    ]);

    try {
      await createReleaseCommit(repo.root, "1.0.0");
      await writeFileAndCommit(
        repo.root,
        "packages/pkg-a/index.ts",
        "export const x = 1;",
        "Add file",
      );

      const { stdout: diffOut } = await exec(
        "git diff --name-only HEAD~1..HEAD",
        { cwd: repo.root },
      );

      expect(diffOut).toContain("packages/pkg-a/index.ts");
    } finally {
      await repo.cleanup();
    }
  });
});
