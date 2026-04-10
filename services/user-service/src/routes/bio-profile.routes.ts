import type { FastifyInstance, FastifyRequest } from 'fastify';
import type pg from 'pg';
import { z } from 'zod';
import {
  ValidationError,
  writePhiAuditLog,
} from '@celebbase/service-core';
import {
  ActivityLevel,
  BiomarkersSchema,
  DietType,
  PrimaryGoal,
  Sex,
  StressLevel,
} from '@celebbase/shared-types';
import * as bioProfileService from '../services/bio-profile.service.js';

const PHI_FIELDS_READ = ['biomarkers', 'medical_conditions', 'medications'];
const PHI_FIELDS_WRITE = ['biomarkers', 'medical_conditions', 'medications'];
const ACCESSED_BY = 'user-service';

const CreateBioProfileSchema = z.object({
  birth_year: z.number().int().min(1920).max(new Date().getFullYear() - 13),
  sex: Sex.optional(),
  height_cm: z.number().min(100).max(250),
  weight_kg: z.number().min(30).max(300),
  waist_cm: z.number().min(40).max(200).optional(),
  body_fat_pct: z.number().min(3).max(60).optional(),
  activity_level: ActivityLevel,
  sleep_hours_avg: z.number().min(2).max(16).optional(),
  stress_level: StressLevel.optional(),
  allergies: z.array(z.string().max(50)).max(20).optional(),
  intolerances: z.array(z.string().max(50)).max(20).optional(),
  medical_conditions: z.array(z.string()).optional(),
  medications: z.array(z.string()).optional(),
  biomarkers: BiomarkersSchema.optional(),
  primary_goal: PrimaryGoal,
  secondary_goals: z.array(z.string()).optional(),
  diet_type: DietType.optional(),
  cuisine_preferences: z.array(z.string()).optional(),
  disliked_ingredients: z.array(z.string()).optional(),
});

const UpdateBioProfileSchema = CreateBioProfileSchema.partial();

// eslint-disable-next-line @typescript-eslint/require-await
export async function bioProfileRoutes(
  app: FastifyInstance,
  options: { pool: pg.Pool },
): Promise<void> {
  const { pool } = options;

  app.post('/users/me/bio-profile', async (request: FastifyRequest) => {
    const parsed = CreateBioProfileSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid input', parsed.error.errors.map((e) => ({
        field: e.path.join('.'),
        issue: e.message,
      })));
    }
    return bioProfileService.createOrUpdateBioProfile(pool, request.userId, parsed.data);
  });

  app.get('/users/me/bio-profile', async (request: FastifyRequest) => {
    // PHI audit — fail-closed
    await writePhiAuditLog(pool, {
      userId: request.userId,
      accessedBy: ACCESSED_BY,
      action: 'READ',
      phiFields: PHI_FIELDS_READ,
      purpose: 'view_bio_profile',
      requestId: request.id,
      ipAddress: request.ip,
    });

    return bioProfileService.getBioProfile(pool, request.userId);
  });

  app.patch('/users/me/bio-profile', async (request: FastifyRequest) => {
    const parsed = UpdateBioProfileSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid input', parsed.error.errors.map((e) => ({
        field: e.path.join('.'),
        issue: e.message,
      })));
    }

    // PHI audit — fail-closed
    const phiFieldsChanged = PHI_FIELDS_WRITE.filter(
      (f) => f in parsed.data,
    );
    if (phiFieldsChanged.length > 0) {
      await writePhiAuditLog(pool, {
        userId: request.userId,
        accessedBy: ACCESSED_BY,
        action: 'WRITE',
        phiFields: phiFieldsChanged,
        purpose: 'update_bio_profile',
        requestId: request.id,
        ipAddress: request.ip,
      });
    }

    return bioProfileService.createOrUpdateBioProfile(pool, request.userId, parsed.data);
  });

  app.post('/users/me/bio-profile/recalculate', async (request: FastifyRequest) => {
    return bioProfileService.recalculate(pool, request.userId);
  });
}
