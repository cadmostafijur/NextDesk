use std::sync::Arc;

use axum::extract::ws::{Message, WebSocket};
use axum::extract::{State, WebSocketUpgrade};
use axum::response::IntoResponse;
use chrono::Utc;
use futures_util::{SinkExt, StreamExt};
use nexdesk_protocol::{
    DeviceId, DevicePresence, Envelope, ErrorCode, PermissionSet, SessionRole, SignalMessage,
    TurnConfig,
};
use tokio::sync::mpsc;
use tracing::{debug, info, warn};
use uuid::Uuid;

use crate::auth::authenticate_device_hello;
use crate::rate_limit::allow_connect;
use crate::session::PendingConnect;
use crate::state::{AppState, ConnectedDevice};
use crate::turn::turn_credentials_for;

pub async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

async fn handle_socket(socket: WebSocket, state: Arc<AppState>) {
    let (mut sink, mut stream) = socket.split();
    let (tx, mut rx) = mpsc::unbounded_channel::<String>();

    let writer = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if sink.send(Message::Text(msg.into())).await.is_err() {
                break;
            }
        }
    });

    let mut device_id: Option<String> = None;
    let conn_id = Uuid::new_v4();

    while let Some(Ok(msg)) = stream.next().await {
        let text = match msg {
            Message::Text(t) => t.to_string(),
            Message::Ping(_) => continue,
            Message::Close(_) => break,
            Message::Binary(_) => {
                send_error(&tx, ErrorCode::InvalidMessage, "binary frames not supported", None);
                continue;
            }
            Message::Pong(_) => continue,
        };

        state.bump_messages();
        let envelope = match Envelope::from_json(&text) {
            Ok(e) => e,
            Err(err) => {
                send_error(
                    &tx,
                    ErrorCode::InvalidMessage,
                    &err.to_string(),
                    None,
                );
                continue;
            }
        };

        match envelope.body {
            SignalMessage::Hello {
                device_id: did,
                device_name,
                auth_token,
                client_version,
            } => {
                match authenticate_device_hello(&state, did.as_str(), &auth_token) {
                    Ok(subject) => {
                        if let Some(existing) = state.online.get(did.as_str()) {
                            // Replace stale socket
                            let _ = existing.sender.send(
                                Envelope::new(SignalMessage::Error {
                                    code: ErrorCode::Conflict,
                                    message: "device connected elsewhere".into(),
                                    related_id: None,
                                })
                                .to_json()
                                .unwrap_or_default(),
                            );
                        }

                        // Update registered display name if present
                        if let Some(mut rec) = state.devices.get_mut(did.as_str()) {
                            if !device_name.trim().is_empty() {
                                rec.device_name = device_name.clone();
                            }
                        }

                        state.online.insert(
                            did.0.clone(),
                            ConnectedDevice {
                                conn_id,
                                device_id: did.clone(),
                                device_name: device_name.clone(),
                                presence: DevicePresence::Online,
                                auth_subject: subject,
                                connected_at: Utc::now(),
                                last_heartbeat: Utc::now(),
                                sender: tx.clone(),
                            },
                        );
                        device_id = Some(did.0.clone());
                        state.audit("ws_hello", did.as_str(), &client_version);

                        let turn = turn_credentials_for(&state.cfg, did.as_str());
                        let ack = Envelope::new(SignalMessage::HelloAck {
                            device_id: did,
                            server_time: Utc::now(),
                            turn: Some(TurnConfig {
                                urls: turn.urls,
                                username: turn.username,
                                credential: turn.credential,
                                ttl_seconds: turn.ttl_seconds,
                            }),
                        });
                        let _ = tx.send(ack.to_json().unwrap_or_default());
                        info!(device = %device_id.as_deref().unwrap_or("?"), "device online");
                    }
                    Err(reason) => {
                        send_error(&tx, ErrorCode::Unauthorized, reason, Some(envelope.id));
                        break;
                    }
                }
            }
            other => {
                let Some(ref did) = device_id else {
                    send_error(
                        &tx,
                        ErrorCode::Unauthorized,
                        "send Hello first",
                        Some(envelope.id),
                    );
                    continue;
                };
                if let Err(err) = handle_authenticated(&state, did, other, envelope.id).await {
                    send_error(&tx, err.0, err.1, Some(envelope.id));
                }
            }
        }
    }

    if let Some(did) = device_id {
        state.disconnect_connection(&did, conn_id, "socket_closed");
        info!(device = %did, "socket closed");
    }
    writer.abort();
}

