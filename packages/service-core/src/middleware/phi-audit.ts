import type { FastifyRequest, FastifyReply } from 'fastify';
import type pg from 'pg';

import { AuditFailureError } from '../errors.js';

interface PhiAuditEntry {
  userId: string;
  accessedBy: string;
  action: 'READ' | 'WRITE' | 'DELETE';
  phiFields: string[];
  purpose: string;
  requestId?: string;
  ipAddress?: string;
}

/**
 * PHI 감사 로그를 기록한다.
 * 기록 실패 시 AuditFailureError를 throw하여 원래 요청을 차단 (fail-closed).
 */
export async function writePhiAuditLog(pool: pg.Pool, entry: PhiAuditEntry): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO phi_access_logs (user_id, accessed_by, action, phi_fields, purpose, request_id, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7::inet)`,
      [
        entry.userId,
        entry.accessedBy,
        entry.action,
        entry.phiFields,
        entry.purpose,
        entry.requestId,
        entry.ipAddress,
      ],
    );
  } catch {
    throw new AuditFailureError('Failed to write PHI audit log — request blocked (fail-closed)');
  }
}

/**
 * PHI 라우트에 적용할 preHandler hook 팩토리.
 * 해당 라우트의 요청 전에 감사 로그를 기록하고, 실패 시 503을 반환한다.
 */
export function createPhiAuditHook(
  pool: pg.Pool,
  accessedBy: string,
  action: 'READ' | 'WRITE' | 'DELETE',
  phiFields: string[],
  purpose: string,
) {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    const userId = (request as FastifyRequest & { userId?: string }).userId ?? 'unknown';

    await writePhiAuditLog(pool, {
      userId,
      accessedBy,
      action,
      phiFields,
      purpose,
      requestId: request.id,
      ipAddress: request.ip,
    });
  };
}
