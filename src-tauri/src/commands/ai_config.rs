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
    AIConfigResult {
        config: None,
        encrypted: false,
    }
}

#[command]
pub async fn ai_config_set(_config: AIConfig) -> SetResult {
    SetResult { encrypted: false }
}
