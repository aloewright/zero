#!/usr/bin/env python3
"""
Parse Ampcode review output and create GitHub review comments.
This script replaces the bash parsing logic for more robust comment extraction.
"""

import json
import os
import re
import sys
from pathlib import Path
from typing import List, Dict, Any, Optional


def normalize_path(file_path: str) -> str:
    """Normalize file path by removing common prefixes."""
    path = file_path.replace('\\', '/').strip()
    if path.startswith('./'):
        path = path[2:]
    # Remove git diff prefixes
    path = re.sub(r'^[ab]/', '', path)
    return path


def extract_line_comments(review_content: str) -> List[Dict[str, Any]]:
    """
    Extract line-specific comments from Ampcode review output.
    Supports various formats:
    - file.ext:123: issue description
    - - file.ext:123: issue description  
    - 1. file.ext line 123: issue description
    - file.ext: line 123: issue description
    """
    comments = []
    lines = review_content.split('\n')
    
    # Multiple patterns to catch different comment formats
    patterns = [
        # Standard format: file.ext:123: description
        r'^(?:\s*[-*]?\s*\d*\.?\s*)?([^:\s]+\.[a-zA-Z0-9]+)\s*:\s*(\d+)\s*:\s*(.+)$',
        # With "line" keyword: file.ext line 123: description  
        r'^(?:\s*[-*]?\s*\d*\.?\s*)?([^:\s]+\.[a-zA-Z0-9]+)\s+line\s+(\d+)\s*:\s*(.+)$',
        # Alternative format: file.ext: line 123: description
        r'^(?:\s*[-*]?\s*\d*\.?\s*)?([^:\s]+\.[a-zA-Z0-9]+)\s*:\s*line\s+(\d+)\s*:\s*(.+)$',
        # Markdown format: **file.ext:123**: description
        r'^\*\*([^:\s]+\.[a-zA-Z0-9]+):(\d+)\*\*:\s*(.+)$',
    ]
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
            
        for pattern in patterns:
            match = re.match(pattern, line, re.IGNORECASE)
            if match:
                file_path, line_num, description = match.groups()
                try:
                    line_number = int(line_num)
                    normalized_path = normalize_path(file_path)
                    comments.append({
                        'path': normalized_path,
                        'line': line_number,
                        'side': 'RIGHT',
                        'body': f'🤖 **Ampcode Review:** {description.strip()}'
                    })
                    break
                except ValueError:
                    continue
    
    return comments


def get_line_position_in_diff(file_path: str, line_number: int, commit_sha: str) -> Optional[int]:
    """Get the position of a line in the diff for GitHub PR review comments."""
    import subprocess
    
    try:
        # First check if file exists
        if not os.path.exists(file_path):
            print(f"File not found: {file_path}")
            return None
            
        # Get the diff for the specific file against the base branch
        result = subprocess.run([
            'git', 'diff', 'origin/main', 'HEAD', '--', file_path
        ], capture_output=True, text=True, check=False)
        
        if result.returncode != 0 or not result.stdout.strip():
            print(f"No diff found for file: {file_path}")
            return None
        
        diff_lines = result.stdout.split('\n')
        position = 0
        current_new_line = 0
        in_hunk = False
        
        for diff_line in diff_lines:
            if diff_line.startswith('@@'):
                # Parse hunk header like @@ -10,7 +10,7 @@
                match = re.search(r'\+(\d+)', diff_line)
                if match:
                    current_new_line = int(match.group(1)) - 1
                    in_hunk = True
                position += 1
            elif in_hunk:
                if diff_line.startswith('+'):
                    # Added line
                    current_new_line += 1
                    position += 1
                    if current_new_line == line_number:
                        return position
                elif diff_line.startswith(' '):
                    # Context line
                    current_new_line += 1
                    position += 1
                    if current_new_line == line_number:
                        return position
                elif diff_line.startswith('-'):
                    # Deleted line - only increment position
                    position += 1
                elif diff_line.startswith('\\'):
                    # "\ No newline at end of file" - skip
                    continue
        
        print(f"Line {line_number} not found in diff for {file_path}")
        return None
    except Exception as e:
        print(f"Error getting diff position for {file_path}:{line_number}: {e}")
        return None


