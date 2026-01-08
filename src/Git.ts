import { exec as execCallback } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(execCallback);

/** Execute a git command in the specified directory */
async function git(command: string, cwd: string): Promise<string> {
  const { stdout } = await execAsync(`git ${command}`, { cwd });
  return stdout.trim();
}

/** Find the git root directory */
export async function findGitRoot(cwd: string = process.cwd()): Promise<string> {
  return git("rev-parse --show-toplevel", cwd);
}

/** Create a git commit */
export async function createCommit(
  message: string,
  cwd: string = process.cwd(),
): Promise<void> {
  await git("add .", cwd);
  await git(`commit -m "${message}"`, cwd);
}

/** Create a git tag */
export async function createTag(
  tag: string,
  cwd: string = process.cwd(),
): Promise<void> {
  await git(`tag "${tag}"`, cwd);
}

/** Push commits and tags to remote */
export async function push(
  includeTags = false,
  cwd: string = process.cwd(),
): Promise<void> {
  const tagsFlag = includeTags ? "--follow-tags" : "";
  await git(`push ${tagsFlag}`.trim(), cwd);
}
