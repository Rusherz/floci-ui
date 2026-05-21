#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::{env, path::PathBuf};
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

fn show_startup_error(message: &str) {
    let _ = rfd::MessageDialog::new()
        .set_title("Floci Desktop failed to start")
        .set_description(message)
        .set_level(rfd::MessageLevel::Error)
        .show();
}

const APP_PORT: &str = "4173";

#[cfg(target_os = "windows")]
fn windows_node_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    if let Ok(local_app_data) = env::var("LOCALAPPDATA") {
        candidates.push(
            PathBuf::from(local_app_data)
                .join("Programs")
                .join("nodejs")
                .join("node.exe"),
        );
    }
    if let Ok(program_files) = env::var("ProgramFiles") {
        candidates.push(PathBuf::from(program_files).join("nodejs").join("node.exe"));
    }
    if let Ok(program_files_x86) = env::var("ProgramFiles(x86)") {
        candidates.push(PathBuf::from(program_files_x86).join("nodejs").join("node.exe"));
    }

    candidates
}

fn resolve_node_executable() -> String {
    if let Ok(node_bin) = env::var("FLOCI_NODE_BIN") {
        if !node_bin.trim().is_empty() {
            return node_bin;
        }
    }

    #[cfg(target_os = "windows")]
    {
        for candidate in windows_node_candidates() {
            if candidate.exists() {
                return candidate.to_string_lossy().into_owned();
            }
        }
        "node.exe".to_string()
    }

    #[cfg(not(target_os = "windows"))]
    {
        "node".to_string()
    }
}

fn spawn_next_standalone(resources_next_dir: &PathBuf) -> Result<Child, String> {
    let node_bin = resolve_node_executable();

    Command::new(&node_bin)
        .arg("server.js")
        .current_dir(resources_next_dir)
        .env("PORT", APP_PORT)
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .spawn()
        .map_err(|e| {
            format!(
                "failed to start bundled Next.js server with `{}` in `{}`: {}",
                node_bin,
                resources_next_dir.display(),
                e
            )
        })
}

fn main() {
    let child_proc: Arc<Mutex<Option<Child>>> = Arc::new(Mutex::new(None));

    tauri::Builder::default()
        .setup({
            let child_proc = Arc::clone(&child_proc);
            move |app| {
                if !cfg!(debug_assertions) {
                    let resources_next_dir = app
                        .path()
                        .resource_dir()
                        .map_err(|e| format!("failed to resolve app resource dir: {e}"))?
                        .join("next");

                    if !resources_next_dir.join("server.js").exists() {
                        let err = format!(
                            "bundled Next.js entrypoint missing at {}",
                            resources_next_dir.join("server.js").display()
                        );
                        show_startup_error(&err);
                        return Err(err.into());
                    }

                    match spawn_next_standalone(&resources_next_dir) {
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
