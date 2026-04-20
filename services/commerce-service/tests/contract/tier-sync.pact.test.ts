import { PactV3, MatchersV3 } from '@pact-foundation/pact';
import path from 'path';
import { fileURLToPath } from 'url';

const { like } = MatchersV3;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const pact = new PactV3({
  consumer: 'commerce-service',
  provider: 'user-service',
  dir: path.join(__dirname, '../../pacts'),
  logLevel: 'error',
});

describe('commerce-service → user-service: POST /internal/users/:userId/tier', () => {
  it('syncs tier for a user (premium upgrade)', async () => {
    await pact
      .given('user user-fixture-uuid-0001 exists')
      .uponReceiving('a tier sync request for premium')
      .withRequest({
        method: 'POST',
        path: '/internal/users/user-fixture-uuid-0001/tier',
        headers: {
          'Content-Type': 'application/json',
        },
        body: {
          tier: 'premium',
        },
      })
      .willRespondWith({
        status: 200,
        headers: { 'Content-Type': like('application/json') },
        body: {
          userId: like('user-fixture-uuid-0001'),
          tier: like('premium'),
          updated: like(true),
        },
      })
      .executeTest(async (mockServer) => {
        const { createUserServiceClient } = await import(
          '../../src/services/user-service.client.js'
        );
        const client = createUserServiceClient({
          USER_SERVICE_URL: mockServer.url,
          INTERNAL_JWT_SECRET: 'test-internal-secret-exactly-32ch!!',
        });
        await client.syncTier('user-fixture-uuid-0001', 'premium', {
          idempotencyKey: 'user-fixture-uuid-0001:premium:sub_fixture_001',
        });
      });
  });
});
