export const runtime = "edge";

type PosDataPayload = {
  categories?: unknown[];
  products?: unknown[];
  sales?: unknown[];
  activeCategory?: string;
  updatedAt?: string;
};

const STORE_ID = "main-store";

async function ensureTable(db: D1Database) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS pos_store_data (
        store_id TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
    )
    .run();
}

function jsonResponse(body: unknown, init?: ResponseInit) {
  return Response.json(body, {
    ...init,
    headers: {
      "cache-control": "no-store",
      ...(init?.headers ?? {}),
    },
  });
}

async function getDb() {
  const { env } = await import("cloudflare:workers");
  if (!env.DB) {
    throw new Error("D1 database binding is not configured.");
  }
  return env.DB;
}

export async function GET() {
  const db = await getDb();
  await ensureTable(db);

  const row = await db
    .prepare("SELECT payload, updated_at AS updatedAt FROM pos_store_data WHERE store_id = ?")
    .bind(STORE_ID)
    .first<{ payload: string; updatedAt: string }>();

  if (!row) {
    return jsonResponse({ data: null, updatedAt: null });
  }

  return jsonResponse({
    data: JSON.parse(row.payload),
    updatedAt: row.updatedAt,
  });
}

export async function POST(request: Request) {
  const db = await getDb();
  await ensureTable(db);

  const body = (await request.json()) as { data?: PosDataPayload };
  const data = body.data;
  if (!data || !Array.isArray(data.categories) || !Array.isArray(data.products) || !Array.isArray(data.sales)) {
    return jsonResponse({ error: "Invalid POS data." }, { status: 400 });
  }

  const updatedAt = data.updatedAt ?? new Date().toISOString();
  const payload = JSON.stringify({ ...data, updatedAt });

  await db
    .prepare(
      `INSERT INTO pos_store_data (store_id, payload, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(store_id) DO UPDATE SET
         payload = excluded.payload,
         updated_at = excluded.updated_at`,
    )
    .bind(STORE_ID, payload, updatedAt)
    .run();

  return jsonResponse({ ok: true, updatedAt });
}