async fn handle_authenticated(
    state: &AppState,
    device_id: &str,
    msg: SignalMessage,
    related: Uuid,
) -> Result<(), (ErrorCode, &'static str)> {
    match msg {
        SignalMessage::Heartbeat { seq } => {
            if let Some(mut d) = state.online.get_mut(device_id) {
                d.last_heartbeat = Utc::now();
            }
            let ack = Envelope::new(SignalMessage::HeartbeatAck { seq });
            state.send_to(device_id, ack.to_json().unwrap_or_default());
            Ok(())
        }
        SignalMessage::LookupDevice { target_id } => {
            let online = state.online.get(target_id.as_str());
            let registered = state.devices.get(target_id.as_str());
            let found = online.is_some() || registered.is_some();
            let presence = online.as_ref().map(|d| d.presence);
            let display_name = online
                .as_ref()
                .map(|d| d.device_name.clone())
                .or_else(|| registered.as_ref().map(|d| d.device_name.clone()));
            let result = Envelope::new(SignalMessage::LookupDeviceResult {
                target_id,
                found,
                presence,
                display_name,
            });
            state.send_to(device_id, result.to_json().unwrap_or_default());
            Ok(())
        }
        SignalMessage::ConnectRequest {
            session_id,
            to,
            from_name,
            requested,
            message,
        } => {
            if to.as_str() == device_id {
                return Err((ErrorCode::InvalidMessage, "cannot connect to self"));
            }
            if !allow_connect(state, device_id) {
                return Err((ErrorCode::RateLimited, "too many connection attempts"));
            }
            let Some(target) = state.online.get(to.as_str()) else {
                return Err((ErrorCode::Offline, "target device offline"));
            };
            if target.presence == DevicePresence::Busy {
                return Err((ErrorCode::Conflict, "target device busy"));
            }
            if state.devices.get(to.as_str()).map(|d| d.revoked).unwrap_or(false) {
                return Err((ErrorCode::Forbidden, "target device revoked"));
            }

            let pending = PendingConnect {
                session_id,
                from: DeviceId(device_id.to_string()),
                to: to.clone(),
                from_name: from_name.clone(),
                requested: requested.clone(),
                message: message.clone(),
                created_at: Utc::now(),
            };
            state.pending.insert(session_id, pending);
            state.audit("connect_request", device_id, &format!("{session_id} -> {}", to.as_str()));

            let incoming = Envelope::new(SignalMessage::ConnectIncoming {
                session_id,
                from: DeviceId(device_id.to_string()),
                from_name,
                requested,
                message,
            });
            if !state.send_to(to.as_str(), incoming.to_json().unwrap_or_default()) {
                state.pending.remove(&session_id);
                return Err((ErrorCode::Offline, "failed to deliver request"));
            }
            Ok(())
        }
        SignalMessage::ConnectAccept {
            session_id,
            granted,
        } => {
            let Some((_, pending)) = state.pending.remove(&session_id) else {
                return Err((ErrorCode::NotFound, "unknown session"));
            };
            if pending.to.as_str() != device_id {
                // Restore and reject — only callee may accept
                state.pending.insert(session_id, pending);
                return Err((ErrorCode::Forbidden, "only the callee may accept"));
            }
            let granted = clamp_permissions(&pending.requested, &granted);
            state.begin_session(
                session_id,
                pending.from.clone(),
                pending.to.clone(),
                granted.clone(),
            );
            state.audit("connect_accept", device_id, &session_id.to_string());

            let ready_controller = Envelope::new(SignalMessage::SessionReady {
                session_id,
                role: SessionRole::Controller,
                peer: pending.to.clone(),
                granted: granted.clone(),
            });
            let ready_host = Envelope::new(SignalMessage::SessionReady {
                session_id,
                role: SessionRole::Host,
                peer: pending.from.clone(),
                granted,
            });
            state.send_to(
                pending.from.as_str(),
                ready_controller.to_json().unwrap_or_default(),
            );
            state.send_to(pending.to.as_str(), ready_host.to_json().unwrap_or_default());
            Ok(())
        }
        SignalMessage::ConnectReject { session_id, reason } => {
            let Some((_, pending)) = state.pending.remove(&session_id) else {
                return Err((ErrorCode::NotFound, "unknown session"));
            };
            if pending.to.as_str() != device_id {
                state.pending.insert(session_id, pending);
                return Err((ErrorCode::Forbidden, "only the callee may reject"));
            }
            state.audit("connect_reject", device_id, &reason);
            let rej = Envelope::new(SignalMessage::ConnectReject {
                session_id,
                reason,
            });
            state.send_to(pending.from.as_str(), rej.to_json().unwrap_or_default());
            Ok(())
        }
        SignalMessage::ConnectCancel { session_id } => {
            let Some((_, pending)) = state.pending.remove(&session_id) else {
                return Err((ErrorCode::NotFound, "unknown session"));
            };
            if pending.from.as_str() != device_id {
                state.pending.insert(session_id, pending);
                return Err((ErrorCode::Forbidden, "only the caller may cancel"));
            }
            let cancel = Envelope::new(SignalMessage::ConnectCancel { session_id });
            state.send_to(pending.to.as_str(), cancel.to_json().unwrap_or_default());
            Ok(())
        }
        SignalMessage::SdpOffer { session_id, sdp } => {
            relay_session_media(state, device_id, session_id, |peer| {
                Envelope::new(SignalMessage::SdpOffer { session_id, sdp: sdp.clone() })
                    .to_json()
                    .ok()
                    .map(|j| (peer, j))
            })
        }
        SignalMessage::SdpAnswer { session_id, sdp } => {
            relay_session_media(state, device_id, session_id, |peer| {
                Envelope::new(SignalMessage::SdpAnswer { session_id, sdp: sdp.clone() })
                    .to_json()
                    .ok()
                    .map(|j| (peer, j))
            })
        }
        SignalMessage::IceCandidate {
            session_id,
            candidate,
            sdp_mid,
            sdp_mline_index,
        } => {
            relay_session_media(state, device_id, session_id, |peer| {
                Envelope::new(SignalMessage::IceCandidate {
                    session_id,
                    candidate: candidate.clone(),
                    sdp_mid: sdp_mid.clone(),
                    sdp_mline_index,
                })
                .to_json()
                .ok()
                .map(|j| (peer, j))
            })
        }
        SignalMessage::SessionEnd { session_id, reason } => {
            let Some(sess) = state.sessions.get(&session_id) else {
                return Err((ErrorCode::NotFound, "unknown session"));
            };
            if sess.controller.as_str() != device_id && sess.host.as_str() != device_id {
                return Err((ErrorCode::Forbidden, "not a session participant"));
            }
            let peer = if sess.controller.as_str() == device_id {
                sess.host.as_str().to_string()
            } else {
                sess.controller.as_str().to_string()
            };
            let host_id = sess.host.as_str().to_string();
            drop(sess);
            state.sessions.remove(&session_id);
            state.set_presence(&host_id, DevicePresence::Online);
            state.audit("session_end", device_id, &reason);
            let end = Envelope::new(SignalMessage::SessionEnd { session_id, reason });
            state.send_to(&peer, end.to_json().unwrap_or_default());
            Ok(())
        }
        SignalMessage::PresenceUpdate { presence, .. } => {
            state.set_presence(device_id, presence);
            Ok(())
        }
        // Server-only / already handled
        SignalMessage::Hello { .. }
        | SignalMessage::HelloAck { .. }
        | SignalMessage::HeartbeatAck { .. }
        | SignalMessage::LookupDeviceResult { .. }
        | SignalMessage::ConnectIncoming { .. }
        | SignalMessage::SessionReady { .. }
        | SignalMessage::Error { .. } => {
            debug!(%related, "ignoring client-sent server message type");
            Err((ErrorCode::InvalidMessage, "message type not allowed from client"))
        }
    }
}

