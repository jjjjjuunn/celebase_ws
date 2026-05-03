import type pg from 'pg';
import type { Celebrity } from '@celebbase/shared-types';
import { NotFoundError } from '@celebbase/service-core';
import * as repo from '../repositories/celebrity.repository.js';
import type { ListCelebritiesOptions, ListResult } from '../repositories/celebrity.repository.js';

export async function getCelebrity(pool: pg.Pool, slug: string): Promise<Celebrity> {
  const celebrity = await repo.findBySlug(pool, slug);
  if (!celebrity) throw new NotFoundError('Celebrity not found');
  return celebrity;
}

export async function getCelebrityById(pool: pg.Pool, id: string): Promise<Celebrity> {
  const celebrity = await repo.findById(pool, id);
  if (!celebrity) throw new NotFoundError('Celebrity not found');
  return celebrity;
}

export async function listCelebrities(
  pool: pg.Pool,
  opts: ListCelebritiesOptions,
): Promise<ListResult<Celebrity>> {
  return repo.list(pool, opts);
}
