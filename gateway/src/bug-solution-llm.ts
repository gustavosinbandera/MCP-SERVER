/**
 * Generación de solución sugerida para un bug usando OpenAI Chat.
 * System prompt: experto en MCP, protocolos, DevOps y JavaScript/Node.
 */

import OpenAI from 'openai';
import type { CodeSnippet } from './bug-search-code';

const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL?.trim() || 'gpt-4o-mini';
const CHAT_TIMEOUT_MS = Number(process.env.OPENAI_CHAT_TIMEOUT_MS) || 60_000;

const SYSTEM_PROMPT = `Eres un experto en:
- MCP (Model Context Protocol): servidores MCP, herramientas, recursos y protocolo de comunicación (stdin/stdout, transporte, mensajes).
- Protocolos de comunicación: APIs, integraciones y flujos entre servicios.
- DevOps: despliegues, contenedores (Docker), pipelines, logs y resolución de fallos en producción.
- JavaScript/Node.js: ecosistema Node, TypeScript, Express, MCP SDK, async/await.

Tu tarea es analizar un bug reportado y el código relevante del proyecto, y redactar una **solución sugerida** en Markdown, sin modificar código tú mismo. Responde solo con el contenido Markdown (sin explicar que eres un asistente). Estructura la respuesta así:

## Resumen del problema
Una o dos frases.

## Causa probable
Qué puede estar causando el bug según el código y la descripción.

## Solución propuesta
Qué cambiar o añadir (archivos, funciones, pasos). Sé concreto: archivo, función o línea si aplica.

## Pasos para implementar
Lista numerada de pasos que el desarrollador puede seguir para arreglar el bug.`;

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
 * Genera el texto Markdown para la sección "Solución sugerida" a partir del bug y fragmentos de código.
 */
export async function generateSolutionMarkdown(
  bugTitle: string,
  bugDescription: string,
  codeSnippets: CodeSnippet[]
): Promise<string> {
  const client = getClient();
  if (!client) {
    throw new Error('OPENAI_API_KEY no está definido. Necesario para generar la solución.');
  }

  const codeBlock = codeSnippets.length
    ? codeSnippets
        .map(
          (s) =>
            `### ${s.path}\n\`\`\`\n${s.content.slice(0, 5000)}\n\`\`\``
        )
        .join('\n\n')
    : '(No se encontró código relevante; responde según la descripción del bug.)';

  const userContent = `## Bug
**Título:** ${bugTitle}

**Descripción:**
${bugDescription}

## Código relevante del proyecto
${codeBlock}

---
Redacta la solución sugerida en Markdown (Resumen, Causa probable, Solución propuesta, Pasos para implementar).`;

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
    if (!text) throw new Error('Respuesta vacía del modelo');
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
