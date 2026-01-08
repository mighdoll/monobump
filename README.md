# monobump

Smart version bumping for pnpm monorepos.

**monobump** only bumps packages that have changed since the last release. You can also specify packages explicitly for selective releases. Private packages are never bumped.

## Features

- **Smart detection** - Only bumps packages with actual changes (per-package tag tracking)
- **Selective bumping** - Specify packages explicitly for targeted releases
- **Safe dependencies** - In explicit mode, ensures dependencies are released first
- **Respects privacy** - Never bumps private packages
- **Changelog output** - Generate changelog markdown grouped by package
- **Git integration** - Commits, tags, and optionally pushes changes
- **Dry run mode** - Preview changes before applying them

## Installation

```bash
npm install -g monobump
# or
pnpm add -g monobump
```

## Usage

```bash
# Bump patch version (default) - auto-detects changed packages
monobump

# Bump specific packages only
monobump @myorg/pkg-a
monobump @myorg/pkg-a @myorg/pkg-b --minor

# Bump minor or major version
monobump --minor
monobump --major

# Preview changes without modifying anything
monobump --dry-run

# Generate changelog markdown
monobump --changelog

# Bump, commit, tag, and push
monobump --push

# Skip commit/tag
monobump --no-commit
```

## How it works

1. **Finds workspace root** by searching for `pnpm-workspace.yaml`
2. **Discovers packages** using `pnpm list --json --recursive --only-projects` from workspace root
3. **Detects changes** per-package by comparing files since each package's last release tag
4. **Bumps versions** in package.json files
5. **Commits and tags** (optional) with conventional commit message

### Two Modes

**Auto-detect mode** (`monobump`):
- Bumps only packages with file changes since their last tag
- No cascading - each package is independent
- Use for: Regular releases after selective releases are done

**Explicit mode** (`monobump pkg-a pkg-b`):
- Bumps specified packages + their dependencies that have unpublished changes
- Ensures you don't publish a package referencing unreleased dependency versions
- Use for: Selective releases (e.g., releasing one package to alpha)

## Requirements

- Node.js >= 24.0.0 (for native TypeScript support)
- pnpm >= 9.0.0
- Git repository
- pnpm workspace (requires `pnpm-workspace.yaml` in your repository)

## CLI Options

```
Usage: monobump [options] [packages...]
```

| Argument/Option | Description | Default |
|-----------------|-------------|---------|
| `[packages...]` | Package names to bump (if omitted, auto-detects) | - |
| `--patch` | Bump patch version | ✓ |
| `--minor` | Bump minor version | - |
| `--major` | Bump major version | - |
| `--alpha` | Start or increment alpha prerelease | - |
| `--beta` | Start or increment beta prerelease | - |
| `--rc` | Start or increment release candidate | - |
| `--dry-run` | Show what would change without writing | - |
| `--changelog` | Output changelog markdown | - |
| `--no-commit` | Don't create git commit | - |
| `--no-tag` | Don't create git tags | - |
| `--push` | Push commit and tags to remote | - |
| `-v, --verbose` | Show verbose output | - |
| `-h, --help` | Show help message | - |

## Example Workflows

### Full release

```bash
# Preview what will be bumped
monobump --dry-run

# Bump versions, commit, and tag
monobump

# Push to remote
git push --follow-tags
# or do it all at once:
monobump --push
```

### Selective release with mixed versions

```bash
# Release one package to alpha
monobump my-new-feature --alpha
git push --follow-tags

# Release another package to patch
monobump my-cli-tool
git push --follow-tags

# Later, release everything else
monobump
git push --follow-tags
```

## License

MIT
