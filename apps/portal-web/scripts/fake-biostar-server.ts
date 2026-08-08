/**
 * fake-biostar-server.ts
 *
 * DEV-ONLY QA TOOLING. Not imported by any app code under `src/`, not run in
 * production. Stands in for the real BioStar (Suprema) device-network API so
 * a human (or the gstack `/qa` skill) can drive `dashboard.tsx` and
 * `TurnstileDashboard.tsx` end-to-end against a real local backend + real
 * local Postgres, without real BioStar hardware and without a real
 * WebSocket connection to real BioStar.
 *
 * It fakes exactly the three things the frontend actually calls, verified
 * against the current source of each:
 *
 *   1. `POST /api/login`   — mimics what `apps/portal-web/src/app/api/login/route.ts`
 *      proxies to `${NEXT_PUBLIC_BIOSTAR_API}/api/login`. That route reads the
 *      session id from the RESPONSE HEADER `bs-session-id` (not the body) and
 *      returns `{ data, bsSessionId }` to the browser. `dashboard.tsx` /
 *      `TurnstileDashboard.tsx` then read `response.data.bsSessionId`.
 *      -> This server sets a `bs-session-id` response header on that route.
 *
 *   2. `GET /api/users/:id` — mimics what `apps/portal-web/src/app/api/users/route.ts`
 *      proxies to `${NEXT_PUBLIC_BIOSTAR_API}/api/users/${params}`. That route
 *      wraps the upstream body as `{ data: <upstream body> }`. The frontend's
 *      `fetchUserData` then reads `response.data.data.User.{user_id, name,
 *      photo, photo_exist, user_custom_fields, disabled, expiry_datetime}`
 *      (re-checked against the current, already-fixed dashboard.tsx).
 *      -> This server's upstream body is `{ User: { ...those fields } }`.
 *
 *   3. `GET /wsapi` (WebSocket) — matches
 *      `BIOSTAR2_WS_URI = \`${NEXT_PUBLIC_WS_HOST}/wsapi\`` in both dashboard
 *      files. On `ws.onopen` the frontend sends the plain-text message
 *      `bs-session-id=<value>`; this server accepts and ignores its content
 *      (any session id is treated as valid) and keeps the socket open.
 *      Scripted events are pushed to every connected client as
 *      `{ Event: { user_id, device_id, datetime, tna_key, event_type_id: { name } } }`
 *      JSON text frames — exactly what `ws.onmessage` in both dashboard files
 *      destructures.
 *
 * ----------------------------------------------------------------------
 * HOW TO RUN
 * ----------------------------------------------------------------------
 *   bun apps/portal-web/scripts/fake-biostar-server.ts
 *
 * Then point the frontend at it (e.g. in your local `.env`, plain HTTP/WS —
 * this fake server does not terminate TLS):
 *   NEXT_PUBLIC_BIOSTAR_API=http://127.0.0.1:4433
 *   NEXT_PUBLIC_WS_HOST=ws://127.0.0.1:4433
 *   NEXT_PUBLIC_BIOSTAR_LOGIN_ID=qa-fake-login
 *   NEXT_PUBLIC_BIOSTAR_PASSWORD=qa-fake-password
 * (Credentials are not checked — this server accepts any login body.)
 *
 * ----------------------------------------------------------------------
 * ENV VARS
 * ----------------------------------------------------------------------
 *   FAKE_BIOSTAR_PORT   Port to listen on for both HTTP and WebSocket
 *                        (default 4433, matching the repo's default
 *                        NEXT_PUBLIC_BIOSTAR_API port).
 *   NODE_ENV             Refuses to start when this is "production".
 *
 * ----------------------------------------------------------------------
 * CONTROL MECHANISM — firing scripted gate-scan events
 * ----------------------------------------------------------------------
 * A local control endpoint, `POST /fire-event`, tells this server to push
 * one or more fake gate-scan events to every connected WebSocket client
 * (i.e. every open dashboard/TurnstileDashboard browser tab). This was
 * chosen over a fixture-file-plus-delay approach because it lets a human
 * running the `/qa` browser pass trigger events on demand, mid-session,
 * from a second terminal — no server restart, no waiting on a fixed
 * schedule.
 *
 * Body shape — a single event:
 *   {
 *     "user_id": "10008",
 *     "device_id": "538203430",
 *     "tna_key": "1",
 *     "event_type_name": "AUTHENTICATION_SUCCESS",
 *     "datetime": "2026-08-08T12:00:00.000Z"   // optional, defaults to now
 *   }
 *
 * Body shape — a sequence (fired in order, `intervalMs` apart):
 *   {
 *     "events": [ { ... }, { ... } ],
 *     "intervalMs": 150                         // optional, default 100
 *   }
 *
 * Each event in the body is wrapped into the exact frame the frontend
 * expects and broadcast as JSON text:
 *   { "Event": { "user_id", "device_id", "datetime", "tna_key",
 *                "event_type_id": { "name": event_type_name } } }
 *
 * Example QA scenarios (see plan doc "Browser-level QA" section):
 *
 *   Rapid dual-device scan (two different turnstiles, back-to-back):
 *     curl -X POST http://127.0.0.1:4433/fire-event -H 'Content-Type: application/json' -d '{
 *       "events": [
 *         { "user_id": "10008", "device_id": "538203430", "tna_key": "1", "event_type_name": "AUTHENTICATION_SUCCESS" },
 *         { "user_id": "10009", "device_id": "538204298", "tna_key": "1", "event_type_name": "AUTHENTICATION_SUCCESS" }
 *       ],
 *       "intervalMs": 100
 *     }'
 *
 *   IN/OUT same-timestamp collision (same tna_key semantics the fixed dedupe
 *   key expects — the dedupe key includes tna_key, so IN and OUT at the same
 *   instant must NOT be dropped as duplicates of each other):
 *     curl -X POST http://127.0.0.1:4433/fire-event -H 'Content-Type: application/json' -d '{
 *       "events": [
 *         { "user_id": "10008", "device_id": "538203430", "tna_key": "1", "event_type_name": "AUTHENTICATION_SUCCESS", "datetime": "2026-08-08T12:00:00.000Z" },
 *         { "user_id": "10008", "device_id": "538203430", "tna_key": "2", "event_type_name": "AUTHENTICATION_SUCCESS", "datetime": "2026-08-08T12:00:00.000Z" }
 *       ],
 *       "intervalMs": 0
 *     }'
 *
 *   Same-device double-scan (TurnstileDashboard — two scans on one turnstile
 *   close together, to confirm the report queue flushes both instead of one
 *   overwriting the other):
 *     curl -X POST http://127.0.0.1:4433/fire-event -H 'Content-Type: application/json' -d '{
 *       "events": [
 *         { "user_id": "10010", "device_id": "538203430", "tna_key": "1", "event_type_name": "AUTHENTICATION_SUCCESS" },
 *         { "user_id": "10010", "device_id": "538203430", "tna_key": "1", "event_type_name": "AUTHENTICATION_SUCCESS", "datetime": "__NOW_PLUS_1S__" }
 *       ],
 *       "intervalMs": 50
 *     }'
 *   (leave "datetime" out entirely on the second event instead of using the
 *   placeholder above — this server timestamps each event at fire time when
 *   "datetime" is omitted, which is enough to make the two scans distinct.)
 *
 * ----------------------------------------------------------------------
 * FAKE USER DIRECTORY
 * ----------------------------------------------------------------------
 * `GET /api/users/:id` returns a deterministic fake user for any `:id` not
 * already in FAKE_USERS below (name derived from the id, no photo, no
 * custom fields). Add entries to FAKE_USERS to control `Remarks`,
 * `Lived Name`, or `Gate` custom-field values for a specific QA scenario.
 */

