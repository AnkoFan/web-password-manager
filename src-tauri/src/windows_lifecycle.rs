use std::sync::{
    mpsc::{self, Receiver, Sender, SyncSender},
    OnceLock,
};
use std::time::Duration;

use windows_sys::Win32::{
    Foundation::{HWND, LPARAM, LRESULT, WPARAM},
    System::{
        LibraryLoader::GetModuleHandleW,
        RemoteDesktop::{WTSRegisterSessionNotification, NOTIFY_FOR_THIS_SESSION},
    },
    UI::WindowsAndMessaging::{
        CreateWindowExW, DefWindowProcW, DestroyWindow, DispatchMessageW, GetMessageW,
        RegisterClassW, TranslateMessage, MSG, PBT_APMRESUMEAUTOMATIC, PBT_APMSUSPEND,
        WM_POWERBROADCAST, WM_WTSSESSION_CHANGE, WNDCLASSW, WTS_CONSOLE_DISCONNECT,
        WTS_REMOTE_DISCONNECT, WTS_SESSION_LOCK, WTS_SESSION_LOGOFF,
    },
};

static EVENT_SENDER: OnceLock<Sender<&'static str>> = OnceLock::new();

fn lifecycle_reason(message: u32, event: usize) -> Option<&'static str> {
    match (message, event as u32) {
        (WM_WTSSESSION_CHANGE, WTS_SESSION_LOCK) => Some("windows_session_lock"),
        (WM_WTSSESSION_CHANGE, WTS_SESSION_LOGOFF) => Some("windows_session_logoff"),
        (WM_WTSSESSION_CHANGE, WTS_CONSOLE_DISCONNECT | WTS_REMOTE_DISCONNECT) => {
            Some("windows_session_disconnect")
        }
        (WM_POWERBROADCAST, PBT_APMSUSPEND) => Some("windows_suspend"),
        // Lock again on resume in case firmware did not deliver the suspend broadcast.
        (WM_POWERBROADCAST, PBT_APMRESUMEAUTOMATIC) => Some("windows_resume"),
        _ => None,
    }
}

unsafe extern "system" fn lifecycle_window_proc(
    window: HWND,
    message: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    if let Some(reason) = lifecycle_reason(message, wparam) {
        if let Some(sender) = EVENT_SENDER.get() {
            let _ = sender.send(reason);
        }
    }
    unsafe { DefWindowProcW(window, message, wparam, lparam) }
}

fn run_message_window(ready: SyncSender<bool>) {
    let class_name = "WebPasswordManagerLifecycle\0"
        .encode_utf16()
        .collect::<Vec<_>>();
    unsafe {
        let instance = GetModuleHandleW(std::ptr::null());
        let window_class = WNDCLASSW {
            lpfnWndProc: Some(lifecycle_window_proc),
            hInstance: instance,
            lpszClassName: class_name.as_ptr(),
            ..std::mem::zeroed()
        };
        if RegisterClassW(&window_class) == 0 {
            let _ = ready.send(false);
            return;
        }
        // A hidden top-level window is required because message-only windows do
        // not receive system broadcast messages such as WM_POWERBROADCAST.
        let window = CreateWindowExW(
            0,
            class_name.as_ptr(),
            class_name.as_ptr(),
            0,
            0,
            0,
            0,
            0,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            instance,
            std::ptr::null(),
        );
        if window.is_null() {
            let _ = ready.send(false);
            return;
        }
        if WTSRegisterSessionNotification(window, NOTIFY_FOR_THIS_SESSION) == 0 {
            let _ = ready.send(false);
            DestroyWindow(window);
            return;
        }
        let _ = ready.send(true);
        let mut message: MSG = std::mem::zeroed();
        while GetMessageW(&mut message, std::ptr::null_mut(), 0, 0) > 0 {
            TranslateMessage(&message);
            DispatchMessageW(&message);
        }
    }
}

pub(crate) fn subscribe() -> Result<Receiver<&'static str>, String> {
    let (sender, receiver) = mpsc::channel();
    EVENT_SENDER
        .set(sender)
        .map_err(|_| "Windows 生命周期监控已初始化".to_string())?;
    let (ready_sender, ready_receiver) = mpsc::sync_channel(1);
    std::thread::spawn(move || run_message_window(ready_sender));
    match ready_receiver.recv_timeout(Duration::from_secs(2)) {
        Ok(true) => Ok(receiver),
        Ok(false) => Err("无法注册 Windows 生命周期监控".into()),
        Err(_) => Err("Windows 生命周期监控初始化超时".into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, Instant};
    use windows_sys::Win32::UI::WindowsAndMessaging::{FindWindowW, PostMessageW};

    #[test]
    fn sensitive_windows_events_map_to_lock_reasons() {
        assert_eq!(
            lifecycle_reason(WM_WTSSESSION_CHANGE, WTS_SESSION_LOCK as usize),
            Some("windows_session_lock")
        );
        assert_eq!(
            lifecycle_reason(WM_WTSSESSION_CHANGE, WTS_CONSOLE_DISCONNECT as usize),
            Some("windows_session_disconnect")
        );
        assert_eq!(
            lifecycle_reason(WM_POWERBROADCAST, PBT_APMSUSPEND as usize),
            Some("windows_suspend")
        );
        assert_eq!(
            lifecycle_reason(WM_POWERBROADCAST, PBT_APMRESUMEAUTOMATIC as usize),
            Some("windows_resume")
        );
        assert_eq!(lifecycle_reason(WM_POWERBROADCAST, 0), None);
    }

    #[test]
    fn hidden_window_forwards_a_native_power_message() {
        let receiver = subscribe().expect("the lifecycle subscriber should initialize once");
        let class_name = "WebPasswordManagerLifecycle\0"
            .encode_utf16()
            .collect::<Vec<_>>();
        let deadline = Instant::now() + Duration::from_secs(2);
        let window = loop {
            let candidate = unsafe { FindWindowW(class_name.as_ptr(), std::ptr::null()) };
            if !candidate.is_null() {
                break candidate;
            }
            assert!(
                Instant::now() < deadline,
                "the lifecycle message window was not created"
            );
            std::thread::sleep(Duration::from_millis(10));
        };
        assert_ne!(
            unsafe { PostMessageW(window, WM_POWERBROADCAST, PBT_APMSUSPEND as usize, 0) },
            0
        );
        assert_eq!(
            receiver.recv_timeout(Duration::from_secs(2)),
            Ok("windows_suspend")
        );
    }
}
