/**
 * Suggested-solution generation for a bug using OpenAI Chat.
 * System prompt: expert in MCP, protocols, DevOps, and JavaScript/Node.
 */

import OpenAI from 'openai';
import type { CodeSnippet } from './bug-search-code';

const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL?.trim() || 'gpt-4o-mini';
const CHAT_TIMEOUT_MS = Number(process.env.OPENAI_CHAT_TIMEOUT_MS) || 60_000;

const SYSTEM_PROMPT = `You are an expert in:
- MCP (Model Context Protocol): MCP servers, tools, resources, and the communication protocol (stdin/stdout, transports, messages).
- Communication protocols: APIs, integrations, and flows between services.
- DevOps: deployments, containers (Docker), pipelines, logs, and production incident troubleshooting.
- JavaScript/Node.js: Node ecosystem, TypeScript, Express, MCP SDK, async/await.

Your task is to analyze a reported bug and the relevant project code, then write a **suggested solution** in Markdown, without modifying code yourself.
Respond only with Markdown content (do not mention you are an assistant). Use this structure:

## Problem summary
One or two sentences.

## Likely cause
What might be causing the bug based on the code and the description.

## Proposed fix
What to change or add (files, functions, steps). Be concrete: file, function, or line if applicable.

## Implementation steps
Numbered steps the developer can follow to fix the bug.`;

function getClient(): OpenAI | null {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return null;
  const baseURL = process.env.OPENAI_BASE_URL?.trim();
  return new OpenAI({
    apiKey: key,
    ...(baseURL ? { baseURL } : {}),
  });
}

/**
 * Generates the Markdown text for the "suggested solution" section from the bug + code snippets.
 */
export async function generateSolutionMarkdown(
  bugTitle: string,
  bugDescription: string,
  codeSnippets: CodeSnippet[]
): Promise<string> {
  const client = getClient();
  if (!client) {
    throw new Error('OPENAI_API_KEY is not set. Required to generate the solution.');
  }

  const codeBlock = codeSnippets.length
    ? codeSnippets
        .map(
          (s) =>
            `### ${s.path}\n\`\`\`\n${s.content.slice(0, 5000)}\n\`\`\``
        )
        .join('\n\n')
    : '(No relevant code was found; respond based on the bug description.)';

  const userContent = `## Bug
**Title:** ${bugTitle}

**Description:**
${bugDescription}

## Relevant project code
${codeBlock}

---
Write the suggested solution in Markdown (Problem summary, Likely cause, Proposed fix, Implementation steps).`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS);
  try {
    const res = await client.chat.completions.create(
      {
        model: CHAT_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userContent },
        ],
        max_tokens: 2000,
      },
      { signal: controller.signal }
    );
    clearTimeout(timeoutId);
    const text = res.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error('Empty model response');
    return text;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

export function hasOpenAIForBugs(): boolean {
  return !!process.env.OPENAI_API_KEY?.trim();
}

/** System prompt for analysis/solution in English only (dashboard is in English). */
const SYSTEM_PROMPT_ENGLISH = `You are an expert in MCP, protocols, DevOps, and JavaScript/Node.js.
Your task is to analyze a reported bug and relevant code, and write your response **in English only**.
Do not use Spanish or any other language. The dashboard and team use English.`;

/**
 * Generates a short "possible cause" analysis for the bug, in English only.
 * Used to populate the work item analysis field (e.g. Possible Cause).
 */
export async function generatePossibleCauseEnglish(
  bugTitle: string,
  bugDescription: string,
  codeSnippets: CodeSnippet[]
): Promise<string> {
  const client = getClient();
  if (!client) {
    throw new Error('OPENAI_API_KEY is not set. Required for analysis.');
  }

  const codeBlock = codeSnippets.length
    ? codeSnippets
        .map((s) => `### ${s.path}\n\`\`\`\n${s.content.slice(0, 5000)}\n\`\`\``)
        .join('\n\n')
    : '(No relevant code found; respond based on the bug description only.)';

  const userContent = `## Bug
**Title:** ${bugTitle}

**Description:**
${bugDescription}

## Relevant code
${codeBlock}

---
Write a concise **possible cause** of the bug in English only (one or two short paragraphs or bullet points). Do not include solution steps. Output only the analysis text, no headings.`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS);
  try {
    const res = await client.chat.completions.create(
      {
        model: CHAT_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT_ENGLISH },
          { role: 'user', content: userContent },
        ],
        max_tokens: 800,
      },
      { signal: controller.signal }
    );
    clearTimeout(timeoutId);
    const text = res.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error('Empty response from model');
    return text;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

/**
 * Generates the solution/fix description in Markdown, in English only.
 * Used to populate the work item solution field (e.g. Resolution, Solution Description).
 */
export async function generateSolutionDescriptionEnglish(
  bugTitle: string,
  bugDescription: string,
  codeSnippets: CodeSnippet[]
): Promise<string> {
  const client = getClient();
  if (!client) {
    throw new Error('OPENAI_API_KEY is not set. Required for solution description.');
  }

  const codeBlock = codeSnippets.length
    ? codeSnippets
        .map((s) => `### ${s.path}\n\`\`\`\n${s.content.slice(0, 5000)}\n\`\`\``)
        .join('\n\n')
    : '(No relevant code found; respond based on the bug description only.)';

  const userContent = `## Bug
**Title:** ${bugTitle}

**Description:**
${bugDescription}

## Relevant code
${codeBlock}

---
Write a **solution/fix description** in Markdown, **in English only**. Structure:
- ## Summary (one or two sentences)
- ## Root cause (what was causing the bug)
- ## Solution / Fix (what was changed or implemented)
- ## Steps (numbered list for verification if applicable)

Output only the Markdown content. Do not use Spanish or any other language.`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS);
  try {
    const res = await client.chat.completions.create(
      {
        model: CHAT_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT_ENGLISH },
          { role: 'user', content: userContent },
        ],
        max_tokens: 2000,
      },
      { signal: controller.signal }
    );
    clearTimeout(timeoutId);
    const text = res.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error('Empty response from model');
    return text;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}
