import { PROTOCOL_VERSION } from "../lib/protocol";

export function About() {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-3xl font-bold text-ink">About NexDesk</h1>
      <div className="nd-panel space-y-2 p-5 text-sm text-ink-muted">
        <p>
          <span className="font-semibold text-ink">Version:</span> 0.1.0
        </p>
        <p>
          <span className="font-semibold text-ink">Protocol:</span> v{PROTOCOL_VERSION}
        </p>
        <p>
          NexDesk is an original remote desktop product. It is inspired by the general category of
          remote access tools and does not copy proprietary branding, assets, or code from AnyDesk
          or other vendors.
        </p>
        <p>
          Diagnostics: start the signaling service, open two app instances, connect by ID, accept,
          and verify screen + input. See docs/development.md for details.
        </p>
      </div>
    </div>
  );
}