import * as http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';

if (process.env.NODE_ENV === 'production') {
  console.error(
    '[fake-biostar-server] Refusing to start: NODE_ENV=production. ' +
      'This is QA-only tooling that fakes the BioStar API and must never run in production.',
  );
  process.exit(1);
}

const PORT = Number(process.env.FAKE_BIOSTAR_PORT) || 4433;

interface FakeCustomField {
  custom_field: { name: string };
  item: string | number | null;
}

interface FakeUser {
  user_id: string;
  name: string;
  photo?: string;
  photo_exist: boolean;
  user_custom_fields: FakeCustomField[];
  disabled: string | boolean;
  expiry_datetime?: string;
}

// Seed a couple of named fixtures useful for QA; anything else falls back
// to a generated fake user (see getFakeUser below).
const FAKE_USERS: Record<string, FakeUser> = {
  '10008': {
    user_id: '10008',
    name: 'QA Test User Alpha',
    photo_exist: false,
    disabled: false,
    user_custom_fields: [
      { custom_field: { name: 'Remarks' }, item: 'QA fixture user' },
      { custom_field: { name: 'Lived Name' }, item: 'Alpha' },
      { custom_field: { name: 'Gate' }, item: 'Main Gate' },
    ],
  },
};

function getFakeUser(userId: string): FakeUser {
  if (FAKE_USERS[userId]) {
    return FAKE_USERS[userId];
  }
  return {
    user_id: userId,
    name: `QA Fake User ${userId}`,
    photo_exist: false,
    disabled: false,
    user_custom_fields: [],
  };
}

