// Heuristic for "is this a portable build?"
//
// Tauri builds a single binary regardless of how it ends up packaged — the
// same `pixel-pal-app.exe` is what NSIS wraps as the installer payload AND
// what we ship as the standalone portable .exe. There's no compile-time
// feature flag distinguishing the two (see `docs/notes/portable.md` /
// memory:updater-architecture for the rationale).
//
// So the binary detects its packaging at runtime by checking where it's
// running from. Installer-installed copies land under "Program Files" /
// "Program Files (x86)" by default; portable copies are wherever the user
// dropped them.
//
// Edge cases we accept:
//   - Installed to a non-default location (D:\MyApps\PixelPal\) -> reads
//     as portable. Annoying but harmless: the user just gets the manual
//     update popup instead of auto-update.
//   - Portable placed inside Program Files manually -> reads as installed.
//     The tauri-plugin-updater will try to update against a loose .exe and
//     misbehave. Rare; portable users typically don't choose system dirs.

/// Pure heuristic over a path string. Extracted from `is_portable()` so it
/// can be unit-tested without touching the real `std::env::current_exe()`.
pub fn is_path_portable(path: &str) -> bool {
    !path.to_lowercase().contains("program files")
}

pub fn is_portable() -> bool {
    std::env::current_exe()
        .map(|p| is_path_portable(&p.to_string_lossy()))
        .unwrap_or(false)
}

#[tauri::command]
pub fn runtime_is_portable() -> bool {
    is_portable()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn installed_default_location() {
        assert!(!is_path_portable(r"C:\Program Files\PIXEL.PAL\pixel-pal-app.exe"));
        assert!(!is_path_portable(r"C:\Program Files (x86)\PIXEL.PAL\pixel-pal-app.exe"));
    }

    #[test]
    fn installed_location_is_case_insensitive() {
        assert!(!is_path_portable(r"C:\PROGRAM FILES\PIXEL.PAL\pixel-pal-app.exe"));
        assert!(!is_path_portable(r"c:\program files (x86)\foo\pixel-pal-app.exe"));
    }

    #[test]
    fn portable_in_user_directory() {
        assert!(is_path_portable(r"C:\Users\alice\Downloads\pixel-pal-app.exe"));
        assert!(is_path_portable(r"C:\Tools\pixel-pal-portable.exe"));
        assert!(is_path_portable(r"D:\MyApps\PixelPal\pixel-pal-app.exe"));
    }

    #[test]
    fn portable_on_unix_paths() {
        // Path strings on macOS / Linux never contain "program files",
        // so the heuristic correctly treats every non-Windows install as
        // portable. The Tauri updater plugin on macOS/Linux uses a
        // different update format anyway and is currently a no-op for
        // portable mode — both paths converge to "skip auto-update".
        assert!(is_path_portable("/usr/local/bin/pixel-pal-app"));
        assert!(is_path_portable("/Applications/PIXEL.PAL.app/Contents/MacOS/pixel-pal-app"));
        assert!(is_path_portable("/home/alice/bin/pixel-pal-app"));
    }

    #[test]
    fn portable_at_path_with_no_separator() {
        assert!(is_path_portable("pixel-pal-app.exe"));
        assert!(is_path_portable(""));
    }
}
