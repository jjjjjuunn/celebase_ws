import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type pg from 'pg';

const mockFindBySlug = jest.fn();
const mockList = jest.fn();

jest.unstable_mockModule('../../src/repositories/celebrity.repository.js', () => ({
  findBySlug: mockFindBySlug,
  list: mockList,
}));

const { getCelebrity, listCelebrities } = await import('../../src/services/celebrity.service.js');
const { NotFoundError } = await import('@celebbase/service-core');

const baseCelebrity = {
  id: 'celeb-1',
  slug: 'ariana-grande',
  display_name: 'Ariana Grande',
  short_bio: null,
  avatar_url: 'https://example.com/avatar.jpg',
  cover_image_url: null,
  category: 'diet' as const,
  tags: ['vegan'],
  is_featured: true,
  sort_order: 1,
  is_active: true,
  created_at: new Date(),
  updated_at: new Date(),
};

const mockPool = {} as pg.Pool;

describe('celebrityService.getCelebrity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns celebrity when slug exists', async () => {
    mockFindBySlug.mockResolvedValueOnce(baseCelebrity);
    const result = await getCelebrity(mockPool, 'ariana-grande');
    expect(result).toEqual(baseCelebrity);
    expect(mockFindBySlug).toHaveBeenCalledWith(mockPool, 'ariana-grande');
  });

  it('throws NotFoundError when slug does not exist', async () => {
    mockFindBySlug.mockResolvedValueOnce(null);
    await expect(getCelebrity(mockPool, 'unknown-celeb')).rejects.toThrow(NotFoundError);
  });
});

describe('celebrityService.listCelebrities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns list result from repository', async () => {
    const listResult = { items: [baseCelebrity], has_next: false, next_cursor: null };
    mockList.mockResolvedValueOnce(listResult);
    const result = await listCelebrities(mockPool, { category: 'diet' });
    expect(result).toEqual(listResult);
    expect(mockList).toHaveBeenCalledWith(mockPool, { category: 'diet' });
  });

  it('calculates has_next correctly when limit+1 rows returned', async () => {
    const listResult = { items: [baseCelebrity], has_next: true, next_cursor: 'celeb-1' };
    mockList.mockResolvedValueOnce(listResult);
    const result = await listCelebrities(mockPool, { limit: 1 });
    expect(result.has_next).toBe(true);
    expect(result.next_cursor).toBe('celeb-1');
  });

  it('passes featured filter to repository', async () => {
    const listResult = { items: [baseCelebrity], has_next: false, next_cursor: null };
    mockList.mockResolvedValueOnce(listResult);
    await listCelebrities(mockPool, { featured: true });
    expect(mockList).toHaveBeenCalledWith(mockPool, { featured: true });
  });
});
