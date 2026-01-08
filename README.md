# monobump

Smart version bumping for pnpm monorepos.

**monobump** only bumps packages that have changed since the last release, plus any packages that depend on them. You can also specify packages explicitly for more selective releases. Private packages are never bumped.

## Features

- **Smart detection** - Only bumps packages with actual changes
- **Selective bumping** - Specify packages explicitly for targeted releases
- **Dependency cascading** - Automatically handles dependencies in both modes
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
3. **Detects changes** by comparing files since the last "chore: release" commit
4. **Builds dependency graph** by reading `workspace:*` references in package.json files
5. **Cascades** dependencies based on mode (see below)
6. **Bumps versions** in package.json files
7. **Commits and tags** (optional) with conventional commit message

### Cascade Modes

**Auto-detect mode** (no packages specified):
- Cascades UP to dependents
- If `pkg-a` changed, also bump packages that depend on `pkg-a`
- Use for: CI/release workflows where you want all affected packages bumped

**Explicit mode** (packages specified):
- Cascades DOWN to dependencies
- If you specify `pkg-b`, also bump its dependencies that have unpublished changes
- Use for: Selective releases where you want precise control
- Ensures published packages reference valid dependency versions

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

### Full release (auto-detect)

```bash
# 1. Make changes to your packages
# 2. Preview what will be bumped
monobump --dry-run

# 3. Bump versions, commit, and tag
monobump

# 4. Push to remote
git push --follow-tags
# or do it all at once:
monobump --push
```

### Selective release

```bash
# Bump only specific packages (and their changed dependencies)
monobump my-cli-tool --dry-run
monobump my-cli-tool

# Release an alpha version of one package
monobump my-new-feature --alpha
```

## License

MIT
