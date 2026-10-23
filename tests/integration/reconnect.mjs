/**
 * Regression: when a device reconnects, the old socket closing later must not
 * mark the device offline or drop requests sent to the new socket.
 * Run with signaling on :7800: node tests/integration/reconnect.mjs
 */
import { randomUUID, randomBytes } from "node:crypto";

const WS_URL = process.env.NEXDESK_WS ?? "ws://127.0.0.1:7800/ws";

const env = (b) => JSON.stringify({ v: 1, id: randomUUID(), ts: new Date().toISOString(), ...b });
const newId = () => "NXD-" + randomBytes(6).toString("hex").toUpperCase().match(/.{4}/g).join("-");

function connect(deviceId, secret) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    const inbox = [];
    const waiters = [];
    ws.onmessage = (e) => {
      const m = JSON.parse(String(e.data));
      inbox.push(m);
      for (const w of [...waiters]) if (w.pred(m)) { waiters.splice(waiters.indexOf(w), 1); w.resolve(m); }
    };
    const next = (pred, ms = 8000) => {
      const hit = inbox.find(pred);
      if (hit) return Promise.resolve(hit);
      return new Promise((res, rej) => {
        waiters.push({ pred, resolve: res });
        setTimeout(() => rej(new Error("timeout waiting for message")), ms);
      });
    };
    ws.onopen = async () => {
      ws.send(env({ type: "hello", device_id: deviceId, device_name: deviceId, auth_token: secret, client_version: "test" }));
      try {
        await next((m) => m.type === "hello_ack");
        resolve({ ws, next, send: (b) => ws.send(env(b)) });
      } catch (e) { reject(e); }
    };
    ws.onerror = () => reject(new Error("ws error"));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `: ${detail}` : ""}`);
};

const hostId = newId();
const hostSecret = randomBytes(32).toString("hex");
const ctrlId = newId();

const oldSock = await connect(hostId, hostSecret);
const newSock = await connect(hostId, hostSecret); // reconnect while old is still open
oldSock.ws.close();
await sleep(1500);

const ctrl = await connect(ctrlId, randomBytes(32).toString("hex"));
ctrl.send({ type: "lookup_device", target_id: hostId });
const look = await ctrl.next((m) => m.type === "lookup_device_result");
check("host still online after old socket closed", look.presence === "online", look.presence ?? "offline");

const sessionId = randomUUID();
ctrl.send({
  type: "connect_request", session_id: sessionId, to: hostId, from_name: "ctrl",
  requested: { view: true, control: true, clipboard: false, file_transfer: false, audio: false, chat: true },
  message: null,
});
const incoming = await newSock.next((m) => m.type === "connect_incoming").catch(() => null);
check("connect request reaches the new socket", Boolean(incoming));

if (incoming) {
  newSock.send({ type: "connect_accept", session_id: sessionId, granted: incoming.requested });
  const ready = await ctrl.next((m) => m.type === "session_ready").catch(() => null);
  check("session starts", Boolean(ready));
  ctrl.send({ type: "ice_candidate", session_id: sessionId, candidate: "candidate:1 1 udp 1 1.2.3.4 5 typ host", sdp_mid: "0", sdp_mline_index: 0 });
  const ice = await newSock.next((m) => m.type === "ice_candidate").catch(() => null);
  check("ICE candidate relayed to host", Boolean(ice));
}

for (const s of [newSock, ctrl]) s.ws.close();
console.log(failed ? `\nreconnect: ${failed} FAILED` : "\nreconnect: ALL PASS");
process.exit(failed ? 1 : 0);
