use keyring::Entry;
use rand::{distributions::Alphanumeric, Rng};
use tauri::{AppHandle, Manager};

struct SentinelState {
    health_item: std::sync::Mutex<Option<tauri::menu::MenuItem<tauri::Wry>>>,
}

#[tauri::command]
async fn get_master_key() -> Result<String, String> {
    let service = "neuradash-sentinel";
    let user = "default-user";
    let entry = Entry::new(service, user).map_err(|e| e.to_string())?;

    match entry.get_password() {
        Ok(password) => Ok(password),
        Err(_) => {
            // Generate a secure random password if it doesn't exist
            let password: String = rand::thread_rng()
                .sample_iter(&Alphanumeric)
                .take(32)
                .map(char::from)
                .collect();
            
            entry.set_password(&password).map_err(|e| e.to_string())?;
            Ok(password)
        }
    }
}

#[tauri::command]
fn set_sentinel_status(status: String, state: tauri::State<'_, SentinelState>) -> Result<(), String> {
    if let Some(item) = state.health_item.lock().unwrap().as_ref() {
        let indicator = match status.as_str() {
            "Optimal" => "🟢",
            "Warning" => "🟡",
            "Critical" => "🔴",
            _ => "⚪",
        };
        let _ = item.set_text(format!("{} Health: {}", indicator, status));
    }
    Ok(())
}

#[tauri::command]
async fn open_detached_window(app: AppHandle, label: String, title: String, url: String) -> Result<(), String> {
    let _window = tauri::WebviewWindowBuilder::new(&app, label, tauri::WebviewUrl::App(url.into()))
        .title(title)
        .inner_size(1000.0, 700.0)
        .decorations(true)
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_stronghold::Builder::with_argon2(std::path::Path::new(".sentinel_salt")).build())
    .plugin(tauri_plugin_notification::init())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_process::init())
    .plugin(tauri_plugin_window_state::Builder::default().build())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .manage(SentinelState { health_item: std::sync::Mutex::new(None) })
    .invoke_handler(tauri::generate_handler![
        get_master_key, 
        set_sentinel_status, 
        open_detached_window
    ])
    .setup(|app| {
      // Initialize System Tray Menu
      let health_i = tauri::menu::MenuItem::with_id(app, "health_status", "⚪ Health: Checking...", false, None::<&str>)?;
      
      // Store health item in state for future updates
      app.state::<SentinelState>().health_item.lock().unwrap().replace(health_i.clone());

      let show_i = tauri::menu::MenuItem::with_id(app, "show", "Show Dashboard", true, None::<&str>)?;
      let hide_i = tauri::menu::MenuItem::with_id(app, "hide", "Hide to Tray", true, None::<&str>)?;
      let quit_i = tauri::menu::MenuItem::with_id(app, "quit", "Quit Sentinel", true, None::<&str>)?;
      let sep = tauri::menu::PredefinedMenuItem::separator(app)?;
      
      let menu = tauri::menu::Menu::with_items(app, &[&health_i, &sep, &show_i, &hide_i, &sep, &quit_i])?;

      // Build Tray Icon
      let _tray = tauri::tray::TrayIconBuilder::with_id("main")
        .menu(&menu)
        .icon(app.default_window_icon().unwrap().clone())
        .on_menu_event(|app, event| match event.id.as_ref() {
            "quit" => {
                app.exit(0);
            }
            "hide" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
            }
            "show" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let tauri::tray::TrayIconEvent::Click {
                button: tauri::tray::MouseButton::Left,
                button_state: tauri::tray::MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    let is_visible = window.is_visible().unwrap_or(false);
                    if is_visible {
                        let _ = window.hide();
                    } else {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
            }
        })
        .build(app)?;

      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
