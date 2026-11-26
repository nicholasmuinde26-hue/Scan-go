import { Pool, PoolClient } from 'pg';
import { ENV } from '../config/environment.js';

/**
 * PostgreSQL connection for the financial ledger.
 *
 * Lazily created and completely optional: when POSTGRES_URL is unset every
 * helper resolves to a no-op and MongoDB remains the single source of truth.
 * When set, the financial-ledger service mirrors orders/payments here for
 * relational integrity and reconciliation — Mongo is still authoritative
 * until the cut-over is proven.
 */

let pool: Pool | null = null;
let schemaReady: Promise<void> | null = null;

export function pgEnabled(): boolean {
  return !!ENV.POSTGRES_URL;
}

export function getPool(): Pool | null {
  if (!ENV.POSTGRES_URL) return null;
  if (!pool) {
    pool = new Pool({
      connectionString: ENV.POSTGRES_URL,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
    pool.on('error', (err) => {
      console.error('[Postgres] pool error:', err.message);
    });
  }
  return pool;
}

export async function pgQuery<T = any>(text: string, params: any[] = []): Promise<T[]> {
  const p = getPool();
  if (!p) return [];
  const res = await p.query(text, params);
  return res.rows as T[];
}

/** Idempotent schema bootstrap — safe to call on every write. */
export async function ensureFinancialSchema(): Promise<void> {
  if (!pgEnabled()) return;
  if (!schemaReady) {
    schemaReady = (async () => {
      await pgQuery(`
        CREATE TABLE IF NOT EXISTS orders_financial (
          order_id            TEXT PRIMARY KEY,
          order_number        TEXT NOT NULL,
          store_id            TEXT NOT NULL,
          organization_id     TEXT,
          customer_id         TEXT NOT NULL,
          order_type          TEXT NOT NULL,
          status              TEXT NOT NULL,
          total_minor         BIGINT NOT NULL,
          paid_minor          BIGINT NOT NULL DEFAULT 0,
          currency            TEXT NOT NULL DEFAULT 'KES',
          is_guest            BOOLEAN NOT NULL DEFAULT FALSE,
          created_at          TIMESTAMPTZ NOT NULL,
          paid_at             TIMESTAMPTZ,
          updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS idx_orders_financial_store ON orders_financial(store_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_orders_financial_status ON orders_financial(status);

        CREATE TABLE IF NOT EXISTS payments (
          payment_id          TEXT PRIMARY KEY,
          order_id            TEXT NOT NULL REFERENCES orders_financial(order_id),
          store_id            TEXT NOT NULL,
          customer_id         TEXT NOT NULL,
          method              TEXT NOT NULL,
          kind                TEXT NOT NULL DEFAULT 'FULL',
          status              TEXT NOT NULL,
          amount_minor        BIGINT NOT NULL,
          expected_amount_minor BIGINT NOT NULL,
          currency            TEXT NOT NULL DEFAULT 'KES',
          provider            TEXT,
          provider_ref        TEXT,
          checkout_request_id TEXT,
          verified_at         TIMESTAMPTZ,
          created_at          TIMESTAMPTZ NOT NULL,
          updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);
        CREATE INDEX IF NOT EXISTS idx_payments_store ON payments(store_id, created_at);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_provider_ref
          ON payments(provider, provider_ref) WHERE provider_ref IS NOT NULL;
      `);
    })().catch((err) => {
      schemaReady = null; // allow retry on next write
      throw err;
    });
  }
  await schemaReady;
}

export async function withClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T | null> {
  const p = getPool();
  if (!p) return null;
  const client = await p.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}
