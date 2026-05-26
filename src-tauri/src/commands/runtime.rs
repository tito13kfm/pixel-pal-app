pub fn is_portable() -> bool {
    std::env::current_exe()
        .map(|p| {
            let s = p.to_string_lossy().to_lowercase();
            !s.contains("program files")
        })
        .unwrap_or(false)
}

#[tauri::command]
pub fn runtime_is_portable() -> bool {
    is_portable()
}
