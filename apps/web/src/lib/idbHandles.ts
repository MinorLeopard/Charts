// Lightweight IndexedDB helpers to store/restore FileSystemDirectoryHandle
// NOTE: Browsers require permissions; this may fail silently on some setups.


const DB_NAME = "watchlist-idb";
const STORE = "handles";


function openDB(): Promise<IDBDatabase> {
return new Promise((resolve, reject) => {
const req = indexedDB.open(DB_NAME, 1);
req.onupgradeneeded = () => {
const db = req.result;
if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
};
req.onsuccess = () => resolve(req.result);
req.onerror = () => reject(req.error);
});
}


export async function idbSetHandle(key: string, handle: FileSystemDirectoryHandle): Promise<void> {
const db = await openDB();
await new Promise<void>((resolve, reject) => {
const tx = db.transaction(STORE, "readwrite");
tx.objectStore(STORE).put(handle, key);
tx.oncomplete = () => resolve();
tx.onerror = () => reject(tx.error);
});
}


export async function idbGetHandle(key: string): Promise<FileSystemDirectoryHandle | undefined> {
const db = await openDB();
return await new Promise((resolve, reject) => {
const tx = db.transaction(STORE, "readonly");
const req = tx.objectStore(STORE).get(key);
req.onsuccess = () => resolve(req.result as FileSystemDirectoryHandle | undefined);
req.onerror = () => reject(req.error);
});
}