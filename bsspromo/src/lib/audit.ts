import { db } from '@/db';
import { auditLogs } from '@/db/schema';

/**
 * Catat jejak. Tidak pernah melempar galat — kegagalan mencatat audit
 * bukan alasan untuk menggagalkan transaksi pelanggan.
 */
export async function catat(entry: {
  actorType: 'ADMIN' | 'SYSTEM' | 'API_CLIENT' | 'PUBLIC';
  actorId?: string | null;
  action: string;
  entity?: string | null;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
}): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      actorType: entry.actorType,
      actorId: entry.actorId ?? null,
      action: entry.action,
      entity: entry.entity ?? null,
      entityId: entry.entityId ?? null,
      before: (entry.before ?? null) as never,
      after: (entry.after ?? null) as never,
      ip: entry.ip && entry.ip !== '0.0.0.0' ? entry.ip : null,
    });
  } catch {
    /* sengaja diam */
  }
}
