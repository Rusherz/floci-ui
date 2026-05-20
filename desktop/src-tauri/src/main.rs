#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use tauri::{WebviewUrl, WebviewWindowBuilder};

fn show_startup_error(message: &str) {
    let _ = rfd::MessageDialog::new()
        .set_title("Floci Desktop failed to start")
        .set_description(message)
        .set_level(rfd::MessageLevel::Error)
        .show();
}

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
                    match spawn_next_standalone() {
                        Ok(child) => {
                            *child_proc.lock().expect("child mutex poisoned") = Some(child);
                        }
                        Err(err) => {
                            show_startup_error(&format!(
                                "Could not launch bundled Node/Next runtime.\n\n{}\n\nMake sure Node.js is installed system-wide and available on PATH for desktop apps.",
                                err
                            ));
                            return Err(err.into());
                        }
                    }
                }

                let url = format!("http://127.0.0.1:{APP_PORT}");
                WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url.parse().unwrap()))
                    .title("Floci Desktop")
                    .inner_size(1200.0, 800.0)
                    .build()
                    .map_err(|e| {
                        let msg = format!("Failed to create main window: {e}");
                        show_startup_error(&msg);
                        msg
                    })?;

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
