import { createHash } from 'node:crypto';
import { closeSync, openSync, readFileSync, readSync, statSync } from 'node:fs';
import { extname, isAbsolute, resolve } from 'node:path';
import { log } from './logger.ts';

export type MediaType = 'image' | 'video';

export interface PreparedMedia {
  normalizedPath: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  dataUrl: string | null;
}

export const IMAGE_EXT_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
};

export const VIDEO_EXT_MIME: Record<string, string> = {
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  avi: 'video/x-msvideo',
  wmv: 'video/x-ms-wmv',
  m4v: 'video/x-m4v',
  webm: 'video/webm',
};

export class MediaInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MediaInputError';
  }
}

function normalizePath(raw: string): string {
  let p = raw.trim();
  if ((p.startsWith('"') && p.endsWith('"')) || (p.startsWith("'") && p.endsWith("'"))) {
    p = p.slice(1, -1);
  }
  p = p.replaceAll('\\', '/');
  return isAbsolute(p) ? p : resolve(p);
}

function readMagic(p: string): Buffer {
  const fd = openSync(p, 'r');
  try {
    const buf = Buffer.alloc(16);
    const n = readSync(fd, buf, 0, 16, 0);
    return buf.subarray(0, n);
  } finally {
    closeSync(fd);
  }
}

function matchesMagic(ext: string, magic: Buffer): boolean {
  if (magic.length === 0) return false;
  switch (ext) {
    case 'png':
      return magic.length >= 4 && magic[0] === 0x89 && magic[1] === 0x50 && magic[2] === 0x4e && magic[3] === 0x47;
    case 'jpg':
    case 'jpeg':
      return magic.length >= 3 && magic[0] === 0xff && magic[1] === 0xd8 && magic[2] === 0xff;
    case 'gif':
      return magic.length >= 4 && magic.subarray(0, 4).toString('latin1') === 'GIF8';
    case 'bmp':
      return magic.length >= 2 && magic[0] === 0x42 && magic[1] === 0x4d;
    case 'webp':
      return magic.length >= 12 && magic.subarray(0, 4).toString('latin1') === 'RIFF' && magic.subarray(8, 12).toString('latin1') === 'WEBP';
    case 'mp4':
    case 'm4v':
    case 'mov':
      return magic.length >= 8 && magic.subarray(4, 8).toString('latin1') === 'ftyp';
    case 'avi':
      return magic.length >= 12 && magic.subarray(0, 4).toString('latin1') === 'RIFF' && magic.subarray(8, 12).toString('latin1') === 'AVI ';
    case 'wmv':
      return magic.length >= 16 && magic.subarray(0, 16).equals(Buffer.from([0x30, 0x26, 0xb2, 0x75, 0x8e, 0x66, 0xcf, 0x11, 0xa6, 0xd9, 0x00, 0xaa, 0x00, 0x62, 0xce, 0x6c]));
    case 'webm':
      return magic.length >= 4 && magic[0] === 0x1a && magic[1] === 0x45 && magic[2] === 0xdf && magic[3] === 0xa3;
    default:
      return false;
  }
}

export function prepareMediaInput(
  rawPath: string,
  type: MediaType,
  opts: { maxSizeMb?: number; includeDataUrl?: boolean } = {},
): PreparedMedia {
  const normalizedPath = normalizePath(rawPath);
  let stats;
  try {
    stats = statSync(normalizedPath);
  } catch {
    throw new MediaInputError(`${type === 'image' ? 'Image' : 'Video'} file not found: ${rawPath}`);
  }
  if (stats.isDirectory()) {
    throw new MediaInputError(`Path is a directory, not a ${type} file: ${rawPath}`);
  }
  if (stats.size === 0) {
    throw new MediaInputError(`File is empty: ${rawPath}`);
  }
  const maxSizeMb = opts.maxSizeMb ?? 100;
  if (stats.size > maxSizeMb * 1024 * 1024) {
    throw new MediaInputError(`File too large: ${(stats.size / (1024 * 1024)).toFixed(2)}MB. Maximum allowed: ${maxSizeMb}MB`);
  }
  const ext = extname(normalizedPath).toLowerCase().replace('.', '');
  const mimeMap = type === 'image' ? IMAGE_EXT_MIME : VIDEO_EXT_MIME;
  const mimeType = mimeMap[ext];
  if (!mimeType) {
    throw new MediaInputError(`Unsupported ${type} format: .${ext}`);
  }
  const magic = readMagic(normalizedPath);
  if (!matchesMagic(ext, magic)) {
    throw new MediaInputError(`File content does not match ${type} format: ${rawPath}`);
  }
  const bytes = readFileSync(normalizedPath);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const dataUrl = opts.includeDataUrl ? `data:${mimeType};base64,${bytes.toString('base64')}` : null;
  log('debug', 'media input prepared', { normalizedPath, mimeType, sizeBytes: stats.size, sha256 });
  return { normalizedPath, mimeType, sizeBytes: stats.size, sha256, dataUrl };
}