fn relay_session_media<F>(
    state: &AppState,
    device_id: &str,
    session_id: Uuid,
    build: F,
) -> Result<(), (ErrorCode, &'static str)>
where
    F: FnOnce(String) -> Option<(String, String)>,
{
    let Some(sess) = state.sessions.get(&session_id) else {
        return Err((ErrorCode::NotFound, "unknown session"));
    };
    if sess.controller.as_str() != device_id && sess.host.as_str() != device_id {
        return Err((ErrorCode::Forbidden, "not a session participant"));
    }
    let peer = if sess.controller.as_str() == device_id {
        sess.host.as_str().to_string()
    } else {
        sess.controller.as_str().to_string()
    };
    drop(sess);
    if let Some((peer, json)) = build(peer) {
        if !state.send_to(&peer, json) {
            warn!(%session_id, "peer offline during media relay");
            return Err((ErrorCode::Offline, "peer offline"));
        }
    }
    Ok(())
}

fn clamp_permissions(requested: &PermissionSet, granted: &PermissionSet) -> PermissionSet {
    PermissionSet {
        view: requested.view && granted.view,
        control: requested.control && granted.control,
        clipboard: requested.clipboard && granted.clipboard,
        file_transfer: requested.file_transfer && granted.file_transfer,
        audio: requested.audio && granted.audio,
        chat: requested.chat && granted.chat,
    }
}

fn send_error(tx: &mpsc::UnboundedSender<String>, code: ErrorCode, message: &str, related_id: Option<Uuid>) {
    let env = Envelope::new(SignalMessage::Error {
        code,
        message: message.into(),
        related_id,
    });
    let _ = tx.send(env.to_json().unwrap_or_default());
}
