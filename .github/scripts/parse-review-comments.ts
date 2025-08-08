import * as path from 'path';
import * as fs from 'fs';

interface PositionMap {
  [file: string]: { [line: number]: number };
}

interface Comment {
  path: string;
  line: number;
  side: 'RIGHT';
  body: string;
}

interface ReviewPayload {
  body: string;
  event: 'REQUEST_CHANGES' | 'COMMENT';
  commit_id?: string;
  comments?: Comment[];
}

interface GithubPrFile {
  filename: string;
  patch?: string;
}

// Build a position map from a full unified diff produced by `git diff`.
// Note: GitHub counts positions from the start of each file's patch, including
// hunk header lines ("@@ ... @@"). We therefore increment position for every
// line within a file patch except the file header metadata lines.
function buildPositionMapFromUnifiedDiff(patchText: string): PositionMap {
  const files: PositionMap = {};
  let currentFile: string | null = null;
  let currentNewLine = 0;
  let position = 0;

  const lines = patchText.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('diff --git ')) {
      currentFile = null;
      currentNewLine = 0;
      position = 0;
      continue;
    }
    if (line.startsWith('+++ b/')) {
      currentFile = line.slice(6).trim();
      if (!files[currentFile]) files[currentFile] = {};
      currentNewLine = 0;
      position = 0;
      continue;
    }
    if (!currentFile) continue;

    if (line.startsWith('@@ ')) {
      position += 1;
      const m = line.match(/\+([0-9]+)(?:,([0-9]+))?/);
      currentNewLine = m ? parseInt(m[1], 10) : 0;
      continue;
    }

    if (line.startsWith(' ')) {
      position += 1;
      if (currentNewLine > 0) {
        files[currentFile][currentNewLine] = position;
        currentNewLine += 1;
      }
      continue;
    }

    if (line.startsWith('+')) {
      if (line.startsWith('+++ ')) continue;
      position += 1;
      if (currentNewLine > 0) {
        files[currentFile][currentNewLine] = position;
        currentNewLine += 1;
      }
      continue;
    }

    if (line.startsWith('-')) {
      if (line.startsWith('--- ')) continue;
      position += 1;
      continue;
    }

    if (line.startsWith('\\')) {
      position += 1;
      continue;
    }
  }
  return files;
}

function buildPositionMapFromGithubPatches(filesWithPatches: GithubPrFile[]): PositionMap {
  const files: PositionMap = {};

  for (const f of filesWithPatches) {
    if (!f.patch) continue;
    const filename = f.filename;
    let position = 0;
    let currentNewLine = 0;
    files[filename] = files[filename] || {};

    const lines = f.patch.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line.startsWith('@@ ')) {
        position += 1;
        const m = line.match(/\+([0-9]+)(?:,([0-9]+))?/);
        currentNewLine = m ? parseInt(m[1], 10) : 0;
        continue;
      }

      if (line.startsWith(' ')) {
        position += 1;
        if (currentNewLine > 0) {
          files[filename][currentNewLine] = position;
          currentNewLine += 1;
        }
        continue;
      }

      if (line.startsWith('+')) {
        position += 1;
        if (currentNewLine > 0) {
          files[filename][currentNewLine] = position;
          currentNewLine += 1;
        }
        continue;
      }

      if (line.startsWith('-')) {
        position += 1;
        continue;
      }

      if (line.startsWith('\\')) {
        position += 1;
        continue;
      }
    }
  }
  return files;
}

function normalizePath(filePath: string): string {
  let p = filePath.replace(/\\/g, '/').trim();
  if (p.startsWith('./')) p = p.slice(2);
  p = p.replace(/^(a|b)\//, '');
  return p;
}

function main() {
  try {
    let positionMap: PositionMap = {};
    const workspaceRoot = process.env.GITHUB_WORKSPACE
      ? process.env.GITHUB_WORKSPACE
      : path.resolve(process.cwd(), '..', '..');

    // Prefer GitHub's own patch format for changed files if available
    const prFilesPath = path.join(workspaceRoot, 'pr_files.json');
    if (fs.existsSync(prFilesPath)) {
      const raw = fs.readFileSync(prFilesPath, 'utf8');
      try {
        const prFiles: GithubPrFile[] = JSON.parse(raw);
        positionMap = buildPositionMapFromGithubPatches(prFiles);
      } catch {
        // Fallback to local diff if JSON parsing fails
        const patch = fs.readFileSync(path.join(workspaceRoot, 'actual_diff.patch'), 'utf8');
        positionMap = buildPositionMapFromUnifiedDiff(patch);
      }
    } else {
      const patch = fs.readFileSync(path.join(workspaceRoot, 'actual_diff.patch'), 'utf8');
      positionMap = buildPositionMapFromUnifiedDiff(patch);
    }

    const reviewContent = fs.readFileSync(path.join(workspaceRoot, 'ampcode_review.txt'), 'utf8');
    const lines = fs
      .readFileSync(path.join(workspaceRoot, 'line_comments.txt'), 'utf8')
      .split('\n')
      .filter(Boolean);

    const comments: Comment[] = [];
    let total = 0;
    let valid = 0;

    for (const raw of lines) {
      total += 1;
      const first = raw.indexOf(':');
      if (first === -1) continue;
      const second = raw.indexOf(':', first + 1);
      if (second === -1) continue;
      const file = raw.slice(0, first);
      const ln = parseInt(raw.slice(first + 1, second), 10);
      const text = raw.slice(second + 1).trim();
      if (!file || !Number.isFinite(ln) || !text) continue;
      const normalized = normalizePath(file);
      comments.push({ path: normalized, line: ln, side: 'RIGHT', body: `🤖 **Ampcode Review:** ${text}` });
      valid += 1;
    }

    console.log(`Total parsed comments: ${total}`);
    console.log(`Valid comments mapped to positions: ${valid}`);

    if (valid > 0) {
      const payload: ReviewPayload = {
        body: `## 🤖 Automated Code Review by Ampcode\n\nI've reviewed the changes and found ${valid} issue(s) that need attention. Please review the inline comments below.\n\n---\n*Generated by [Ampcode](https://ampcode.com) • [View Workflow](https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID})*`,
        event: 'REQUEST_CHANGES',
        commit_id: process.env.COMMIT_SHA,
        comments,
      };
      fs.writeFileSync(path.join(workspaceRoot, 'review_payload.json'), JSON.stringify(payload));
    } else {
      const fallback: ReviewPayload = {
        body: `## 🤖 Automated Code Review by Ampcode\n\n**Review Summary:**\n\n\`\`\`\n${reviewContent}\n\`\`\`\n\n---\n*Generated by [Ampcode](https://ampcode.com) • [View Workflow](https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID})*`,
        event: 'COMMENT',
      };
      fs.writeFileSync(
        path.join(workspaceRoot, 'review_comment_fallback.json'),
        JSON.stringify(fallback),
      );
    }
  } catch (error) {
    console.error('Error processing review comments:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
