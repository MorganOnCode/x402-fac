import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { ConfigSchema, type Config } from './schema.js';
import { ConfigMissingError, ConfigParseError, ConfigInvalidError } from '../errors/index.js';

export type { Config } from './schema.js';

const DEFAULT_CONFIG_PATH = resolve(process.cwd(), 'config', 'config.json');

export function loadConfig(configPath: string = DEFAULT_CONFIG_PATH): Config {
  // Check file exists
  if (!existsSync(configPath)) {
    throw new ConfigMissingError(configPath);
  }

  // Read and parse JSON
  let rawConfig: unknown;
  try {
    const fileContent = readFileSync(configPath, 'utf-8');
    rawConfig = JSON.parse(fileContent);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown parse error';
    throw new ConfigParseError(message);
  }

  // Validate with Zod
  const result = ConfigSchema.safeParse(rawConfig);

  if (!result.success) {
    // Format Zod errors for readability (v4 uses .issues instead of .errors)
    const errors = result.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
    throw new ConfigInvalidError(errors);
  }

  return result.data;
}
