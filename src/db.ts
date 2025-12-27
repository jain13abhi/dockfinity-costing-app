import type { AppSettings, Item } from './types'
import { supabase } from './supabase'

type BackupBlob = {
  items: Item[]
  settings: AppSettings
}

export function defaultSettings(): AppSettings {
  return {
    circleBaseRate: 170,
    circleAddPerKg: 5,
    circleExtraAddPerKg: 0,
    bagStandardKg: 80
  }
}

async function requireUser() {
  const { data, error } = await supabase.auth.getUser()
  if (error) throw error
  if (!data.user) throw new Error('Not logged in')
  return data.user
}

// ---------- AUTH ----------
export async function getSession() {
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  return data.session
}

export async function signInWithEmailOtp(email: string) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin }
  })
  if (error) throw error
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

// ---------- ITEMS ----------
export async function listItems(): Promise<Item[]> {
  const user = await requireUser()
  const { data, error } = await supabase
    .from('items')
    .select('data')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })

  if (error) throw error
  return (data || []).map((r: any) => r.data as Item)
}

export async function upsertItem(item: Item): Promise<void> {
  const user = await requireUser()
  const { error } = await supabase
    .from('items')
    .upsert({
      id: item.id,
      user_id: user.id,
      name: item.name,
      data: item
    })
  if (error) throw error
}

export async function deleteItem(id: string): Promise<void> {
  const user = await requireUser()
  const { error } = await supabase
    .from('items')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) throw error
}

// ---------- SETTINGS ----------
export async function getSettings(): Promise<AppSettings | null> {
  const user = await requireUser()
  const { data, error } = await supabase
    .from('settings')
    .select('data')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) throw error
  return data?.data ?? null
}

export async function setSettings(s: AppSettings): Promise<void> {
  const user = await requireUser()
  const { error } = await supabase
    .from('settings')
    .upsert({
      user_id: user.id,
      data: s
    })
  if (error) throw error
}

// ---------- BACKUP ----------
export async function exportAll(): Promise<BackupBlob> {
  const items = await listItems()
  const settings = (await getSettings()) || defaultSettings()
  return { items, settings }
}

export async function importAll(blob: BackupBlob): Promise<void> {
  const user = await requireUser()

  await setSettings(blob.settings || defaultSettings())

  const payload = (blob.items || []).map(it => ({
    id: it.id,
    user_id: user.id,
    name: it.name,
    data: it
  }))

  if (payload.length) {
    const { error } = await supabase.from('items').upsert(payload)
    if (error) throw error
  }
}