// Tries to impersonate a device on the signaling server. Every attack must fail.
import { randomUUID, randomBytes } from "node:crypto";

const WS = process.env.NEXDESK_WS ?? "ws://127.0.0.1:7800/ws";
const API = process.env.NEXDESK_API ?? "http://127.0.0.1:7800";

const env = (b) => JSON.stringify({ v: 1, id: randomUUID(), ts: new Date().toISOString(), ...b });

function hello(deviceId, token) {
  return new Promise((resolve) => {
    const ws = new WebSocket(WS);
    const done = (r) => { try { ws.close(); } catch {} resolve(r); };
    ws.onopen = () => ws.send(env({ type: "hello", device_id: deviceId, device_name: "t", auth_token: token, client_version: "test" }));
    ws.onmessage = (e) => {
      const m = JSON.parse(String(e.data));
      if (m.type === "hello_ack") done("accepted");
      if (m.type === "error") done(`rejected (${m.message ?? m.code})`);
    };
    ws.onclose = () => done("closed");
    setTimeout(() => done("timeout"), 8000);
  });
}

const id = "NXD-" + randomBytes(6).toString("hex").toUpperCase().match(/.{4}/g).join("-");
const secret = randomBytes(32).toString("hex");
let failed = 0;
const expect = (name, got, want) => {
  const ok = want === "accepted" ? got === "accepted" : got !== "accepted";
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}: ${got}`);
};

expect("owner first connect (claims ID)", await hello(id, secret), "accepted");
expect("owner reconnect, same secret", await hello(id, secret), "accepted");
expect("attacker, different secret", await hello(id, randomBytes(32).toString("hex")), "rejected");
expect("attacker, dev token", await hello(id, `dev:${id}:x`), "rejected");

const user = await fetch(`${API}/v1/auth/register`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: `a${Date.now()}@x.test`, password: "attacker-password-1" }),
}).then((r) => (r.ok ? r.json() : null)).catch(() => null);
if (user?.access_token) {
  expect("attacker, user account token", await hello(id, user.access_token), "rejected");
} else {
  console.log("SKIP  user account token (register endpoint unavailable)");
}

const other = "NXD-" + randomBytes(6).toString("hex").toUpperCase().match(/.{4}/g).join("-");
expect("short secret for new ID", await hello(other, "short"), "rejected");
expect("bad ID format", await hello("HACKER", secret), "rejected");

console.log(failed ? `\nauth_security: ${failed} FAILED` : "\nauth_security: ALL PASS");
process.exit(failed ? 1 : 0);
