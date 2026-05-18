#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use tauri::{WebviewUrl, WebviewWindowBuilder};

const APP_PORT: &str = "4173";

fn spawn_next_standalone() -> Result<Child, String> {
    Command::new("node")
        .arg("server.js")
        .current_dir("resources/next")
        .env("PORT", APP_PORT)
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .spawn()
        .map_err(|e| format!("failed to start bundled Next.js server: {e}"))
}

fn main() {
    let child_proc: Arc<Mutex<Option<Child>>> = Arc::new(Mutex::new(None));

    tauri::Builder::default()
        .setup({
            let child_proc = Arc::clone(&child_proc);
            move |app| {
                if !cfg!(debug_assertions) {
                    let child = spawn_next_standalone()?;
                    *child_proc.lock().expect("child mutex poisoned") = Some(child);
                }

                let url = format!("http://127.0.0.1:{APP_PORT}");
                WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url.parse().unwrap()))
                    .title("Floci Desktop")
                    .inner_size(1200.0, 800.0)
                    .build()
                    .map_err(|e| e.to_string())?;

                Ok(())
            }
        })
        .on_window_event({
            let child_proc = Arc::clone(&child_proc);
            move |window, event| {
                if let tauri::WindowEvent::CloseRequested { .. } = event {
                    if window.label() == "main" {
                        if let Some(mut child) = child_proc.lock().expect("child mutex poisoned").take() {
                            let _ = child.kill();
                        }
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error running Floci Desktop");
}
