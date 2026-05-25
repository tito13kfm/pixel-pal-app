use keyring::Entry;
use serde::{Deserialize, Serialize};
use tauri::command;

const SERVICE: &str = "pixel-pal-app";
const USERNAME: &str = "ai-config";

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct AIConfig {
    pub provider: String,
    #[serde(rename = "baseUrl")]
    pub base_url: String,
    #[serde(rename = "apiKey")]
    pub api_key: String,
    pub model: String,
}

#[derive(Serialize)]
pub struct AIConfigResult {
    pub config: Option<AIConfig>,
    pub encrypted: bool,
}

#[derive(Serialize)]
pub struct SetResult {
    pub encrypted: bool,
}

#[command]
pub async fn ai_config_get() -> AIConfigResult {
    let result = tauri::async_runtime::spawn_blocking(|| {
        let entry = Entry::new(SERVICE, USERNAME).ok()?;
        let json = entry.get_password().ok()?;
        serde_json::from_str::<AIConfig>(&json).ok()
    })
    .await;

    match result {
        Ok(Some(config)) => AIConfigResult {
            config: Some(config),
            encrypted: true,
        },
        Ok(None) => AIConfigResult {
            config: None,
            encrypted: false,
        },
        Err(e) => {
            log::error!("[ai_config_get] spawn_blocking failed: {e}");
            AIConfigResult {
                config: None,
                encrypted: false,
            }
        }
    }
}

#[command]
pub async fn ai_config_set(config: AIConfig) -> SetResult {
    let json = match serde_json::to_string(&config) {
        Ok(j) => j,
        Err(_) => return SetResult { encrypted: false },
    };

    let stored = tauri::async_runtime::spawn_blocking(move || {
        let entry = Entry::new(SERVICE, USERNAME).ok()?;
        entry.set_password(&json).ok()?;
        Some(())
    })
    .await;

    SetResult {
        encrypted: match stored {
            Ok(Some(())) => true,
            Ok(None) => false,
            Err(e) => {
                log::error!("[ai_config_set] spawn_blocking failed: {e}");
                false
            }
        },
    }
}
