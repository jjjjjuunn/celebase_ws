import type pg from 'pg';
import type { BaseDiet } from '@celebbase/shared-types';
import { NotFoundError } from '@celebbase/service-core';
import * as baseDietRepo from '../repositories/baseDiet.repository.js';
import * as celebrityRepo from '../repositories/celebrity.repository.js';

export async function getBaseDiet(pool: pg.Pool, id: string): Promise<BaseDiet> {
  const diet = await baseDietRepo.findById(pool, id);
  if (!diet) throw new NotFoundError('BaseDiet not found');
  return diet;
}

export async function listByCelebrity(pool: pg.Pool, slug: string): Promise<BaseDiet[]> {
  const celebrity = await celebrityRepo.findBySlug(pool, slug);
  if (!celebrity) throw new NotFoundError('Celebrity not found');
  return baseDietRepo.findByCelebrityId(pool, celebrity.id);
}
