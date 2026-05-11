jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

import { fireEvent, render, screen } from '@testing-library/react-native';

import { ClaimDetailScreen } from '../../src/screens/ClaimDetailScreen';
import { __resetPendingRefresh } from '../../src/lib/fetch-with-refresh';

const CLAIM_BASE = {
  id: '01927000-0000-7000-8000-000000000001',
  celebrity_id: '018d1a6a-0000-7000-8000-000000000040',
  claim_type: 'food' as const,
  headline: 'celery juice ritual',
  body: 'morning routine since 2019',
  trust_grade: 'B' as const,
  primary_source_url: null,
  verified_by: null,
  last_verified_at: null,
  is_health_claim: false,
  disclaimer_key: null,
  base_diet_id: null,
  tags: [],
  status: 'published' as const,
  published_at: '2026-04-15T00:00:00.000Z',
  is_active: true,
  created_at: '2026-04-15T00:00:00.000Z',
  updated_at: '2026-04-15T00:00:00.000Z',
};

const SOURCE_BASE = {
  id: '01927000-0000-7000-8000-000000000099',
  claim_id: CLAIM_BASE.id,
  source_type: 'article' as const,
  outlet: 'Vogue',
  url: 'https://vogue.com/celery-article',
  published_date: '2024-03-15',
  excerpt: null,
  is_primary: true,
  created_at: '2026-04-15T00:00:00.000Z',
};

function makeResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('<ClaimDetailScreen />', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    __resetPendingRefresh();
    process.env['EXPO_PUBLIC_BFF_BASE_URL'] = 'http://localhost:3000';
    process.env['EXPO_PUBLIC_USER_SERVICE_URL'] = 'http://localhost:3001';
    fetchSpy = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('mount → getClaim 호출 후 headline / body / 출처 노출', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeResponse(200, { claim: CLAIM_BASE, sources: [SOURCE_BASE] }),
    );

    render(<ClaimDetailScreen claimId={CLAIM_BASE.id} onBack={jest.fn()} />);

    expect(await screen.findByText('celery juice ritual')).toBeTruthy();
    expect(screen.getByText('morning routine since 2019')).toBeTruthy();
    expect(screen.getByText('→ Vogue (2024)')).toBeTruthy();
  });

  it('disclaimer 조건: trust_grade D → 노출', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeResponse(200, {
        claim: { ...CLAIM_BASE, trust_grade: 'D' as const },
        sources: [],
      }),
    );

    render(<ClaimDetailScreen claimId={CLAIM_BASE.id} onBack={jest.fn()} />);
    await screen.findByText('celery juice ritual');

    expect(
      screen.getByText(/본 정보는 교육 목적으로 제공되며/),
    ).toBeTruthy();
  });

  it('disclaimer 조건: is_health_claim=true → 노출', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeResponse(200, {
        claim: { ...CLAIM_BASE, is_health_claim: true },
        sources: [],
      }),
    );

    render(<ClaimDetailScreen claimId={CLAIM_BASE.id} onBack={jest.fn()} />);
    await screen.findByText('celery juice ritual');

    expect(
      screen.getByText(/본 정보는 교육 목적으로 제공되며/),
    ).toBeTruthy();
  });

  it('trust_grade B + is_health_claim false → disclaimer 미노출', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeResponse(200, { claim: CLAIM_BASE, sources: [] }),
    );

    render(<ClaimDetailScreen claimId={CLAIM_BASE.id} onBack={jest.fn()} />);
    await screen.findByText('celery juice ritual');

    expect(screen.queryByText(/본 정보는 교육 목적으로 제공되며/)).toBeNull();
  });

  it('"이 셀럽처럼 먹어보기" 버튼: base_diet_id 있을 때만 노출 (회색 비활성)', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeResponse(200, {
        claim: { ...CLAIM_BASE, base_diet_id: '01927000-0000-7000-8000-aaaaaaaaaaaa' },
        sources: [],
      }),
    );

    render(<ClaimDetailScreen claimId={CLAIM_BASE.id} onBack={jest.fn()} />);
    await screen.findByText('celery juice ritual');

    expect(screen.getByText('이 셀럽처럼 먹어보기')).toBeTruthy();
    expect(screen.getByText('곧 제공됩니다')).toBeTruthy();
  });

  it('base_diet_id null → "이 셀럽처럼 먹어보기" 미노출', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeResponse(200, { claim: CLAIM_BASE, sources: [] }),
    );

    render(<ClaimDetailScreen claimId={CLAIM_BASE.id} onBack={jest.fn()} />);
    await screen.findByText('celery juice ritual');

    expect(screen.queryByText('이 셀럽처럼 먹어보기')).toBeNull();
  });

  it('source.url 이 allowlist 외 → "출처 링크 검증 실패" 표기 + Link role 미부착', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeResponse(200, {
        claim: CLAIM_BASE,
        sources: [{ ...SOURCE_BASE, url: 'https://malicious.com/x' }],
      }),
    );

    render(<ClaimDetailScreen claimId={CLAIM_BASE.id} onBack={jest.fn()} />);
    await screen.findByText('celery juice ritual');

    expect(screen.getByText('출처 링크 검증 실패')).toBeTruthy();
    // 외부 링크 열기 가능한 TouchableOpacity 없어야 한다.
    expect(screen.queryByLabelText('Vogue 외부 링크 열기')).toBeNull();
  });

  it('← 뒤로 버튼 → onBack 콜백', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeResponse(200, { claim: CLAIM_BASE, sources: [] }),
    );
    const onBack = jest.fn();

    render(<ClaimDetailScreen claimId={CLAIM_BASE.id} onBack={onBack} />);
    await screen.findByText('celery juice ritual');

    fireEvent.press(screen.getByLabelText('뒤로'));

    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
