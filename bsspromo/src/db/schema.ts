import {
  bigserial,
  boolean,
  date,
  index,
  inet,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Cerminan dari neon-schema.sql.
 *
 * Sumber kebenaran skema adalah neon-schema.sql (yang di-paste ke Neon SQL
 * Editor), bukan file ini. File ini ada supaya kueri di TypeScript ikut
 * diperiksa tipenya. Kalau mengubah kolom, ubah DUA-DUANYA.
 */

export const claimStatus = pgEnum('claim_status', [
  'DRAFT',
  'AWAITING_PAYMENT',
  'PAID',
  'EXPIRED',
  'CANCELLED',
  'FAILED',
  'REFUNDED',
]);

export const voucherStatus = pgEnum('voucher_status', ['ACTIVE', 'REDEEMED', 'EXPIRED', 'VOID']);

export const appSettings = pgTable('app_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid('updated_by'),
});

export const adminUsers = pgTable('admin_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  fullName: text('full_name').notNull(),
  role: text('role').notNull().default('ADMIN'),
  isActive: boolean('is_active').notNull().default(true),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const promoItems = pgTable(
  'promo_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    brand: text('brand').notNull(),
    model: text('model').notNull(),
    aliases: text('aliases').array().notNull().default([]),
    slug: text('slug').notNull().unique(),
    partType: text('part_type').notNull().default('LCD'),
    qualityGrade: text('quality_grade'),
    priceNormalIdr: integer('price_normal_idr').notNull(),
    pricePromoIdr: integer('price_promo_idr').notNull(),
    warrantyDays: smallint('warranty_days').notNull().default(7),
    stock: integer('stock'),
    isActive: boolean('is_active').notNull().default(true),
    imageUrl: text('image_url'),
    note: text('note'),
    sortOrder: integer('sort_order').notNull().default(0),
    // Diisi trigger di database — jangan ditulis dari aplikasi.
    searchText: text('search_text').notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('promo_items_live').on(t.isActive, t.sortOrder)],
);

export const customers = pgTable(
  'customers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    phoneE164: text('phone_e164').notNull().unique(),
    phoneHash: text('phone_hash').notNull(),
    fullName: text('full_name').notNull(),
    address: text('address'),
    origin: text('origin').notNull(),
    legacyRef: text('legacy_ref'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('customers_hash').on(t.phoneHash)],
);

export const legacyCustomerCache = pgTable('legacy_customer_cache', {
  phoneE164: text('phone_e164').primaryKey(),
  found: boolean('found').notNull(),
  fullName: text('full_name'),
  address: text('address'),
  legacyRef: text('legacy_ref'),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

export const claims = pgTable(
  'claims',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    claimNo: text('claim_no').notNull().unique(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id),
    promoItemId: uuid('promo_item_id')
      .notNull()
      .references(() => promoItems.id),

    brand: text('brand').notNull(),
    model: text('model').notNull(),
    partType: text('part_type').notNull(),
    qualityGrade: text('quality_grade'),
    priceNormalIdr: integer('price_normal_idr').notNull(),
    amountIdr: integer('amount_idr').notNull(),
    warrantyDays: smallint('warranty_days').notNull().default(7),
    nameSnapshot: text('name_snapshot').notNull(),
    phoneSnapshot: text('phone_snapshot').notNull(),
    addressSnapshot: text('address_snapshot'),
    nameSource: text('name_source').notNull(),

    status: claimStatus('status').notNull().default('DRAFT'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    ip: inet('ip'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('claims_customer').on(t.customerId, t.createdAt)],
);

export const claimCounters = pgTable('claim_counters', {
  day: date('day').primaryKey(),
  lastNo: integer('last_no').notNull().default(0),
});

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    claimId: uuid('claim_id')
      .notNull()
      .references(() => claims.id),
    orderId: text('order_id').notNull().unique(),
    attempt: smallint('attempt').notNull().default(1),
    grossAmountIdr: integer('gross_amount_idr').notNull(),
    snapToken: text('snap_token'),
    snapRedirectUrl: text('snap_redirect_url'),
    paymentType: text('payment_type'),
    bank: text('bank'),
    vaNumber: text('va_number'),
    store: text('store'),
    transactionId: text('transaction_id'),
    transactionStatus: text('transaction_status'),
    fraudStatus: text('fraud_status'),
    statusCode: text('status_code'),
    settlementAt: timestamp('settlement_at', { withTimezone: true }),
    expiryAt: timestamp('expiry_at', { withTimezone: true }),
    rawResponse: jsonb('raw_response'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('payments_claim').on(t.claimId),
    uniqueIndex('payments_attempt_uniq').on(t.claimId, t.attempt),
  ],
);

export const paymentEvents = pgTable('payment_events', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  orderId: text('order_id').notNull(),
  dedupeKey: text('dedupe_key').notNull().unique(),
  signatureOk: boolean('signature_ok').notNull(),
  payload: jsonb('payload').notNull(),
  processed: boolean('processed').notNull().default(false),
  error: text('error'),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
});

export const vouchers = pgTable('vouchers', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull().unique(),
  claimId: uuid('claim_id')
    .notNull()
    .unique()
    .references(() => claims.id),
  status: voucherStatus('status').notNull().default('ACTIVE'),
  qrJws: text('qr_jws').notNull(),
  imagePath: text('image_path'),
  validUntil: timestamp('valid_until', { withTimezone: true }).notNull(),
  redeemedAt: timestamp('redeemed_at', { withTimezone: true }),
  redeemedBy: uuid('redeemed_by'),
  redeemedByName: text('redeemed_by_name'),
  redeemDevice: text('redeem_device'),
  serviceTicketNo: text('service_ticket_no'),
  warrantyStartAt: timestamp('warranty_start_at', { withTimezone: true }),
  warrantyEndAt: timestamp('warranty_end_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const voucherReissues = pgTable('voucher_reissues', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  voucherId: uuid('voucher_id')
    .notNull()
    .references(() => vouchers.id),
  requestedPhone: text('requested_phone').notNull(),
  phoneMatch: boolean('phone_match').notNull(),
  channel: text('channel').notNull().default('CS_MANUAL'),
  approvedBy: uuid('approved_by'),
  approvedByName: text('approved_by_name').notNull(),
  linkTokenHash: text('link_token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  note: text('note'),
  ip: inet('ip'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const apiClients = pgTable('api_clients', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientKey: text('client_key').notNull().unique(),
  secretHash: text('secret_hash').notNull(),
  label: text('label').notNull(),
  scopes: text('scopes').array().notNull().default([]),
  isActive: boolean('is_active').notNull().default(true),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const apiNonces = pgTable('api_nonces', {
  nonce: text('nonce').primaryKey(),
  clientKey: text('client_key').notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }).notNull().defaultNow(),
});

export const auditLogs = pgTable('audit_logs', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  actorType: text('actor_type').notNull(),
  actorId: text('actor_id'),
  action: text('action').notNull(),
  entity: text('entity'),
  entityId: text('entity_id'),
  before: jsonb('before'),
  after: jsonb('after'),
  ip: inet('ip'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type PromoItem = typeof promoItems.$inferSelect;
export type Claim = typeof claims.$inferSelect;
export type Voucher = typeof vouchers.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type Customer = typeof customers.$inferSelect;
