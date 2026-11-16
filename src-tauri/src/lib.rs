use aes_gcm::{
    aead::{Aead, OsRng},
    Aes256Gcm, KeyInit, Nonce,
};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use keyring::Entry;
use rand::RngCore;

const KEYRING_SERVICE: &str = "GoldenLedger.Pawn";
const KEYRING_USER: &str = "receipt-signature-key-v1";

fn signature_cipher() -> Result<Aes256Gcm, String> {
    let entry = Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .map_err(|error| format!("Could not access the operating-system credential store: {error}"))?;
    let key = match entry.get_password() {
        Ok(encoded) => BASE64
            .decode(encoded)
            .map_err(|error| format!("Stored signature key is invalid: {error}"))?,
        Err(keyring::Error::NoEntry) => {
            let mut key = [0_u8; 32];
            OsRng.fill_bytes(&mut key);
            entry
                .set_password(&BASE64.encode(key))
                .map_err(|error| format!("Could not protect the signature key: {error}"))?;
            key.to_vec()
        }
        Err(error) => return Err(format!("Could not read the signature key: {error}")),
    };
    Aes256Gcm::new_from_slice(&key).map_err(|error| format!("Could not initialize signature encryption: {error}"))
}

#[tauri::command]
fn encrypt_receipt_signature(signature: String) -> Result<String, String> {
    if !signature.starts_with("data:image/png;base64,") || signature.len() > 1_000_000 {
        return Err("The customer signature must be a PNG image under 1 MB.".to_string());
    }
    let cipher = signature_cipher()?;
    let mut nonce = [0_u8; 12];
    OsRng.fill_bytes(&mut nonce);
    let encrypted = cipher
        .encrypt(Nonce::from_slice(&nonce), signature.as_bytes())
        .map_err(|_| "Could not encrypt the customer signature.".to_string())?;
    Ok(format!("v1.{}.{}", BASE64.encode(nonce), BASE64.encode(encrypted)))
}

#[tauri::command]
fn decrypt_receipt_signature(encrypted_signature: String) -> Result<String, String> {
    let mut parts = encrypted_signature.split('.');
    if parts.next() != Some("v1") {
        return Err("Unsupported signature encryption format.".to_string());
    }
    let nonce = BASE64
        .decode(parts.next().unwrap_or_default())
        .map_err(|error| format!("Invalid signature nonce: {error}"))?;
    let ciphertext = BASE64
        .decode(parts.next().unwrap_or_default())
        .map_err(|error| format!("Invalid signature data: {error}"))?;
    if parts.next().is_some() || nonce.len() != 12 {
        return Err("Invalid encrypted signature.".to_string());
    }
    let cipher = signature_cipher()?;
    let plaintext = cipher
        .decrypt(Nonce::from_slice(&nonce), ciphertext.as_ref())
        .map_err(|_| "The stored customer signature could not be decrypted.".to_string())?;
    String::from_utf8(plaintext).map_err(|error| format!("Invalid signature text: {error}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            encrypt_receipt_signature,
            decrypt_receipt_signature
        ])
        .run(tauri::generate_context!())
        .expect("error while running Tauri application");
}
