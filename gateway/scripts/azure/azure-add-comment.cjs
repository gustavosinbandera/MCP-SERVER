/**
 * Adds a comment to the Discussion (System.History) of an Azure DevOps work item.
 * Uses the same Azure DevOps config as the MCP server "magaya" (gateway/.env).
 *
 * Config (already set for Magaya): AZURE_DEVOPS_BASE_URL, AZURE_DEVOPS_PROJECT, AZURE_DEVOPS_PAT
 * See gateway/.env.example (e.g. devops.magaya.com, Magaya Core Project).
 *
 * Use: from gateway/ → node scripts/azure-add-comment.cjs --work-item-id 124834 --text "Comment in English"
 * Or: node scripts/azure-add-comment.cjs --work-item-id 124834 --file scripts/comments/bug-124834-solution.md
 */
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), override: true });

const { addWorkItemCommentAsMarkdown, hasAzureDevOpsConfig } = require('../dist/azure-devops-client.js');

const workItemIdArg = process.argv.find((a, i) => process.argv[i - 1] === '--work-item-id');
const textArg = process.argv.find((a, i) => process.argv[i - 1] === '--text');
const fileArg = process.argv.find((a, i) => process.argv[i - 1] === '--file');

if (!workItemIdArg) {
  console.error('Uso: node scripts/azure-add-comment.cjs --work-item-id <id> (--text "<comment>" | --file <path>)');
  process.exit(1);
}

const workItemId = parseInt(workItemIdArg, 10);
if (!Number.isFinite(workItemId)) {
  console.error('work-item-id must be a number');
  process.exit(1);
}

let commentText = '';
if (textArg) {
  commentText = textArg;
} else if (fileArg) {
  const filePath = path.isAbsolute(fileArg) ? fileArg : path.join(process.cwd(), fileArg);
  if (!fs.existsSync(filePath)) {
    console.error('File not found:', filePath);
    process.exit(1);
  }
  commentText = fs.readFileSync(filePath, 'utf8');
} else {
  console.error('Provide --text "<comment>" or --file <path>');
  process.exit(1);
}

if (!commentText.trim()) {
  console.error('Comment text is empty');
  process.exit(1);
}

async function main() {
  if (!hasAzureDevOpsConfig()) {
    console.error('AZURE_DEVOPS_BASE_URL, AZURE_DEVOPS_PROJECT and AZURE_DEVOPS_PAT must be set in .env');
    process.exit(1);
  }
  await addWorkItemCommentAsMarkdown(workItemId, commentText);
  console.log('Comment added to work item #' + workItemId + ' (Discussion / System.History).');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
