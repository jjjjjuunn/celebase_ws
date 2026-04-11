import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type pg from 'pg';

const mockFindById = jest.fn();
const mockFindByCelebrityId = jest.fn();
const mockFindBySlug = jest.fn();

jest.unstable_mockModule('../../src/repositories/baseDiet.repository.js', () => ({
  findById: mockFindById,
  findByCelebrityId: mockFindByCelebrityId,
}));

jest.unstable_mockModule('../../src/repositories/celebrity.repository.js', () => ({
  findBySlug: mockFindBySlug,
  list: jest.fn(),
}));

const { getBaseDiet, listByCelebrity } = await import('../../src/services/baseDiet.service.js');
const { NotFoundError } = await import('@celebbase/service-core');

const baseCelebrity = {
  id: 'celeb-1',
  slug: 'ariana-grande',
  display_name: 'Ariana Grande',
  short_bio: null,
  avatar_url: 'https://example.com/avatar.jpg',
  cover_image_url: null,
  category: 'diet' as const,
  tags: [],
  is_featured: false,
  sort_order: 0,
  is_active: true,
  created_at: new Date(),
  updated_at: new Date(),
};

const baseDiet = {
  id: 'diet-1',
  celebrity_id: 'celeb-1',
  name: 'Plant-Based Reset',
  description: null,
  philosophy: null,
  diet_type: 'vegan' as const,
  avg_daily_kcal: 1800,
  macro_ratio: { protein_pct: 20, carbs_pct: 55, fat_pct: 25 },
  included_foods: [],
  excluded_foods: [],
  key_supplements: [],
  source_refs: [],
  verified_by: null,
  last_verified_at: new Date(),
  version: 1,
  is_active: true,
  created_at: new Date(),
  updated_at: new Date(),
};

const mockPool = {} as pg.Pool;

describe('baseDietService.getBaseDiet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns BaseDiet when id exists', async () => {
    mockFindById.mockResolvedValueOnce(baseDiet);
    const result = await getBaseDiet(mockPool, 'diet-1');
    expect(result).toEqual(baseDiet);
  });

  it('throws NotFoundError when id does not exist', async () => {
    mockFindById.mockResolvedValueOnce(null);
    await expect(getBaseDiet(mockPool, 'nonexistent')).rejects.toThrow(NotFoundError);
  });
});

describe('baseDietService.listByCelebrity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns BaseDiet list for valid celebrity slug', async () => {
    mockFindBySlug.mockResolvedValueOnce(baseCelebrity);
    mockFindByCelebrityId.mockResolvedValueOnce([baseDiet]);
    const result = await listByCelebrity(mockPool, 'ariana-grande');
    expect(result).toEqual([baseDiet]);
    expect(mockFindByCelebrityId).toHaveBeenCalledWith(mockPool, 'celeb-1');
  });

  it('throws NotFoundError when celebrity slug does not exist', async () => {
    mockFindBySlug.mockResolvedValueOnce(null);
    await expect(listByCelebrity(mockPool, 'unknown')).rejects.toThrow(NotFoundError);
  });
});
