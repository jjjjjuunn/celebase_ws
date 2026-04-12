import { createCipheriv, createDecipheriv, hkdf, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm' as const;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const VERSION_BYTE = 0x01;
const KEY_LENGTH = 32;

/**
 * Key provider interface for PHI encryption.
 * MVP: EnvPhiKeyProvider (HKDF from env var).
 * Production: KmsPhiKeyProvider (AWS KMS managed DEK).
 */
export interface PhiKeyProvider {
  getDek(userId: string): Promise<Buffer>;
}

/**
 * Derives per-user DEK from a single master key via HKDF.
 * Master key is loaded from PHI_ENCRYPTION_KEY env var (64 hex chars = 256 bits).
 */
export class EnvPhiKeyProvider implements PhiKeyProvider {
  private readonly masterKey: Buffer;

  constructor(masterKeyHex: string) {
    if (masterKeyHex.length !== 64 || !/^[0-9a-fA-F]+$/.test(masterKeyHex)) {
      throw new Error('PHI_ENCRYPTION_KEY must be exactly 64 hex characters (256 bits)');
    }
    this.masterKey = Buffer.from(masterKeyHex, 'hex');
  }

  async getDek(userId: string): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      hkdf('sha256', this.masterKey, userId, 'celebbase-phi-dek', KEY_LENGTH, (err, derivedKey) => {
        if (err) {
          reject(err);
        } else {
          resolve(Buffer.from(derivedKey));
        }
      });
    });
  }
}

/**
 * Encrypt plaintext to a base64-encoded envelope.
 * Envelope: [version(1)][iv(12)][authTag(16)][ciphertext(N)]
 */
export async function encryptField(
  keyProvider: PhiKeyProvider,
  userId: string,
  plaintext: string,
): Promise<string> {
  const dek = await keyProvider.getDek(userId);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, dek, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const envelope = Buffer.concat([
    Buffer.from([VERSION_BYTE]),
    iv,
    authTag,
    encrypted,
  ]);
  return envelope.toString('base64');
}

/**
 * Decrypt a base64-encoded envelope back to plaintext.
 */
export async function decryptField(
  keyProvider: PhiKeyProvider,
  userId: string,
  envelopeBase64: string,
): Promise<string> {
  const dek = await keyProvider.getDek(userId);
  const envelope = Buffer.from(envelopeBase64, 'base64');

  if (envelope.length < 1 + IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error('Invalid PHI encryption envelope: too short');
  }

  const version = envelope[0] as number;
  if (version !== VERSION_BYTE) {
    throw new Error(`Unsupported PHI encryption envelope version: ${String(version)}`);
  }

  const iv = envelope.subarray(1, 1 + IV_LENGTH);
  const authTag = envelope.subarray(1 + IV_LENGTH, 1 + IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = envelope.subarray(1 + IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, dek, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}

/** Encrypt a JSON-serializable value. */
export async function encryptJson(
  keyProvider: PhiKeyProvider,
  userId: string,
  value: unknown,
): Promise<string> {
  return encryptField(keyProvider, userId, JSON.stringify(value));
}

/** Decrypt and parse a JSON value. */
export async function decryptJson<T>(
  keyProvider: PhiKeyProvider,
  userId: string,
  envelopeBase64: string,
): Promise<T> {
  const plaintext = await decryptField(keyProvider, userId, envelopeBase64);
  return JSON.parse(plaintext) as T;
}
