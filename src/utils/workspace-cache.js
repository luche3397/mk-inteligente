const DATABASE_NAME = 'workspace-inteligente';
const DATABASE_VERSION = 1;
const STORE_NAME = 'workspace-cache';

const openDatabase = () =>
  new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      resolve(null);
      return;
    }

    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'userId' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const runTransaction = async (mode, operation) => {
  const database = await openDatabase();
  if (!database) return null;

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    const request = operation(store);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => {
      database.close();
      reject(transaction.error);
    };
  });
};

export const loadWorkspaceCache = (userId) =>
  runTransaction('readonly', (store) => store.get(userId));

export const saveWorkspaceCache = (userId, state, pendingSync) =>
  runTransaction('readwrite', (store) =>
    store.put({
      userId,
      state,
      pendingSync,
      updatedAt: new Date().toISOString(),
    }),
  );

export const clearWorkspaceCache = (userId) =>
  runTransaction('readwrite', (store) => store.delete(userId));
