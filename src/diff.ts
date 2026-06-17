// Parse the set of *added* new-file line numbers from a unified diff patch.
// Inline PR review comments can only target lines that appear in the diff.
export function parseAddedLines(patch?: string): Set<number> {
  const added = new Set<number>();
  if (!patch) return added;

  let newLine = 0;
  for (const line of patch.split("\n")) {
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (hunk) {
      newLine = parseInt(hunk[1], 10);
      continue;
    }
    if (line.startsWith("\\")) continue; // "\ No newline at end of file"
    if (line.startsWith("+++") || line.startsWith("---")) continue; // file headers
    if (line.startsWith("+")) {
      added.add(newLine);
      newLine++;
    } else if (line.startsWith("-")) {
      // removed line — does not advance the new-file counter
    } else {
      newLine++; // context line
    }
  }
  return added;
}

export type ChangedFile = {
  filename: string; // repo-relative path
  addedLines: Set<number>;
};

// eslint-plugin-jsx-a11y only understands JSX/TSX.
const UI_FILE = /\.(jsx|tsx)$/;

export async function getChangedFiles(
  // octokit from @actions/github getOctokit(); kept loosely typed for MVP.
  octokit: any,
  owner: string,
  repo: string,
  pull_number: number,
): Promise<ChangedFile[]> {
  const files = await octokit.paginate(octokit.rest.pulls.listFiles, {
    owner,
    repo,
    pull_number,
    per_page: 100,
  });

  return files
    .filter((f: any) => f.status !== "removed" && UI_FILE.test(f.filename))
    .map((f: any) => ({
      filename: f.filename,
      addedLines: parseAddedLines(f.patch),
    }));
}
