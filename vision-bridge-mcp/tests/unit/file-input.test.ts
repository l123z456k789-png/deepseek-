import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MediaInputError, prepareMediaInput } from '../../src/file-input.ts';

const png = fileURLToPath(new URL('../fixtures/media/sample-text.png', import.meta.url));
const mp4 = fileURLToPath(new URL('../fixtures/media/sample-video.mp4', import.meta.url));

test('valid png produces sha256 and optional data URL', () => {
  const m = prepareMediaInput(png, 'image');
  assert.equal(m.mimeType, 'image/png');
  assert.ok(m.sizeBytes > 0);
  assert.match(m.sha256, /^[0-9a-f]{64}$/);
  assert.equal(m.dataUrl, null);
  const withUrl = prepareMediaInput(png, 'image', { includeDataUrl: true });
  assert.match(withUrl.dataUrl ?? '', /^data:image\/png;base64,/);
});

test('valid video', () => {
  const m = prepareMediaInput(mp4, 'video');
  assert.equal(m.mimeType, 'video/mp4');
  assert.ok(m.sizeBytes > 0);
});

test('missing file rejected', () => {
  assert.throws(() => prepareMediaInput('C:\\no\\such\\file.png', 'image'), MediaInputError);
});

test('directory rejected', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vbm-'));
  try {
    assert.throws(() => prepareMediaInput(dir, 'image'), MediaInputError);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('empty file rejected', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vbm-'));
  const f = join(dir, 'empty.png');
  writeFileSync(f, '');
  try {
    assert.throws(() => prepareMediaInput(f, 'image'), /File is empty/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('unsupported extension rejected', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vbm-'));
  const f = join(dir, 'note.txt');
  writeFileSync(f, 'hello');
  try {
    assert.throws(() => prepareMediaInput(f, 'image'), /Unsupported image format/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('disguised file rejected (text renamed to png)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vbm-'));
  const f = join(dir, 'fake.png');
  writeFileSync(f, 'definitely not a png');
  try {
    assert.throws(() => prepareMediaInput(f, 'image'), /does not match/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('size cap enforced', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vbm-'));
  const f = join(dir, 'big.png');
  writeFileSync(f, Buffer.alloc(2048));
  try {
    assert.throws(() => prepareMediaInput(f, 'image', { maxSizeMb: 0.0001 }), /too large/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('relative path normalized to absolute', () => {
  const rel = relative(process.cwd(), png);
  const m = prepareMediaInput(rel, 'image');
  assert.equal(m.normalizedPath, resolve(rel));
});