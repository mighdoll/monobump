import fs from "node:fs/promises";
import path from "node:path";
import type { Package } from "./Pnpm.ts";

/** Package with resolved workspace dependencies */
export interface PackageWithDeps extends Package {
  dependencies: Set<string>;
}

/** Build dependency graph by reading package.json files */
export async function buildDependencyGraph(
  packages: Package[],
): Promise<Map<string, PackageWithDeps>> {
  const graph = new Map<string, PackageWithDeps>();

  for (const pkg of packages) {
    const dependencies = await getWorkspaceDeps(pkg.path);
    graph.set(pkg.name, { ...pkg, dependencies });
  }

  return graph;
}

const dependencySections = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
] as const;

async function getWorkspaceDeps(pkgPath: string): Promise<Set<string>> {
  const packageJsonPath = path.join(pkgPath, "package.json");
  const content = await fs.readFile(packageJsonPath, "utf-8");
  const packageJson = JSON.parse(content);

  const workspaceDeps = dependencySections.flatMap(section => {
    const deps = packageJson[section];
    if (!deps) return [];
    return Object.entries(deps)
      .filter(([, version]) => typeof version === "string" && version.startsWith("workspace:"))
      .map(([name]) => name);
  });

  return new Set(workspaceDeps);
}

/** Find all packages that depend on the given packages (recursively) */
export function findDependents(
  graph: Map<string, PackageWithDeps>,
  changedPackages: Set<string>,
): { allAffected: Set<string>; dependencyReasons: Map<string, string> } {
  const allAffected = new Set(changedPackages);
  const dependencyReasons = new Map<string, string>();
  let hasChanges = true;

  while (hasChanges) {
    hasChanges = false;

    for (const [pkgName, pkg] of graph.entries()) {
      if (allAffected.has(pkgName)) continue;

      const affectedDep = [...pkg.dependencies].find(dep => allAffected.has(dep));
      if (affectedDep) {
        allAffected.add(pkgName);
        dependencyReasons.set(pkgName, affectedDep);
        hasChanges = true;
      }
    }
  }

  return { allAffected, dependencyReasons };
}

/** Get packages to bump in explicit mode: specified packages + their dependencies that have changes */
export async function getPackagesWithChangedDeps(
  packages: Package[],
  specifiedPackages: Set<string>,
  changedPackages: Set<string>,
): Promise<{ toBump: Set<string>; reasons: Map<string, string> }> {
  const publicPackages = packages.filter(pkg => !pkg.private);
  const publicPackageNames = new Set(publicPackages.map(pkg => pkg.name));

  // Filter specified to public only
  const specifiedPublic = new Set(
    [...specifiedPackages].filter(name => publicPackageNames.has(name)),
  );

  const graph = await buildDependencyGraph(publicPackages);
  const toBump = new Set(specifiedPublic);
  const reasons = new Map<string, string>();

  // Mark specified packages as "specified"
  for (const pkgName of specifiedPublic) {
    reasons.set(pkgName, "specified");
  }

  // Recursively find all dependencies that have unpublished changes
  let hasChanges = true;
  while (hasChanges) {
    hasChanges = false;
    for (const pkgName of [...toBump]) {
      const pkg = graph.get(pkgName);
      if (!pkg) continue;

      for (const depName of pkg.dependencies) {
        if (changedPackages.has(depName) && !toBump.has(depName)) {
          toBump.add(depName);
          reasons.set(depName, `dependency of ${pkgName}`);
          hasChanges = true;
        }
      }
    }
  }

  return { toBump, reasons };
}

/** Get packages to bump: changed packages + their dependents, excluding private packages */
export async function getPackagesToBump(
  packages: Package[],
  changedPackages: Set<string>,
): Promise<{ toBump: Set<string>; reasons: Map<string, string> }> {
  const publicPackages = packages.filter(pkg => !pkg.private);
  const publicPackageNames = new Set(publicPackages.map(pkg => pkg.name));

  // Filter changed to public only
  const changedPublic = new Set(
    [...changedPackages].filter(name => publicPackageNames.has(name)),
  );

  // Build dependency graph and find all affected packages (cascade UP to dependents)
  const graph = await buildDependencyGraph(publicPackages);
  const { allAffected, dependencyReasons } = findDependents(graph, changedPublic);

  const reasons = buildReasonStrings(allAffected, changedPublic, dependencyReasons);
  return { toBump: allAffected, reasons };
}

function buildReasonStrings(
  affected: Set<string>,
  changed: Set<string>,
  depReasons: Map<string, string>,
): Map<string, string> {
  const reasons = new Map<string, string>();

  for (const pkgName of affected) {
    if (changed.has(pkgName)) {
      reasons.set(pkgName, "changed");
    } else {
      const chain = buildDependencyChain(pkgName, depReasons);
      reasons.set(pkgName, `depends on ${chain.join(" -> ")}`);
    }
  }

  return reasons;
}

function buildDependencyChain(
  pkgName: string,
  depReasons: Map<string, string>,
): string[] {
  const chain: string[] = [];
  let current = pkgName;
  while (depReasons.has(current)) {
    const dep = depReasons.get(current)!;
    chain.push(dep);
    current = dep;
  }
  return chain;
}
