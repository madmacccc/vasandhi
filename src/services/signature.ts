import { invoke } from "@tauri-apps/api/core";
import { readBrowserValue, writeBrowserValue } from "./browserStorage";

const WEB_SIGNATURE_KEY = "receipt-signature-aes-gcm-v1";

function isTauri(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

function toBase64(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

async function browserSignatureKey(): Promise<CryptoKey> {
  let key = await readBrowserValue<CryptoKey>("keys", WEB_SIGNATURE_KEY);
  if (!key) {
    key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    await writeBrowserValue("keys", WEB_SIGNATURE_KEY, key);
  }
  return key;
}

export async function encryptSignature(signature: string): Promise<string> {
  if (isTauri()) return invoke<string>("encrypt_receipt_signature", { signature });
  if (!crypto.subtle) throw new Error("Secure browser cryptography requires HTTPS or localhost.");
  const key = await browserSignatureKey();
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    new TextEncoder().encode(signature),
  );
  return `web-v1.${toBase64(nonce)}.${toBase64(new Uint8Array(encrypted))}`;
}

export async function decryptSignature(ciphertext: string): Promise<string> {
  if (ciphertext.startsWith("v1.")) {
    return invoke<string>("decrypt_receipt_signature", { encryptedSignature: ciphertext });
  }
  const [version, encodedNonce, encodedCiphertext, extra] = ciphertext.split(".");
  if (version !== "web-v1" || !encodedNonce || !encodedCiphertext || extra) {
    throw new Error("Unsupported encrypted signature format.");
  }
  if (!crypto.subtle) throw new Error("Secure browser cryptography requires HTTPS or localhost.");
  const key = await browserSignatureKey();
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(encodedNonce) },
    key,
    fromBase64(encodedCiphertext),
  );
  return new TextDecoder().decode(decrypted);
}
