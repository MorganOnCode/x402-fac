// Storage module barrel export and factory function.

import { FsBackend } from './fs-backend.js';
import { IpfsBackend } from './ipfs-backend.js';
import type { StorageBackend } from './types.js';

export type { StorageBackend } from './types.js';
export { FsBackend } from './fs-backend.js';
export { IpfsBackend } from './ipfs-backend.js';

export interface StorageConfig {
  backend: 'fs' | 'ipfs';
  fs?: { dataDir: string };
  ipfs?: { apiUrl: string };
}

/**
 * Create a storage backend based on configuration.
 * Defaults to FsBackend with './data/files' if no config is provided.
 */
export function createStorageBackend(config: StorageConfig): StorageBackend {
  switch (config.backend) {
    case 'ipfs':
      return new IpfsBackend(config.ipfs?.apiUrl);
    case 'fs':
    default:
      return new FsBackend(config.fs?.dataDir ?? './data/files');
  }
}
