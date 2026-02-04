import { writeFileSync, unlinkSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { loadConfig } from '@/config/index.js';

const TEST_CONFIG_DIR = join(process.cwd(), 'tests', 'fixtures');
const TEST_CONFIG_PATH = join(TEST_CONFIG_DIR, 'test-config.json');

describe('Config Loading', () => {
  beforeEach(() => {
    if (!existsSync(TEST_CONFIG_DIR)) {
      mkdirSync(TEST_CONFIG_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    if (existsSync(TEST_CONFIG_PATH)) {
      unlinkSync(TEST_CONFIG_PATH);
    }
  });

  it('should load valid config with defaults', () => {
    writeFileSync(TEST_CONFIG_PATH, JSON.stringify({}));
    const config = loadConfig(TEST_CONFIG_PATH);

    expect(config.server.host).toBe('0.0.0.0');
    expect(config.server.port).toBe(3000);
    expect(config.logging.level).toBe('info');
    expect(config.env).toBe('development');
  });

  it('should override defaults with provided values', () => {
    const customConfig = {
      server: { port: 8080 },
      logging: { level: 'debug' },
    };
    writeFileSync(TEST_CONFIG_PATH, JSON.stringify(customConfig));
    const config = loadConfig(TEST_CONFIG_PATH);

    expect(config.server.port).toBe(8080);
    expect(config.logging.level).toBe('debug');
  });

  it('should throw ConfigMissingError for non-existent file', () => {
    try {
      loadConfig('/nonexistent/path/config.json');
      expect.fail('Expected error to be thrown');
    } catch (error) {
      expect((error as { code: string }).code).toBe('CONFIG_MISSING');
    }
  });

  it('should throw ConfigParseError for invalid JSON', () => {
    writeFileSync(TEST_CONFIG_PATH, 'not valid json');
    try {
      loadConfig(TEST_CONFIG_PATH);
      expect.fail('Expected error to be thrown');
    } catch (error) {
      expect((error as { code: string }).code).toBe('CONFIG_PARSE_ERROR');
    }
  });

  it('should throw ConfigInvalidError for invalid schema', () => {
    const invalidConfig = {
      server: { port: 'not a number' },
    };
    writeFileSync(TEST_CONFIG_PATH, JSON.stringify(invalidConfig));
    try {
      loadConfig(TEST_CONFIG_PATH);
      expect.fail('Expected error to be thrown');
    } catch (error) {
      expect((error as { code: string }).code).toBe('CONFIG_INVALID');
    }
  });

  it('should validate port range', () => {
    const invalidPort = { server: { port: 70000 } };
    writeFileSync(TEST_CONFIG_PATH, JSON.stringify(invalidPort));
    try {
      loadConfig(TEST_CONFIG_PATH);
      expect.fail('Expected error to be thrown');
    } catch (error) {
      expect((error as { code: string }).code).toBe('CONFIG_INVALID');
    }
  });

  it('should validate logging level enum', () => {
    const invalidLevel = { logging: { level: 'verbose' } };
    writeFileSync(TEST_CONFIG_PATH, JSON.stringify(invalidLevel));
    try {
      loadConfig(TEST_CONFIG_PATH);
      expect.fail('Expected error to be thrown');
    } catch (error) {
      expect((error as { code: string }).code).toBe('CONFIG_INVALID');
    }
  });
});
