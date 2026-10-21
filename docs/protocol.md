# NexDesk Protocol v1

All signaling messages are JSON envelopes:

```json
{
  "v": 1,
  "id": "uuid",
  "ts": "RFC3339",
  "type": "hello",
  "...": "type-specific fields"
}
```

Unsupported `v` values are rejected.

## Core message types

| type | Direction | Purpose |
|------|-----------|---------|
| `hello` / `hello_ack` | C↔S | Authenticate device, receive TURN config |
| `heartbeat` / `heartbeat_ack` | C↔S | Liveness |
| `lookup_device` / `lookup_device_result` | C↔S | Availability check |
| `connect_request` / `connect_incoming` | C→S→C | Session invite |
| `connect_accept` / `connect_reject` / `connect_cancel` | C→S→C | Consent |
| `session_ready` | S→C | Both peers authorized |
| `sdp_offer` / `sdp_answer` / `ice_candidate` | C→S→C | WebRTC negotiation |
| `session_end` | C→S→C | Tear down |
| `error` | S→C | Structured failure |

## Permissions

`PermissionSet`: `view`, `control`, `clipboard`, `file_transfer`, `audio`, `chat`.

Server clamps granted permissions to the intersection of requested and accepted sets.

## Data channel messages

Application messages on the `control` channel use `DataChannelMessage` (chat, input, clipboard, file offer/chunk). Frame JPEG fallbacks may use an unordered `frames` channel.
