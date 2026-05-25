import { jest, describe, it, expect } from '@jest/globals';
import type { S3Client } from '@aws-sdk/client-s3';
import type { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { createAvatarUploader } from '../../src/services/avatar.service.js';

const config = {
  bucket: 'celebbase-avatars-test',
  region: 'us-east-1',
  publicBaseUrl: 'https://avatars.example.com',
  maxBytes: 5_000_000,
  ttlSeconds: 300,
};

function makeUploader(signImpl?: typeof getSignedUrl) {
  const sign =
    signImpl ??
    (jest.fn<typeof getSignedUrl>().mockResolvedValue('https://s3.example.com/signed-put') as
      unknown as typeof getSignedUrl);
  const uploader = createAvatarUploader(config, { s3: {} as S3Client, sign });
  return { uploader, sign: sign as jest.Mock };
}

describe('avatar.service.createAvatarUploader', () => {
  it('builds a per-user, content-typed key and public URL', async () => {
    const { uploader } = makeUploader();
    const res = await uploader.presignUpload('user-123', 'image/png');

    expect(res.key).toMatch(/^avatars\/user-123\/[0-9a-f-]+\.png$/);
    expect(res.public_url).toBe(`https://avatars.example.com/${res.key}`);
    expect(res.upload_url).toBe('https://s3.example.com/signed-put');
    expect(res.expires_in).toBe(300);
    expect(res.max_bytes).toBe(5_000_000);
  });

  it('maps each allowed content type to the right extension', async () => {
    const { uploader } = makeUploader();
    const jpg = await uploader.presignUpload('u', 'image/jpeg');
    const png = await uploader.presignUpload('u', 'image/png');
    const webp = await uploader.presignUpload('u', 'image/webp');
    expect(jpg.key.endsWith('.jpg')).toBe(true);
    expect(png.key.endsWith('.png')).toBe(true);
    expect(webp.key.endsWith('.webp')).toBe(true);
  });

  it('signs with the configured TTL', async () => {
    const { uploader, sign } = makeUploader();
    await uploader.presignUpload('user-123', 'image/jpeg');
    expect(sign).toHaveBeenCalledTimes(1);
    const [, , opts] = sign.mock.calls[0] as [unknown, unknown, { expiresIn: number }];
    expect(opts.expiresIn).toBe(300);
  });

  it('normalizes a trailing slash on the public base URL', async () => {
    const sign = jest
      .fn<typeof getSignedUrl>()
      .mockResolvedValue('https://s3.example.com/p') as unknown as typeof getSignedUrl;
    const uploader = createAvatarUploader(
      { ...config, publicBaseUrl: 'https://avatars.example.com/' },
      { s3: {} as S3Client, sign },
    );
    const res = await uploader.presignUpload('u', 'image/png');
    expect(res.public_url).toBe(`https://avatars.example.com/${res.key}`);
    // No doubled slash between the base host and the key path.
    expect(res.public_url).not.toContain('.com//');
  });

  it('generates a unique key per call', async () => {
    const { uploader } = makeUploader();
    const a = await uploader.presignUpload('u', 'image/png');
    const b = await uploader.presignUpload('u', 'image/png');
    expect(a.key).not.toBe(b.key);
  });
});
