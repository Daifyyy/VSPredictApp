import { AsyncLocalStorage } from "node:async_hooks";

interface ApiUsageStore { calls: number }
const storage = new AsyncLocalStorage<ApiUsageStore>();

export function countApiCall() {
  const store = storage.getStore();
  if (store) store.calls++;
}

export async function withApiUsage<T>(work: () => Promise<T>): Promise<{ value: T; calls: number }> {
  const store: ApiUsageStore = { calls: 0 };
  const value = await storage.run(store, work);
  return { value, calls: store.calls };
}
