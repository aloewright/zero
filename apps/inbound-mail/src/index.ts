type Env = {
  INBOUND_DB: D1Database;
  INBOUND_BUCKET: R2Bucket;
  ADMIN_TOKEN?: string;
  FORWARD_TO?: string;
};

type ForwardableEmailMessage = {
  from: string;
  to: string;
  headers: Headers;
  raw: ReadableStream;
  rawSize: number;
  forward: (rcptTo: string, headers?: Headers) => Promise<void>;
};

type InboundEmailRow = {
  id: string;
  received_at: number;
  envelope_from: string | null;
  envelope_to: string | null;
  subject: string | null;
  message_id: string | null;
  r2_key: string;
  raw_size: number;
};

let schemaReady = false;
async function ensureSchema(db: D1Database) {
  if (schemaReady) return;

  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS inbound_emails (
        id TEXT PRIMARY KEY,
        received_at INTEGER NOT NULL,
        envelope_from TEXT,
        envelope_to TEXT,
        subject TEXT,
        message_id TEXT,
        r2_key TEXT NOT NULL,
        raw_size INTEGER NOT NULL
      )`,
    )
    .run();

  await db
    .prepare(
      `CREATE INDEX IF NOT EXISTS inbound_emails_received_at_idx
       ON inbound_emails(received_at)`,
    )
    .run();

  schemaReady = true;
}

function json(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    ...init,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...(init.headers ?? {}),
    },
  });
}

function unauthorized() {
  return json({ error: 'unauthorized' }, { status: 401 });
}

function requireAdmin(req: Request, env: Env): boolean {
  const token = env.ADMIN_TOKEN;
  if (!token) return false;

  const auth = req.headers.get('authorization') || '';
  return auth === `Bearer ${token}`;
}

function toObjectKey(receivedAt: number, id: string) {
  const yyyyMmDd = new Date(receivedAt).toISOString().slice(0, 10);
  return `${yyyyMmDd}/${id}.eml`;
}

export default {
  async email(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      (async () => {
        await ensureSchema(env.INBOUND_DB);

        const id = crypto.randomUUID();
        const receivedAt = Date.now();

        const subject = message.headers?.get?.('subject') ?? null;
        const messageId = message.headers?.get?.('message-id') ?? null;

        const r2Key = toObjectKey(receivedAt, id);

        // Store raw RFC822 in R2.
        await env.INBOUND_BUCKET.put(r2Key, message.raw, {
          httpMetadata: { contentType: 'message/rfc822' },
          customMetadata: {
            id,
            receivedAt: String(receivedAt),
            from: String(message.from ?? ''),
            to: String(message.to ?? ''),
          },
        });

        // Store metadata in D1.
        await env.INBOUND_DB
          .prepare(
            `INSERT INTO inbound_emails (
              id,
              received_at,
              envelope_from,
              envelope_to,
              subject,
              message_id,
              r2_key,
              raw_size
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
          )
          .bind(
            id,
            receivedAt,
            message.from ?? null,
            message.to ?? null,
            subject,
            messageId,
            r2Key,
            message.rawSize ?? 0,
          )
          .run();

        // Optional: forward to a verified destination address.
        if (env.FORWARD_TO) {
          const extraHeaders = new Headers({ 'X-Zero-Inbound-Id': id });
          await message.forward(env.FORWARD_TO, extraHeaders);
        }
      })().catch((err) => {
        console.error('[inbound-mail] failed to store inbound email', err);
        // We intentionally do not call setReject() here to avoid bouncing mail on transient storage errors.
      }),
    );
  },

  async fetch(req: Request, env: Env) {
    const url = new URL(req.url);

    if (url.pathname === '/' && req.method === 'GET') {
      return new Response('zero-inbound-mail: ok\n', {
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }

    if (url.pathname === '/health' && req.method === 'GET') {
      return json({ ok: true });
    }

    if (url.pathname === '/api/inbound-emails' && req.method === 'GET') {
      if (!requireAdmin(req, env)) return unauthorized();
      await ensureSchema(env.INBOUND_DB);

      const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') ?? '50')));

      const { results } = await env.INBOUND_DB
        .prepare(
          `SELECT id, received_at, envelope_from, envelope_to, subject, message_id, r2_key, raw_size
           FROM inbound_emails
           ORDER BY received_at DESC
           LIMIT ?1`,
        )
        .bind(limit)
        .all<InboundEmailRow>();

      return json({ emails: results, limit });
    }

    const rawMatch = url.pathname.match(/^\/api\/inbound-emails\/([^/]+)\/raw$/);
    if (rawMatch && req.method === 'GET') {
      if (!requireAdmin(req, env)) return unauthorized();
      await ensureSchema(env.INBOUND_DB);

      const id = rawMatch[1]!;
      const row = await env.INBOUND_DB
        .prepare(
          `SELECT id, received_at, envelope_from, envelope_to, subject, message_id, r2_key, raw_size
           FROM inbound_emails
           WHERE id = ?1`,
        )
        .bind(id)
        .first<InboundEmailRow>();

      if (!row) return json({ error: 'not_found' }, { status: 404 });

      const obj = await env.INBOUND_BUCKET.get(row.r2_key);
      if (!obj) return json({ error: 'missing_r2_object' }, { status: 404 });

      return new Response(obj.body, {
        headers: {
          'content-type': 'message/rfc822',
          'content-length': String(obj.size),
          'x-inbound-email-id': row.id,
        },
      });
    }

    return new Response('Not Found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
