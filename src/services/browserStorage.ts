const STORAGE_NAME = "gold-pawn-pro-browser";
const STORAGE_VERSION = 1;
const DATABASE_STORE = "databases";
const KEY_STORE = "keys";
let storageConnection: Promise<IDBDatabase> | undefined;

export function browserStorage(): Promise<IDBDatabase> {
  if (!("indexedDB" in window)) {
    return Promise.reject(new Error("This browser does not support persistent IndexedDB storage."));
  }
  storageConnection ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(STORAGE_NAME, STORAGE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(DATABASE_STORE)) database.createObjectStore(DATABASE_STORE);
      if (!database.objectStoreNames.contains(KEY_STORE)) database.createObjectStore(KEY_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open browser storage."));
    request.onblocked = () => reject(new Error("Browser storage upgrade is blocked by another open app tab."));
  });
  return storageConnection;
}

export async function readBrowserValue<T>(storeName: string, key: IDBValidKey): Promise<T | undefined> {
  const database = await browserStorage();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, "readonly");
    const request = transaction.objectStore(storeName).get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error ?? new Error("Could not read browser storage."));
  });
}

export async function writeBrowserValue(storeName: string, key: IDBValidKey, value: unknown): Promise<void> {
  const database = await browserStorage();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).put(value, key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Could not save browser storage."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Browser storage write was aborted."));
  });
}
