mod commands;

use tauri_plugin_log::{Target, TargetKind};

pub fn run() {
    let mut builder = tauri::Builder::default();

    // Skip the Tauri updater plugin on portable builds — the plugin assumes
    // an installer-style update artifact and would corrupt a standalone exe.
    // Portable users get a frontend-driven popup linking to the Releases page.
    if !commands::runtime::is_portable() {
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    }

    builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_http::init())
        .plugin(
            tauri_plugin_log::Builder::default()
                .targets([
                    Target::new(TargetKind::Stdout),
                    Target::new(TargetKind::LogDir { file_name: None }),
                ])
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            commands::ai_config::ai_config_get,
            commands::ai_config::ai_config_set,
            commands::runtime::runtime_is_portable,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
