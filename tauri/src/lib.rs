use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{LazyLock, Mutex};

use serde_json::json;
use tauri::{Emitter, Manager, webview::DownloadEvent};
use url::Url;
use uuid::Uuid;

mod deeplink;
use deeplink::Deeplink;

mod tray;
mod window;
use crate::window::{WINDOW_STATES, WindowState};

#[derive(Debug)]
pub struct AppStateStruct {
  pub notification_count: i32,
  pub is_muted: bool,
}

impl Default for AppStateStruct {
  fn default() -> Self {
    Self {
      notification_count: 0,
      is_muted: false,
    }
  }
}

pub type AppState = Mutex<AppStateStruct>;

pub const WINDOW_WIDTH: f64 = 1088.0;
pub const WINDOW_HEIGHT: f64 = 700.0;
pub const WINDOW_MIN_WIDTH: f64 = 360.0;
pub const WINDOW_MIN_HEIGHT: f64 = 200.0;

pub const BUNDLED_INDEX_PATH: &str = "index.html";

pub static LAST_URL: LazyLock<std::sync::Mutex<String>> =
  LazyLock::new(|| std::sync::Mutex::new(get_initial_page_url()));

pub const DEFAULT_WINDOW_TITLE: &str = match std::option_env!("APP_TITLE") {
  Some(title) => title,
  None => "Telegram Air",
};

pub const BASE_URL: Option<&str> = std::option_env!("BASE_URL");

pub const WITH_UPDATER: &str = match std::option_env!("WITH_UPDATER") {
  Some(str) => str,
  None => "false",
};

/// 返回当前构建模式的初始页面地址
pub fn get_initial_page_url() -> String {
  BASE_URL.unwrap_or(BUNDLED_INDEX_PATH).to_string()
}

pub(crate) fn strip_hash_from_url(url: &str) -> String {
  if let Ok(mut parsed_url) = Url::parse(url) {
    parsed_url.set_fragment(None);
    parsed_url.to_string()
  } else {
    url.to_string()
  }
}

pub(crate) fn save_window_url(app: &tauri::AppHandle, window_label: &str) {
  if let Some(webview_window) = app.get_webview_window(window_label) {
    if let Ok(current_url) = webview_window.url() {
      let url_without_hash = strip_hash_from_url(current_url.as_str());
      if let Ok(mut last_url) = LAST_URL.lock() {
        *last_url = url_without_hash;
      }
    }
  }
}

pub fn run() {
  let app = tauri::Builder::default()
    .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
      let active_windows = app.windows();
      if active_windows.len() >= 1 {
        let window = active_windows.values().next().unwrap();
        window.set_focus().unwrap_or_default();
      } else {
        open_new_window(app.clone(), get_initial_page_url()).unwrap();
      }
    }))
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_notification::init())
    .plugin(tauri_plugin_log::Builder::default().build())
    .plugin(tauri_plugin_window_state::Builder::default().build())
    .plugin(tauri_plugin_deep_link::init())
    .plugin(tauri_plugin_process::init());

  let app = app.on_window_event(|window, event| match event {
    tauri::WindowEvent::CloseRequested { api, .. } => {
      let active_windows = window.app_handle().windows();

      if active_windows.len() == 1 {
        // Save current URL before hiding the last window
        save_window_url(&window.app_handle(), window.label());

        #[cfg(target_os = "macos")]
        window.app_handle().hide().unwrap_or_default();
        #[cfg(not(target_os = "macos"))]
        window.hide().unwrap_or_default();
        api.prevent_close();
      }
    }
    tauri::WindowEvent::Destroyed => {
      if let Ok(mut states) = WINDOW_STATES.lock() {
        states.remove(window.label());
      }
    }
    _ => {}
  });

  let app = app.setup(|app| {
    // Manage app state
    app.manage(AppState::new(AppStateStruct::default()));

    let _main_window = open_new_window(app.handle().clone(), get_initial_page_url())
      .expect("Failed to open main window");

    let deeplink = Deeplink::init();
    if let Err(err) = deeplink.setup(app.handle()) {
      log::error!("Failed to setup deeplink: {:?}", err);
    }

    if WITH_UPDATER == "true" {
      app
        .handle()
        .plugin(tauri_plugin_updater::Builder::new().build())?;
    }

    crate::tray::TrayManager::init(app.handle().clone())?;

    Ok(())
  });

  let app = app.invoke_handler(tauri::generate_handler![
    set_notifications_count,
    set_window_title,
    open_new_window_cmd,
    save_current_url,
    set_menu_translations
  ]);

  app
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

#[tauri::command]
fn set_notifications_count(
  window: tauri::WebviewWindow,
  amount: i32,
  is_muted: bool,
  state: tauri::State<'_, AppState>,
) {
  // Update app state
  if let Ok(mut app_state) = state.lock() {
    app_state.notification_count = amount;
    app_state.is_muted = is_muted;
  }

  crate::tray::set_notifications_count(&window, amount, is_muted);
}

#[tauri::command]
fn set_menu_translations(translations: HashMap<String, String>) {
  crate::tray::set_menu_translations(translations);
}

#[tauri::command]
fn set_window_title(window: tauri::WebviewWindow, title: String) {
  if let Ok(mut states) = WINDOW_STATES.lock() {
    if let Some(state) = states.get_mut(window.label()) {
      state.title = title.clone();
      window.set_title(&title).unwrap_or_default();
    }
  }
}

#[tauri::command]
async fn open_new_window_cmd(app: tauri::AppHandle, url: String) -> bool {
  open_new_window(app, url).is_ok()
}