interface FireEventBody {
  user_id: string;
  device_id: string;
  tna_key: string;
  event_type_name: string;
  datetime?: string;
}

interface FireEventRequest {
  event?: FireEventBody;
  events?: FireEventBody[];
  intervalMs?: number;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

  // 1. POST /api/login — mimics the real BioStar login endpoint the Next.js
  //    /api/login route proxies to. Session id travels in the response
  //    header, not the body, matching the real proxy's expectations.
  if (req.method === 'POST' && url.pathname === '/api/login') {
    readJsonBody(req)
      .then(() => {
        const fakeSessionId = `qa-fake-session-${Date.now()}`;
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'bs-session-id': fakeSessionId,
        });
        res.end(JSON.stringify({ Response: { code: 0, message: 'Success' } }));
      })
      .catch(() => {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Invalid request body' }));
      });
    return;
  }

  // 2. GET /api/users/:id — mimics the real BioStar user-lookup endpoint the
  //    Next.js /api/users route proxies to.
  if (req.method === 'GET' && url.pathname.startsWith('/api/users/')) {
    const userId = decodeURIComponent(url.pathname.replace('/api/users/', ''));
    const user = getFakeUser(userId);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ User: user }));
    return;
  }

  // 3. POST /fire-event — QA control endpoint, see header comment.
  if (req.method === 'POST' && url.pathname === '/fire-event') {
    readJsonBody<FireEventRequest>(req)
      .then((parsed) => {
        const events = parsed.events ?? (parsed.event ? [parsed.event] : []);
        if (events.length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              message: 'Provide "event" (single) or "events" (array) in the request body.',
            }),
          );
          return;
        }

        const intervalMs = parsed.intervalMs ?? 100;
        broadcastEventSequence(events, intervalMs);

        res.writeHead(202, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            message: `Scheduled ${events.length} event(s), ${intervalMs}ms apart.`,
            connectedClients: wss.clients.size,
          }),
        );
      })
      .catch((error: Error) => {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: error.message }));
      });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', connectedClients: wss.clients.size }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ message: 'Not found (fake-biostar-server)' }));
});

function readJsonBody<T = unknown>(req: http.IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      if (chunks.length === 0) {
        resolve({} as T);
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8')) as T);
      } catch {
        reject(new Error('Body is not valid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function broadcastEventSequence(events: FireEventBody[], intervalMs: number): void {
  events.forEach((event, index) => {
    setTimeout(() => {
      const frame = {
        Event: {
          user_id: event.user_id,
          device_id: event.device_id,
          datetime: event.datetime ?? new Date().toISOString(),
          tna_key: event.tna_key,
          event_type_id: { name: event.event_type_name },
        },
      };
      const payload = JSON.stringify(frame);
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(payload);
        }
      });
      console.log(`[fake-biostar-server] Fired event ${index + 1}/${events.length}:`, payload);
    }, index * intervalMs);
  });
}

// WebSocket server serving /wsapi on the same HTTP server/port.
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  if (url.pathname !== '/wsapi') {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
});

wss.on('connection', (ws) => {
  console.log('[fake-biostar-server] WebSocket client connected.');

  ws.on('message', (data) => {
    // The frontend's first (and only expected) message on open is the
    // plain-text `bs-session-id=<value>` handshake. Any session id is
    // accepted — this fake server does not validate it.
    console.log('[fake-biostar-server] Received from client:', data.toString());
  });

  ws.on('close', () => {
    console.log('[fake-biostar-server] WebSocket client disconnected.');
  });

  ws.on('error', (error) => {
    console.error('[fake-biostar-server] WebSocket client error:', error);
  });
});

server.listen(PORT, () => {
  console.log(`[fake-biostar-server] Listening on http://127.0.0.1:${PORT}`);
  console.log(`[fake-biostar-server]   HTTP:      POST /api/login, GET /api/users/:id`);
  console.log(`[fake-biostar-server]   WebSocket: ws://127.0.0.1:${PORT}/wsapi`);
  console.log(`[fake-biostar-server]   Control:   POST /fire-event  (see header comment for body shape)`);
});
