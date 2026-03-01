/**
 * Standalone chunking tests (no Jest) to avoid OOM when Jest/ts-jest loads the full project.
 * Run after build: node scripts/run-chunking-tests.cjs
 */
const { distPath } = require('../_shared/script-env.cjs');
const {
  chunkText,
  DEFAULT_CHUNK_SIZE,
  DEFAULT_CHUNK_OVERLAP,
  DEFAULT_CHUNK_THRESHOLD,
} = require(distPath('chunking.js'));

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

function assertEqual(a, b, msg) {
  if (a !== b) throw new Error(msg || `Expected ${a} === ${b}`);
}

let run = 0;
let passed = 0;

function test(name, fn) {
  run++;
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${e.message}`);
    process.exitCode = 1;
  }
}

console.log('Chunking tests (standalone)\n');

test('returns single chunk when content length <= threshold', () => {
  const short = 'a'.repeat(DEFAULT_CHUNK_THRESHOLD);
  const result = chunkText(short);
  assert(result.length === 1, 'length');
  assert(result[0].text === short && result[0].chunk_index === 0 && result[0].total_chunks === 1, 'content');
});

test('returns single chunk for empty string', () => {
  const result = chunkText('');
  assert(result.length === 1 && result[0].text === '' && result[0].chunk_index === 0 && result[0].total_chunks === 1);
});

test('splits content above threshold into multiple chunks with overlap', () => {
  const size = 500;
  const overlap = 50;
  const content = 'x'.repeat(1200);
  const result = chunkText(content, { chunkSize: size, overlap, threshold: 400 });
  assert(result.length > 1);
  const total = result.length;
  for (let i = 0; i < result.length; i++) {
    const chunk = result[i];
    assert(chunk.chunk_index === i);
    assert(chunk.total_chunks === total);
    assert(chunk.text.length <= size + overlap);
  }
});

test('uses default options when none provided', () => {
  const long = 'b'.repeat(DEFAULT_CHUNK_THRESHOLD + DEFAULT_CHUNK_SIZE + 500);
  const result = chunkText(long);
  assert(result.length > 1);
  assert(result[0].total_chunks === result.length);
});

test('respects custom threshold', () => {
  const content = 'c'.repeat(600);
  const result = chunkText(content, { threshold: 1000 });
  assert(result.length === 1);
  assert(result[0].text === content);
});

test('caps overlap to chunkSize - 1', () => {
  const content = 'd'.repeat(800);
  const result = chunkText(content, { chunkSize: 300, overlap: 400, threshold: 50 });
  assert(result.length > 1);
  result.forEach((c) => assert(c.text.length <= 300));
});

console.log(`\n${passed}/${run} passed`);
process.exit(process.exitCode || 0);
