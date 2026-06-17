// Fetch a single file's contents at a given ref via the GitHub API.
// Used by the App (and Action PR mode) so the bot needs no checkout — it works
// for every installed repo without cloning.
export async function getFileContent(
  octokit: any,
  owner: string,
  repo: string,
  filePath: string,
  ref: string,
): Promise<string | null> {
  try {
    const res = await octokit.rest.repos.getContent({ owner, repo, path: filePath, ref });
    const data = res.data;
    if (Array.isArray(data) || data.type !== "file" || typeof data.content !== "string") {
      return null;
    }
    return Buffer.from(data.content, "base64").toString("utf8");
  } catch (err) {
    console.error(`[content] could not fetch ${filePath}@${ref}: ${(err as Error).message}`);
    return null;
  }
}