def create_review_payload(comments: List[Dict[str, Any]], commit_sha: Optional[str] = None) -> Dict[str, Any]:
    """Create GitHub review payload with inline comments."""
    repo = os.environ.get('GITHUB_REPOSITORY', '')
    run_id = os.environ.get('GITHUB_RUN_ID', '')
    
    if not comments:
        print("No comments to process")
        return {}
    
    if not commit_sha:
        print("No commit SHA provided, cannot create positioned comments")
        return {}
    
    # Filter comments to only include those we can map to diff positions
    valid_comments = []
    skipped_comments = []
    
    for comment in comments:
        print(f"Processing comment for {comment['path']}:{comment['line']}")
        position = get_line_position_in_diff(comment['path'], comment['line'], commit_sha)
        if position and position > 0:
            # Update comment with position instead of line
            valid_comment = {
                'path': comment['path'],
                'position': position,
                'body': comment['body']
            }
            valid_comments.append(valid_comment)
            print(f"✓ Mapped {comment['path']}:{comment['line']} to position {position}")
        else:
            skipped_comments.append(comment)
            print(f"✗ Could not map {comment['path']}:{comment['line']} to diff position")
    
    print(f"Valid comments: {len(valid_comments)}, Skipped: {len(skipped_comments)}")
    
    if valid_comments:
        # Validate all comments have required fields
        for comment in valid_comments:
            if not all(key in comment for key in ['path', 'position', 'body']):
                print(f"Invalid comment structure: {comment}")
                return {}
            if not comment['body'].strip():
                print(f"Empty comment body for {comment['path']}:{comment['position']}")
                return {}
        
        body = f"""## 🤖 Automated Code Review by Ampcode

I've reviewed the changes and found {len(valid_comments)} issue(s) that need attention. Please review the inline comments below.

---
*Generated by [Ampcode](https://ampcode.com) • [View Workflow](https://github.com/{repo}/actions/runs/{run_id})*"""
        
        payload = {
            'body': body,
            'event': 'COMMENT',  # Changed from REQUEST_CHANGES to COMMENT to be less aggressive
            'comments': valid_comments
        }
        
        # Only include commit_id if we have valid comments
        if commit_sha:
            payload['commit_id'] = commit_sha
        
        return payload
    
    print("No valid positioned comments found")
    return {}


def create_fallback_comments(review_content: str, chunk_size: int = 1000) -> List[Dict[str, Any]]:
    """Create chunked fallback comments when no line-specific comments are found."""
    repo = os.environ.get('GITHUB_REPOSITORY', '')
    run_id = os.environ.get('GITHUB_RUN_ID', '')
    
    # Split content into chunks
    chunks = []
    current_chunk = ""
    
    for line in review_content.split('\n'):
        if len(current_chunk) + len(line) > chunk_size and current_chunk:
            chunks.append(current_chunk.strip())
            current_chunk = line
        else:
            if current_chunk:
                current_chunk += '\n'
            current_chunk += line
    
    if current_chunk.strip():
        chunks.append(current_chunk.strip())
    
    # Create comment payloads
    comments = []
    for i, chunk in enumerate(chunks, 1):
        if len(chunks) > 1:
            title = f"## 🤖 Automated Code Review by Ampcode (Part {i}/{len(chunks)})"
        else:
            title = "## 🤖 Automated Code Review by Ampcode"
            
        body = f"""{title}

**Review Summary:**

```
{chunk}
```

### 🔍 Key Areas Reviewed
- Code quality and best practices
- Potential bugs and security issues
- Performance considerations
- Maintainability and readability

### 📝 Notes
- This is an automated review generated by Ampcode AI
- Please review the suggestions and apply them as appropriate
- For questions about specific recommendations, feel free to ask!

---
*Generated by [Ampcode](https://ampcode.com) • [View Workflow](https://github.com/{repo}/actions/runs/{run_id})*"""

        comments.append({
            'body': body,
            'event': 'COMMENT'
        })
    
    return comments


def main():
    """Main function to parse review and create appropriate comment payload."""
    try:
        # Get workspace root
        workspace_root = Path(os.environ.get('GITHUB_WORKSPACE', os.getcwd()))
        
        # Read review content
        review_file = workspace_root / 'ampcode_review.txt'
        if not review_file.exists():
            print("No review file found")
            return 0
            
        review_content = review_file.read_text(encoding='utf-8')
        if not review_content.strip():
            print("Review file is empty")
            return 0
        
        # Extract line-specific comments
        line_comments = extract_line_comments(review_content)
        
        print(f"Found {len(line_comments)} line-specific comments")
        
        if line_comments:
            # Create review with inline comments
            commit_sha = os.environ.get('COMMIT_SHA')
            payload = create_review_payload(line_comments, commit_sha)
            
            output_file = workspace_root / 'review_payload.json'
            output_file.write_text(json.dumps(payload, indent=2))
            print(f"Created review payload with {len(line_comments)} inline comments")
            
        else:
            # Create fallback chunked comments
            fallback_comments = create_fallback_comments(review_content)
            
            for i, comment in enumerate(fallback_comments, 1):
                output_file = workspace_root / f'review_comment_{i}.json'
                output_file.write_text(json.dumps(comment, indent=2))
            
            # Also create a marker file to indicate fallback mode
            total_file = workspace_root / 'total_chunks.txt'
            total_file.write_text(str(len(fallback_comments)))
            
            print(f"Created {len(fallback_comments)} fallback comment(s)")
        
        return 0
        
    except Exception as e:
        print(f"Error processing review comments: {e}", file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
