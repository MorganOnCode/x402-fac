// IPFS storage backend using Kubo HTTP API.
//
// Connects to a local IPFS node (Kubo) via its HTTP API (default port 5001).
// Uses native fetch -- no IPFS client library needed.

import type { StorageBackend } from './types.js';

export class IpfsBackend implements StorageBackend {
  private readonly apiUrl: string;

  constructor(apiUrl = 'http://localhost:5001') {
    // Strip trailing slash
    this.apiUrl = apiUrl.replace(/\/+$/, '');
  }

  async put(data: Buffer): Promise<string> {
    // Kubo API: POST /api/v0/add
    // Expects multipart/form-data with the file data
    const formData = new FormData();
    formData.append('file', new Blob([new Uint8Array(data)]));

    const response = await fetch(`${this.apiUrl}/api/v0/add`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`IPFS add failed: ${response.status} ${response.statusText}`);
    }

    const result = (await response.json()) as { Hash: string; Size: string };
    return result.Hash;
  }

  async get(cid: string): Promise<Buffer | null> {
    // Kubo API: POST /api/v0/cat?arg={cid}
    try {
      const response = await fetch(`${this.apiUrl}/api/v0/cat?arg=${encodeURIComponent(cid)}`, {
        method: 'POST',
      });

      if (!response.ok) {
        return null;
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch {
      return null;
    }
  }

  async has(cid: string): Promise<boolean> {
    // Kubo API: POST /api/v0/object/stat?arg={cid}
    try {
      const response = await fetch(
        `${this.apiUrl}/api/v0/object/stat?arg=${encodeURIComponent(cid)}`,
        { method: 'POST' }
      );
      return response.ok;
    } catch {
      return false;
    }
  }

  async healthy(): Promise<boolean> {
    // Kubo API: POST /api/v0/id
    try {
      const response = await fetch(`${this.apiUrl}/api/v0/id`, {
        method: 'POST',
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
