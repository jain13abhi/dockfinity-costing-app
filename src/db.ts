import { openDB } from 'idb'
import type { Item, AppSettings } from './types'

const DB_NAME = 'dockfinity_costing_local'
const DB_VERSION = 1
const STORE_ITEMS = 'items'
const STORE_SETTINGS = 'settings'

export const db = openDB(DB_NAME, DB_VERSION, {
  upgrade(db) {
    if (!db.objectStoreNames.contains(STORE_ITEMS)) {
      db.createObjectStore(STORE_ITEMS, { keyPath: 'id' })
    }
    if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
      db.createObjectStore(STORE_SETTINGS)
    }
  }
})

export async function listItems(): Promise<Item[]> {
  const d = await db
  return (await d.getAll(STORE_ITEMS)) as Item[]
}

export async function upsertItem(item: Item): Promise<void> {
  const d = await db
  await d.put(STORE_ITEMS, item)
}

export async function deleteItem(id: string): Promise<void> {
  const d = await db
  await d.delete(STORE_ITEMS, id)
}

export async function getSettings(): Promise<AppSettings | null> {
  const d = await db
  return (await d.get(STORE_SETTINGS, 'app')) as AppSettings | null
}

export async function setSettings(s: AppSettings): Promise<void> {
  const d = await db
  await d.put(STORE_SETTINGS, s, 'app')
}

export async function exportAll(): Promise<{ version: 1; items: Item[]; settings: AppSettings }> {
  const items = await listItems()
  const settings = (await getSettings()) || defaultSettings()
  return { version: 1, items, settings }
}

export async function importAll(blob: any): Promise<void> {
  if (!blob || blob.version !== 1 || !Array.isArray(blob.items) || !blob.settings) {
    throw new Error('Invalid backup file')
  }
  const d = await db
  const tx1 = d.transaction(STORE_ITEMS, 'readwrite')
  await tx1.store.clear()
  for (const it of blob.items) await tx1.store.put(it)
  await tx1.done

  await setSettings(blob.settings as AppSettings)
}

export function defaultSettings(): AppSettings {
  return {
    circleBaseRate: 170,
    circleAddPerKg: 5,
    circleExtraAddPerKg: 0,
    bagStandardKg: 80
  }
}