#[tauri::command]
fn save_current_url(window: tauri::WebviewWindow) {
  if let Ok(current_url) = window.url() {
    let url_without_hash = strip_hash_from_url(current_url.as_str());
    if let Ok(mut last_url) = LAST_URL.lock() {
      *last_url = url_without_hash;
    }
  }
}

pub(crate) fn open_new_window(
  app: tauri::AppHandle,
  url: String,
) -> Result<tauri::WebviewWindow, String> {
  let base_url = build_external_base_url()?;
  let webview_url = build_webview_url(&url, base_url.as_ref())?;
  let navigation_base_url = base_url.clone();
  let window_label = Uuid::new_v4().to_string();
  let new_window_builder =
    tauri::WebviewWindowBuilder::new(&app, window_label.clone(), webview_url)
      .additional_browser_args("--autoplay-policy=no-user-gesture-required")
      .fullscreen(false)
      .resizable(true)
      .title(DEFAULT_WINDOW_TITLE)
      .inner_size(WINDOW_WIDTH, WINDOW_HEIGHT)
      .min_inner_size(WINDOW_MIN_WIDTH, WINDOW_MIN_HEIGHT)
      .disable_drag_drop_handler() // Required for Drag & Drop on Windows
      .initialization_script(&format!(
        "window.tauri = {{ version: '{}' }};",
        env!("CARGO_PKG_VERSION")
      ))
      .on_navigation(move |url| is_allowed_navigation_url(url, navigation_base_url.as_ref()))
      .on_download(|window, event| {
        match event {
          #[allow(unused_variables)]
          DownloadEvent::Requested { destination, .. } => {
            // On macOS, Webview does not provide basic download logic
            #[cfg(target_os = "macos")]
            if let Some(filename) = destination.file_name() {
              if let Ok(downloads_dir) = window.app_handle().path().download_dir() {
                let new_destination = downloads_dir.join(filename);
                *destination = new_destination;
              }
            }
          }
          DownloadEvent::Finished { url, success, .. } => {
            window
              .emit_to(
                window.label(),
                "download-finished",
                json!({
                  "url": url.to_string(),
                  "success": success
                }),
              )
              .unwrap_or_default();
          }
          _ => {}
        };
        true
      });

  if let Ok(mut states) = WINDOW_STATES.lock() {
    let new_state = WindowState {
      title: DEFAULT_WINDOW_TITLE.to_string(),
    };
    states.insert(window_label.to_string(), new_state);
  }

  let window = new_window_builder.build().map_err(|err| err.to_string())?;

  // Apply stored notification count to the new window
  if let Some(state) = app.try_state::<AppState>() {
    if let Ok(app_state) = state.lock() {
      crate::tray::set_notifications_count(
        &window,
        app_state.notification_count,
        app_state.is_muted,
      );
    }
  }

  Ok(window)
}

fn resolve_app_url(url: &str, base_url: &Url) -> Option<Url> {
  let url = base_url.join(url).ok()?;

  is_allowed_external_url(&url, base_url).then_some(url)
}

/// 解析可选的外部部署地址，独立应用未配置时使用内置资源
fn build_external_base_url() -> Result<Option<Url>, String> {
  let Some(base_url) = BASE_URL else {
    return Ok(None);
  };

  let parsed_url = Url::parse(base_url).map_err(|err| format!("Invalid base URL: {err}"))?;
  if !matches!(parsed_url.scheme(), "http" | "https") {
    return Err(format!(
      "Unsupported base URL scheme: {}",
      parsed_url.scheme()
    ));
  }

  Ok(Some(parsed_url))
}

/// 构建外部页面或内置前端资源对应的 Tauri 窗口地址
fn build_webview_url(url: &str, base_url: Option<&Url>) -> Result<tauri::WebviewUrl, String> {
  if let Some(base_url) = base_url {
    let url = resolve_app_url(url, base_url).ok_or_else(|| format!("Disallowed app URL: {url}"))?;
    return Ok(tauri::WebviewUrl::External(url));
  }

  let page_path = build_bundled_page_path(url)?;
  Ok(tauri::WebviewUrl::App(page_path))
}

/// 将当前内置页面地址转换为 Tauri 可加载的资源路径
fn build_bundled_page_path(url: &str) -> Result<PathBuf, String> {
  if url == BUNDLED_INDEX_PATH {
    return Ok(BUNDLED_INDEX_PATH.into());
  }

  let parsed_url = Url::parse(url).map_err(|err| format!("Invalid bundled app URL: {err}"))?;
  if !is_bundled_app_url(&parsed_url) {
    return Err(format!("Disallowed bundled app URL: {url}"));
  }

  let path = parsed_url.path().trim_start_matches('/');
  Ok(if path.is_empty() {
    BUNDLED_INDEX_PATH.into()
  } else {
    path.into()
  })
}

/// 校验导航地址属于外部部署站点或 Tauri 内置资源域
fn is_allowed_navigation_url(url: &Url, base_url: Option<&Url>) -> bool {
  if let Some(base_url) = base_url {
    return is_allowed_external_url(url, base_url);
  }

  is_bundled_app_url(url)
}

/// 校验页面地址与外部部署站点同源
fn is_allowed_external_url(url: &Url, base_url: &Url) -> bool {
  matches!(url.scheme(), "http" | "https") && url.origin() == base_url.origin()
}

/// 校验页面地址属于 macOS WebView 使用的 Tauri 内置资源域
fn is_bundled_app_url(url: &Url) -> bool {
  (url.scheme() == "tauri" && url.host_str() == Some("localhost"))
    || (matches!(url.scheme(), "http" | "https") && url.host_str() == Some("tauri.localhost"))
}
