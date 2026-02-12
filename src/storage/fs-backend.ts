// Filesystem storage backend.
//
// Stores files on the local filesystem using SHA-256 hash as filename.
// Content-addressed: the same file data always produces the same hash.
// Simple, zero-dependency, works without Docker.

import { createHash } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { StorageBackend } from './types.js';

export class FsBackend implements StorageBackend {
  private readonly dataDir: string;
  private initialized = false;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
  }

  async put(data: Buffer): Promise<string> {
    await this.ensureDir();
    const hash = createHash('sha256').update(data).digest('hex');
    const filePath = join(this.dataDir, hash);
    await writeFile(filePath, data);
    return hash;
  }

  async get(cid: string): Promise<Buffer | null> {
    // Sanitize: only allow hex characters (SHA-256 hash)
    if (!/^[a-f0-9]{64}$/.test(cid)) {
      return null;
    }

    const filePath = join(this.dataDir, cid);
    try {
      return await readFile(filePath);
    } catch {
      return null;
    }
  }

  async has(cid: string): Promise<boolean> {
    if (!/^[a-f0-9]{64}$/.test(cid)) {
      return false;
    }

    const filePath = join(this.dataDir, cid);
    try {
      await access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async healthy(): Promise<boolean> {
    try {
      await this.ensureDir();
      return true;
    } catch {
      return false;
    }
  }

  private async ensureDir(): Promise<void> {
    if (this.initialized) return;
    await mkdir(this.dataDir, { recursive: true });
    this.initialized = true;
  }
}
