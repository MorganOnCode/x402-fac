// FacilitatorClient -- HTTP wrapper for the x402 facilitator API.
//
// Resource servers use this to call /verify, /settle, /status, and /supported.
// Uses native fetch (Node 20+) with AbortController timeout and Zod validation.

import type { z } from 'zod';

import type { SupportedResponse } from './types.js';
import { SupportedResponseSchema } from './types.js';
import type {
  SettleRequest,
  SettleResponse,
  StatusRequest,
  StatusResponse,
} from '../settle/types.js';
import { SettleResponseSchema, StatusResponseSchema } from '../settle/types.js';
import type { VerifyRequest, VerifyResponse } from '../verify/types.js';
import { VerifyResponseSchema } from '../verify/types.js';

export interface FacilitatorClientOptions {
  /** Base URL of the facilitator (e.g. "http://localhost:3000") */
  baseUrl: string;
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Additional headers to send with every request */
  headers?: Record<string, string>;
}

export class FacilitatorClient {
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly headers: Record<string, string>;

  constructor(options: FacilitatorClientOptions) {
    // Strip trailing slash for consistent URL building
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.timeout = options.timeout ?? 30_000;
    this.headers = options.headers ?? {};
  }

  /**
   * Verify a payment against the facilitator.
   * POST /verify
   */
  async verify(request: VerifyRequest): Promise<VerifyResponse> {
    return this.post('/verify', request, VerifyResponseSchema);
  }

  /**
   * Settle a payment via the facilitator (submit tx on-chain).
   * POST /settle
   */
  async settle(request: SettleRequest): Promise<SettleResponse> {
    return this.post('/settle', request, SettleResponseSchema);
  }

  /**
   * Check transaction confirmation status.
   * POST /status
   */
  async status(request: StatusRequest): Promise<StatusResponse> {
    return this.post('/status', request, StatusResponseSchema);
  }

  /**
   * Get the facilitator's supported chains, schemes, and signer addresses.
   * GET /supported
   */
  async supported(): Promise<SupportedResponse> {
    return this.get('/supported', SupportedResponseSchema);
  }

  // ---- Private helpers ----

  private async post<T>(path: string, body: unknown, schema: z.ZodType<T>): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.headers,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Facilitator returned ${response.status} ${response.statusText}`);
      }

      const json: unknown = await response.json();
      const parsed = schema.safeParse(json);
      if (!parsed.success) {
        throw new Error(`Invalid facilitator response: ${parsed.error.message}`);
      }

      return parsed.data;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Facilitator request to ${path} timed out after ${this.timeout}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async get<T>(path: string, schema: z.ZodType<T>): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { ...this.headers },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Facilitator returned ${response.status} ${response.statusText}`);
      }

      const json: unknown = await response.json();
      const parsed = schema.safeParse(json);
      if (!parsed.success) {
        throw new Error(`Invalid facilitator response: ${parsed.error.message}`);
      }

      return parsed.data;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Facilitator request to ${path} timed out after ${this.timeout}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
