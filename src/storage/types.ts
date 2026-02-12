// Abstract storage backend interface.
//
// Implementations provide content-addressed storage (put returns a CID/hash,
// get retrieves by CID/hash). The interface is intentionally minimal to
// support filesystem, IPFS, S3, or any other backend.

/**
 * Abstract storage backend for file persistence.
 * Implementations must be content-addressed: put() returns a unique identifier,
 * get() retrieves by that identifier.
 */
export interface StorageBackend {
  /** Store data and return a content identifier (hash or CID) */
  put(data: Buffer, metadata?: Record<string, string>): Promise<string>;

  /** Retrieve data by content identifier, or null if not found */
  get(cid: string): Promise<Buffer | null>;

  /** Check if content exists by identifier */
  has(cid: string): Promise<boolean>;

  /** Health check -- returns true if the backend is operational */
  healthy(): Promise<boolean>;
}
