import { jest, describe, it, expect, beforeAll } from '@jest/globals';

import type { PhiKeyProvider } from '../../src/crypto/phi-codec.js';

let EnvPhiKeyProvider: typeof import('../../src/crypto/phi-codec.js').EnvPhiKeyProvider;
let encryptField: typeof import('../../src/crypto/phi-codec.js').encryptField;
let decryptField: typeof import('../../src/crypto/phi-codec.js').decryptField;
let encryptJson: typeof import('../../src/crypto/phi-codec.js').encryptJson;
let decryptJson: typeof import('../../src/crypto/phi-codec.js').decryptJson;

// Valid 256-bit key (64 hex chars)
const TEST_KEY = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';

beforeAll(async () => {
  const mod = await import('../../src/crypto/phi-codec.js');
  EnvPhiKeyProvider = mod.EnvPhiKeyProvider;
  encryptField = mod.encryptField;
  decryptField = mod.decryptField;
  encryptJson = mod.encryptJson;
  decryptJson = mod.decryptJson;
});

describe('EnvPhiKeyProvider', () => {
  it('creates provider with valid 64-char hex key', () => {
    expect(() => new EnvPhiKeyProvider(TEST_KEY)).not.toThrow();
  });

  it('rejects key with wrong length', () => {
    expect(() => new EnvPhiKeyProvider('abcd')).toThrow('64 hex characters');
  });

  it('rejects non-hex key', () => {
    expect(() => new EnvPhiKeyProvider('z'.repeat(64))).toThrow('64 hex characters');
  });

  it('derives different DEKs for different userIds', async () => {
    const provider = new EnvPhiKeyProvider(TEST_KEY);
    const dek1 = await provider.getDek('user-1');
    const dek2 = await provider.getDek('user-2');
    expect(dek1.equals(dek2)).toBe(false);
  });

  it('derives same DEK for same userId (deterministic)', async () => {
    const provider = new EnvPhiKeyProvider(TEST_KEY);
    const dek1 = await provider.getDek('user-1');
    const dek2 = await provider.getDek('user-1');
    expect(dek1.equals(dek2)).toBe(true);
  });
});

describe('encryptField / decryptField', () => {
  let provider: PhiKeyProvider;

  beforeAll(() => {
    provider = new EnvPhiKeyProvider(TEST_KEY);
  });

  it('roundtrip: string', async () => {
    const plaintext = 'hello PHI data';
    const encrypted = await encryptField(provider, 'user-1', plaintext);
    const decrypted = await decryptField(provider, 'user-1', encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it('roundtrip: empty string', async () => {
    const encrypted = await encryptField(provider, 'user-1', '');
    const decrypted = await decryptField(provider, 'user-1', encrypted);
    expect(decrypted).toBe('');
  });

  it('roundtrip: unicode', async () => {
    const plaintext = '한국어 의료 데이터 🏥';
    const encrypted = await encryptField(provider, 'user-1', plaintext);
    const decrypted = await decryptField(provider, 'user-1', encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it('same plaintext encrypts differently each time (random IV)', async () => {
    const plaintext = 'determinism check';
    const enc1 = await encryptField(provider, 'user-1', plaintext);
    const enc2 = await encryptField(provider, 'user-1', plaintext);
    expect(enc1).not.toBe(enc2);
  });

  it('different userId produces different ciphertext', async () => {
    const plaintext = 'shared data';
    const enc1 = await encryptField(provider, 'user-1', plaintext);
    const enc2 = await encryptField(provider, 'user-2', plaintext);
    expect(enc1).not.toBe(enc2);
  });

  it('wrong userId cannot decrypt', async () => {
    const encrypted = await encryptField(provider, 'user-1', 'secret');
    await expect(decryptField(provider, 'user-2', encrypted)).rejects.toThrow();
  });

  it('tampered ciphertext throws', async () => {
    const encrypted = await encryptField(provider, 'user-1', 'data');
    const buf = Buffer.from(encrypted, 'base64');
    // Flip a byte in the ciphertext area
    const lastIdx = buf.length - 1;
    buf.writeUInt8(buf.readUInt8(lastIdx) ^ 0xff, lastIdx);
    const tampered = buf.toString('base64');
    await expect(decryptField(provider, 'user-1', tampered)).rejects.toThrow();
  });

  it('invalid envelope version throws', async () => {
    const encrypted = await encryptField(provider, 'user-1', 'data');
    const buf = Buffer.from(encrypted, 'base64');
    buf[0] = 0x02; // wrong version
    const modified = buf.toString('base64');
    await expect(decryptField(provider, 'user-1', modified)).rejects.toThrow('Unsupported PHI encryption envelope version');
  });

  it('truncated envelope throws', async () => {
    await expect(decryptField(provider, 'user-1', 'dG9vLXNob3J0')).rejects.toThrow('too short');
  });
});

describe('encryptJson / decryptJson', () => {
  let provider: PhiKeyProvider;

  beforeAll(() => {
    provider = new EnvPhiKeyProvider(TEST_KEY);
  });

  it('roundtrip: object', async () => {
    const obj = { fasting_glucose_mg_dl: 95, hba1c_pct: 5.4 };
    const encrypted = await encryptJson(provider, 'user-1', obj);
    const decrypted = await decryptJson(provider, 'user-1', encrypted);
    expect(decrypted).toEqual(obj);
  });

  it('roundtrip: string array', async () => {
    const arr = ['diabetes', 'hypertension'];
    const encrypted = await encryptJson(provider, 'user-1', arr);
    const decrypted = await decryptJson<string[]>(provider, 'user-1', encrypted);
    expect(decrypted).toEqual(arr);
  });

  it('roundtrip: empty array', async () => {
    const encrypted = await encryptJson(provider, 'user-1', []);
    const decrypted = await decryptJson<unknown[]>(provider, 'user-1', encrypted);
    expect(decrypted).toEqual([]);
  });

  it('roundtrip: empty object', async () => {
    const encrypted = await encryptJson(provider, 'user-1', {});
    const decrypted = await decryptJson<Record<string, unknown>>(provider, 'user-1', encrypted);
    expect(decrypted).toEqual({});
  });
});
