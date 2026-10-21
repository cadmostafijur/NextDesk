/**
 * Two-client signaling smoke test (Node 18+).
 * Run with signaling on :7800: node tests/integration/signaling_e2e.mjs
 */
import { randomUUID } from "node:crypto";

const WS_URL = process.env.NEXDESK_WS ?? "ws://127.0.0.1:7800/ws";
const API = process.env.NEXDESK_API ?? "http://127.0.0.1:7800";

async function register(name, id) {
  const secret = "integration-test-secret-01";
  const res = await fetch(`${API}/v1/devices/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      device_name: name,
      device_secret: secret,
      device_id: id,
    }),
  });
  if (!res.ok) throw new Error(`register ${id}: ${res.status}`);
  const body = await res.json();
  return { ...body, secret };
}

function envelope(body) {
  return JSON.stringify({
    v: 1,
    id: randomUUID(),
    ts: new Date().toISOString(),
    ...body,
  });
}

function connectDevice(deviceId, authToken, name) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    const inbox = [];
    const waiters = [];

    ws.onopen = () => {
      ws.send(
        envelope({
          type: "hello",
          device_id: deviceId,
          device_name: name,
          auth_token: authToken,
          client_version: "0.1.0-test",
        }),
      );
    };
    ws.onerror = () => reject(new Error(`ws error ${deviceId}`));
    ws.onmessage = (ev) => {
      const msg = JSON.parse(String(ev.data));
      if (waiters.length) waiters.shift()(msg);
      else inbox.push(msg);
    };

    const api = {
      ws,
      send: (body) => ws.send(envelope(body)),
      next: (timeoutMs = 5000) =>
        new Promise((res, rej) => {
          if (inbox.length) return res(inbox.shift());
          const t = setTimeout(() => rej(new Error(`timeout waiting ${deviceId}`)), timeoutMs);
          waiters.push((m) => {
            clearTimeout(t);
            res(m);
          });
        }),
    };
    resolve(api);
  });
}

const suffix = randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
const hostId = `NXD-E2E1-H${suffix.slice(0, 3)}-${suffix.slice(3, 7)}`;
const ctrlId = `NXD-E2E1-C${suffix.slice(0, 3)}-${suffix.slice(3, 7)}`;

const hostReg = await register("E2E Host", hostId);
const ctrlReg = await register("E2E Controller", ctrlId);

const host = await connectDevice(hostId, hostReg.device_token || hostReg.secret, "E2E Host");
const ctrl = await connectDevice(ctrlId, ctrlReg.device_token || ctrlReg.secret, "E2E Controller");

const hostAck = await host.next();
const ctrlAck = await ctrl.next();
if (hostAck.type !== "hello_ack" || ctrlAck.type !== "hello_ack") {
  throw new Error("hello_ack missing");
}

ctrl.send({ type: "lookup_device", target_id: hostId });
const lookup = await ctrl.next();
if (lookup.type !== "lookup_device_result" || !lookup.found || lookup.presence !== "online") {
  throw new Error(`lookup failed: ${JSON.stringify(lookup)}`);
}

const sessionId = randomUUID();
ctrl.send({
  type: "connect_request",
  session_id: sessionId,
  to: hostId,
  from_name: "E2E Controller",
  requested: {
    view: true,
    control: true,
    clipboard: false,
    file_transfer: false,
    audio: false,
    chat: true,
  },
  message: "integration test",
});

const incoming = await host.next();
if (incoming.type !== "connect_incoming" || incoming.session_id !== sessionId) {
  throw new Error(`expected connect_incoming, got ${incoming.type}`);
}

host.send({
  type: "connect_accept",
  session_id: sessionId,
  granted: incoming.requested,
});

const readyCtrl = await ctrl.next();
const readyHost = await host.next();
if (readyCtrl.type !== "session_ready" || readyHost.type !== "session_ready") {
  throw new Error("session_ready missing");
}

ctrl.send({ type: "sdp_offer", session_id: sessionId, sdp: "v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\n" });
const offer = await host.next();
if (offer.type !== "sdp_offer") throw new Error("sdp relay failed");

ctrl.send({ type: "session_end", session_id: sessionId, reason: "test complete" });
const end = await host.next();
if (end.type !== "session_end") throw new Error("session_end missing");

host.ws.close();
ctrl.ws.close();
console.log("signaling_e2e: PASS");
