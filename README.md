# monobump

Smart version bumping for pnpm monorepos.

**monobump** only bumps packages that have changed since the last release, plus any packages that depend on them. Private packages are never bumped.

## Features

- **Smart detection** - Only bumps packages with actual changes
- **Dependency cascading** - Automatically bumps dependent packages
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
# Bump patch version (default)
monobump

# Bump minor or major version
monobump --type minor
monobump --type major

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
5. **Cascades** to all packages that depend on changed packages
6. **Bumps versions** in package.json files
7. **Commits and tags** (optional) with conventional commit message

## Requirements

- Node.js >= 24.0.0 (for native TypeScript support)
- pnpm >= 9.0.0
- Git repository
- pnpm workspace (requires `pnpm-workspace.yaml` in your repository)

## CLI Options

| Option | Description | Default |
|--------|-------------|---------|
| `-t, --type <type>` | Bump type: major, minor, or patch | `patch` |
| `--dry-run` | Show what would change without writing | `false` |
| `--changelog` | Output changelog markdown | `false` |
| `--no-commit` | Don't create git commit | `false` |
| `--tag` | Create git tag | `true` |
| `--push` | Push commit and tags to remote | `false` |
| `-v, --verbose` | Show verbose output | `false` |
| `-h, --help` | Show help message | `false` |

## Example Workflow

```bash
# 1. Make changes to your packages
# 2. Preview what will be bumped
monobump --dry-run

# 3. Generate changelog
monobump --changelog > CHANGELOG-DRAFT.md

# 4. Bump versions, commit, and tag
monobump

# 5. Push to remote (after manual verification)
git push --follow-tags
# or do it all at once:
monobump --push
```

## License

MIT
