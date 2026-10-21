//! Integration-style tests that do not require a live server socket.
use nexdesk_protocol::{Envelope, PermissionSet, SignalMessage, PROTOCOL_VERSION};

#[test]
fn connect_flow_messages_roundtrip() {
    let session = uuid::Uuid::new_v4();
    let req = Envelope::new(SignalMessage::ConnectRequest {
        session_id: session,
        to: nexdesk_protocol::DeviceId("NXD-AAAA-BBBB-CCCC".into()),
        from_name: "A".into(),
        requested: PermissionSet::full_attended(),
        message: None,
    });
    let json = req.to_json().unwrap();
    let parsed = Envelope::from_json(&json).unwrap();
    assert_eq!(parsed.v, PROTOCOL_VERSION);
    match parsed.body {
        SignalMessage::ConnectRequest { session_id, .. } => assert_eq!(session_id, session),
        _ => panic!("wrong variant"),
    }
}

#[test]
fn permission_clamp_logic() {
    let requested = PermissionSet::full_attended();
    let granted = PermissionSet {
        view: true,
        control: false,
        clipboard: true,
        file_transfer: false,
        audio: false,
        chat: true,
    };
    let clamped = PermissionSet {
        view: requested.view && granted.view,
        control: requested.control && granted.control,
        clipboard: requested.clipboard && granted.clipboard,
        file_transfer: requested.file_transfer && granted.file_transfer,
        audio: requested.audio && granted.audio,
        chat: requested.chat && granted.chat,
    };
    assert!(clamped.view);
    assert!(!clamped.control);
    assert!(!clamped.file_transfer);
}
