// App.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { AppSettings, Item } from '../types'
import { calculate } from '../calc'
import { makeId, seedItems, seedSettings } from '../seed'
import { supabase } from '../supabase'

type Tab = 'items' | 'calc' | 'backup'

function deepClone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x))
}

// fallback circle rate from settings (used only when item-level rate missing)
function fallbackCircleRate(settings: AppSettings): number {
  return settings.circleBaseRate + settings.circleAddPerKg + (settings.circleExtraAddPerKg || 0)
}

// YOUR RULE: backend always adds +3 to circle rate (box + cover) for calculation
const CIRCLE_RATE_AUTO_ADD = 3

export default function App() {
  const [tab, setTab] = useState<Tab>('calc')
  const [items, setItems] = useState<Item[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const [settings, setLocalSettings] = useState<AppSettings>(seedSettings)

  // Auth
  const [session, setSession] = useState<any>(null)
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string>('')

  // Debounce timers
  const settingsSaveTimer = useRef<number | null>(null)
  const lastSettingsToSave = useRef<AppSettings>(settings)

  const itemSaveTimer = useRef<number | null>(null)
  const lastItemToSave = useRef<Item | null>(null)

  // ===========================
  // Styles (simple design system)
  // ===========================
  const tokens = {
    bg: '#f6f7f9',
    card: '#ffffff',
    border: '#e5e7eb',
    text: '#111827',
    subtle: '#6b7280',
    danger: '#b00020',
    ok: '#156c2f',
    focus: '#111827'
  }

  const pageStyle: React.CSSProperties = {
    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
    padding: 16,
    maxWidth: 1200,
    margin: '0 auto',
    color: tokens.text
  }

  const shell: React.CSSProperties = {
    background: tokens.bg,
    minHeight: '100vh'
  }

  const card: React.CSSProperties = {
    border: `1px solid ${tokens.border}`,
    borderRadius: 14,
    padding: 14,
    background: tokens.card,
    boxShadow: '0 1px 2px rgba(0,0,0,0.04)'
  }

  const subtle: React.CSSProperties = { color: tokens.subtle }
  const danger: React.CSSProperties = { color: tokens.danger }

  const btnBase: React.CSSProperties = {
    padding: '9px 12px',
    borderRadius: 12,
    border: `1px solid ${tokens.border}`,
    background: '#fff',
    cursor: 'pointer',
    fontWeight: 600
  }

  const btnPrimary: React.CSSProperties = {
    ...btnBase,
    border: `1px solid ${tokens.focus}`,
    background: tokens.focus,
    color: '#fff'
  }

  const btnDanger: React.CSSProperties = {
    ...btnBase,
    border: '1px solid #f0b5b5',
    background: '#fff5f5',
    color: '#7a0b0b'
  }

  const inputBase: React.CSSProperties = {
    width: '100%',
    padding: '9px 10px',
    borderRadius: 12,
    border: `1px solid ${tokens.border}`,
    outline: 'none',
    background: '#fff'
  }

  const selectBase: React.CSSProperties = {
    ...inputBase,
    width: 'auto',
    minWidth: 280
  }

  const pillTabs: React.CSSProperties = {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
    alignItems: 'center'
  }

  const tabBtn = (active: boolean): React.CSSProperties => ({
    ...btnBase,
    background: active ? '#111827' : '#fff',
    color: active ? '#fff' : tokens.text,
    border: active ? '1px solid #111827' : `1px solid ${tokens.border}`
  })

  const disabledStyle = (isDisabled: boolean): React.CSSProperties =>
    isDisabled ? { opacity: 0.55, cursor: 'not-allowed' } : {}

  // ===========================
  // Auth bootstrap
  // ===========================
  useEffect(() => {
    let mounted = true
    ;(async () => {
      const { data } = await supabase.auth.getSession()
      if (!mounted) return
      setSession(data.session ?? null)
    })()

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s ?? null)
    })

    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [])

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (settingsSaveTimer.current) window.clearTimeout(settingsSaveTimer.current)
      if (itemSaveTimer.current) window.clearTimeout(itemSaveTimer.current)
    }
  }, [])

  // ===========================
  // Supabase helpers
  // ===========================
  async function refresh() {
    if (!session?.user?.id) return
    setBusy(true)
    setMsg('')

    const uid = session.user.id

    const settingsRes = await supabase
      .from('settings')
      .select('data')
      .eq('user_id', uid)
      .maybeSingle()

    if (settingsRes.error) {
      setBusy(false)
      setMsg(`Settings load error: ${settingsRes.error.message}`)
      return
    }

    const loadedSettings = (settingsRes.data?.data as AppSettings) ?? null
    const nextSettings = loadedSettings || seedSettings
    setLocalSettings(nextSettings)

    const itemsRes = await supabase
      .from('items')
      .select('id,name,data')
      .eq('user_id', uid)
      .order('updated_at', { ascending: false })

    if (itemsRes.error) {
      setBusy(false)
      setMsg(`Items load error: ${itemsRes.error.message}`)
      return
    }

    const loadedItems: Item[] = (itemsRes.data || []).map((r: any) => ({
      ...(r.data as Item),
      id: r.id,
      name: r.name
    }))

    // Seed if empty (one-time)
    if (loadedItems.length === 0) {
      for (const it of seedItems) {
        const insertRes = await supabase.from('items').upsert({
          user_id: uid,
          id: it.id,
          name: it.name,
          data: it
        })
        if (insertRes.error) {
          setBusy(false)
          setMsg(`Seed items error: ${insertRes.error.message}`)
          return
        }
      }

      if (!loadedSettings) {
        const up = await supabase.from('settings').upsert({
          user_id: uid,
          data: seedSettings
        })
        if (up.error) {
          setBusy(false)
          setMsg(`Seed settings error: ${up.error.message}`)
          return
        }
      }

      setBusy(false)
      await refresh()
      return
    }

    setItems(loadedItems)

    const firstId = loadedItems[0]?.id || ''
    setSelectedId(prev => {
      if (!prev) return firstId
      if (!loadedItems.find(i => i.id === prev)) return firstId
      return prev
    })

    setBusy(false)
  }

  useEffect(() => {
    if (session?.user?.id) void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id])

  async function upsertItemRemote(it: Item) {
    if (!session?.user?.id) return
    const uid = session.user.id
    const res = await supabase.from('items').upsert({
      user_id: uid,
      id: it.id,
      name: it.name,
      data: it
    })
    if (res.error) throw new Error(res.error.message)
  }

  async function deleteItemRemote(id: string) {
    if (!session?.user?.id) return
    const uid = session.user.id
    const res = await supabase.from('items').delete().eq('user_id', uid).eq('id', id)
    if (res.error) throw new Error(res.error.message)
  }

  async function setSettingsRemote(s: AppSettings) {
    if (!session?.user?.id) return
    const uid = session.user.id
    const res = await supabase.from('settings').upsert({
      user_id: uid,
      data: s
    })
    if (res.error) throw new Error(res.error.message)
  }

  // ===========================
  // Derived
  // ===========================
  const circleFallback = useMemo(() => fallbackCircleRate(settings), [settings])

  const selected = useMemo(() => items.find(i => i.id === selectedId) || null, [items, selectedId])

  // Apply your rule: circle rate used in calc = (stored rate or fallback) + 3
  const selectedForCalc = useMemo(() => {
    if (!selected) return null

    const boxStored = (selected.box as any).circleRatePerKg
    const coverStored = (selected.cover as any).circleRatePerKg

    const boxBase =
      typeof boxStored === 'number' && isFinite(boxStored) && boxStored > 0 ? boxStored : circleFallback
    const coverBase =
      typeof coverStored === 'number' && isFinite(coverStored) && coverStored > 0 ? coverStored : circleFallback

    return {
      ...selected,
      box: { ...selected.box, circleRatePerKg: boxBase + CIRCLE_RATE_AUTO_ADD },
      cover: { ...selected.cover, circleRatePerKg: coverBase + CIRCLE_RATE_AUTO_ADD }
    } as Item
  }, [selected, circleFallback])

  const result = useMemo(() => (selectedForCalc ? calculate(selectedForCalc, settings) : null), [selectedForCalc, settings])

  // ===========================
  // UI actions
  // ===========================
  async function onDelete(id: string) {
    const ok = window.confirm('Delete this item? This cannot be undone.')
    if (!ok) return

    try {
      setBusy(true)
      setMsg('')
      await deleteItemRemote(id)

      setItems(prev => {
        const next = prev.filter(x => x.id !== id)
        if (selectedId === id) setSelectedId(next[0]?.id || '')
        return next
      })
    } catch (e: any) {
      setMsg(e.message || 'Delete failed')
    } finally {
      setBusy(false)
    }
  }

  async function onClone() {
    if (!selected) return
    try {
      setBusy(true)
      setMsg('')

      const copy = deepClone(selected)
      copy.id = makeId()
      copy.name = selected.name + ' (copy)'

      await upsertItemRemote(copy)
      setItems(prev => [copy, ...prev])
      setSelectedId(copy.id)
      setTab('items')
    } catch (e: any) {
      setMsg(e.message || 'Clone failed')
    } finally {
      setBusy(false)
    }
  }

  async function onSaveItem(it: Item) {
    try {
      setBusy(true)
      setMsg('')
      await upsertItemRemote(it)
      setItems(prev => prev.map(x => (x.id === it.id ? it : x)))
    } catch (e: any) {
      setMsg(e.message || 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  // Debounced settings save (only bag kg used now)
  function onSaveSettings(next: AppSettings) {
    setLocalSettings(next)
    lastSettingsToSave.current = next

    if (settingsSaveTimer.current) window.clearTimeout(settingsSaveTimer.current)
    settingsSaveTimer.current = window.setTimeout(async () => {
      try {
        await setSettingsRemote(lastSettingsToSave.current)
      } catch (e: any) {
        setMsg(e.message || 'Settings save failed')
      }
    }, 350)
  }

  // Debounced item save (for calculator box/cover circle rate inputs)
  function quickSaveItem(next: Item) {
    setItems(prev => prev.map(x => (x.id === next.id ? next : x)))
    lastItemToSave.current = next

    if (itemSaveTimer.current) window.clearTimeout(itemSaveTimer.current)
    itemSaveTimer.current = window.setTimeout(async () => {
      try {
        if (lastItemToSave.current) await upsertItemRemote(lastItemToSave.current)
      } catch (e: any) {
        setMsg(e.message || 'Item save failed')
      }
    }, 400)
  }

  async function doExport() {
    const blob = { settings, items }
    const text = JSON.stringify(blob, null, 2)
    const file = new Blob([text], { type: 'application/json' })
    const url = URL.createObjectURL(file)
    const a = document.createElement('a')
    a.href = url
    a.download = 'dockfinity_costing_backup.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function doImport(file: File) {
    try {
      setBusy(true)
      setMsg('')

      const text = await file.text()
      const blob = JSON.parse(text) as { settings?: AppSettings; items?: Item[] }

      if (blob.settings) {
        setLocalSettings(blob.settings)
        await setSettingsRemote(blob.settings)
      }

      if (blob.items?.length) {
        for (const it of blob.items) await upsertItemRemote(it)
      }

      await refresh()
      alert('Imported successfully')
    } catch (e: any) {
      setMsg(e.message || 'Import failed')
    } finally {
      setBusy(false)
    }
  }

  // ===========================
  // Auth actions
  // ===========================
  async function doAuth() {
    setMsg('')
    setBusy(true)
    try {
      if (!authEmail || !authPassword) throw new Error('Email + password required')

      if (authMode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({
          email: authEmail,
          password: authPassword
        })
        if (error) throw new Error(error.message)
      } else {
        const { error } = await supabase.auth.signUp({
          email: authEmail,
          password: authPassword
        })
        if (error) throw new Error(error.message)
        setMsg('Signup done. If email confirmation is enabled, verify email and sign in.')
      }
    } catch (e: any) {
      setMsg(e.message || 'Auth failed')
    } finally {
      setBusy(false)
    }
  }

  async function doLogout() {
    setBusy(true)
    setMsg('')
    await supabase.auth.signOut()
    setItems([])
    setSelectedId('')
    setBusy(false)
  }

  // ===========================
  // Render (Auth screen)
  // ===========================
  if (!session?.user?.id) {
    return (
      <div style={shell}>
        <div style={{ ...pageStyle, maxWidth: 520, paddingTop: 28 }}>
          <div style={{ marginBottom: 12 }}>
            <h2 style={{ margin: 0, letterSpacing: -0.2 }}>Dockfinity Costing</h2>
            <p style={{ marginTop: 6, ...subtle }}>Login required (Supabase). Data will be saved in cloud.</p>
          </div>

          <div style={card}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <button style={tabBtn(authMode === 'signin')} onClick={() => setAuthMode('signin')} disabled={busy}>
                Sign in
              </button>
              <button style={tabBtn(authMode === 'signup')} onClick={() => setAuthMode('signup')} disabled={busy}>
                Sign up
              </button>
            </div>

            <label style={{ display: 'grid', gap: 6, marginBottom: 10 }}>
              <span style={{ fontWeight: 600 }}>Email</span>
              <input
                style={inputBase}
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                placeholder="you@domain.com"
                autoComplete="email"
              />
            </label>

            <label style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
              <span style={{ fontWeight: 600 }}>Password</span>
              <input
                style={inputBase}
                type="password"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete={authMode === 'signin' ? 'current-password' : 'new-password'}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void doAuth()
                }}
              />
            </label>

            <button style={{ ...btnPrimary, width: '100%', ...disabledStyle(busy) }} onClick={doAuth} disabled={busy}>
              {busy ? 'Please wait…' : authMode === 'signin' ? 'Sign in' : 'Sign up'}
            </button>

            {msg && <p style={{ marginTop: 12, ...danger }}>{msg}</p>}
          </div>
        </div>
      </div>
    )
  }

  // ===========================
  // Render (Main app)
  // ===========================
  const storedBoxRate = selected ? ((selected.box as any).circleRatePerKg as number | undefined) : undefined
  const storedCoverRate = selected ? ((selected.cover as any).circleRatePerKg as number | undefined) : undefined

  const boxRateInput =
    typeof storedBoxRate === 'number' && isFinite(storedBoxRate) && storedBoxRate > 0 ? storedBoxRate : circleFallback
  const coverRateInput =
    typeof storedCoverRate === 'number' && isFinite(storedCoverRate) && storedCoverRate > 0 ? storedCoverRate : circleFallback

  return (
    <div style={shell}>
      <div style={pageStyle}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <h2 style={{ margin: 0, letterSpacing: -0.2 }}>Dockfinity Costing</h2>
            <p style={{ marginTop: 6, ...subtle }}>
              Calculator uses: (Box circle rate + {CIRCLE_RATE_AUTO_ADD}) and (Cover circle rate + {CIRCLE_RATE_AUTO_ADD}).
            </p>
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ ...subtle, fontWeight: 600 }}>{session.user.email}</span>
            <button style={{ ...btnBase, ...disabledStyle(busy) }} onClick={() => void refresh()} disabled={busy}>
              Sync
            </button>
            <button style={{ ...btnBase, ...disabledStyle(busy) }} onClick={doLogout} disabled={busy}>
              Logout
            </button>
          </div>
        </div>

        {/* Global status */}
        {msg && (
          <div style={{ ...card, borderColor: '#f1c6c6', background: '#fff7f7', marginBottom: 12 }}>
            <div style={{ ...danger, fontWeight: 700, marginBottom: 6 }}>Action needed</div>
            <div style={danger}>{msg}</div>
          </div>
        )}

        {busy && (
          <div style={{ ...card, marginBottom: 12 }}>
            <div style={subtle}>Working…</div>
          </div>
        )}

        {/* Tabs */}
        <div style={{ ...pillTabs, marginBottom: 12 }}>
          <button style={tabBtn(tab === 'calc')} onClick={() => setTab('calc')} disabled={busy}>
            Calculator
          </button>
          <button style={tabBtn(tab === 'items')} onClick={() => setTab('items')} disabled={busy}>
            Items
          </button>
          <button style={tabBtn(tab === 'backup')} onClick={() => setTab('backup')} disabled={busy}>
            Backup
          </button>
          <span style={{ flex: 1 }} />
          <button style={{ ...btnBase, ...disabledStyle(!selected || busy) }} onClick={onClone} disabled={!selected || busy}>
            Clone Selected Item
          </button>
        </div>

        {/* Calculator */}
        {tab === 'calc' && (
          <div style={card}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontWeight: 700 }}>Item</div>
                <select style={selectBase} value={selectedId} onChange={(e) => setSelectedId(e.target.value)} disabled={busy}>
                  {items.map(it => (
                    <option key={it.id} value={it.id}>
                      {it.name}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div style={{ display: 'grid', gap: 6 }}>
                  <div style={{ fontWeight: 700 }}>Box circle rate</div>
                  <input
                    style={{ ...inputBase, width: 140 }}
                    type="number"
                    value={boxRateInput}
                    disabled={!selected || busy}
                    onChange={(e) => {
                      if (!selected) return
                      const n = Number(e.target.value)
                      const next: Item = { ...selected, box: { ...selected.box, circleRatePerKg: n } }
                      quickSaveItem(next)
                    }}
                  />
                  <div style={{ ...subtle, fontSize: 12 }}>Used as ₹{boxRateInput + CIRCLE_RATE_AUTO_ADD}/kg</div>
                </div>

                <div style={{ display: 'grid', gap: 6 }}>
                  <div style={{ fontWeight: 700 }}>Cover circle rate</div>
                  <input
                    style={{ ...inputBase, width: 140 }}
                    type="number"
                    value={coverRateInput}
                    disabled={!selected || busy}
                    onChange={(e) => {
                      if (!selected) return
                      const n = Number(e.target.value)
                      const next: Item = { ...selected, cover: { ...selected.cover, circleRatePerKg: n } }
                      quickSaveItem(next)
                    }}
                  />
                  <div style={{ ...subtle, fontSize: 12 }}>Used as ₹{coverRateInput + CIRCLE_RATE_AUTO_ADD}/kg</div>
                </div>

                <div style={{ display: 'grid', gap: 6 }}>
                  <div style={{ fontWeight: 700 }}>Bag Kg</div>
                  <input
                    style={{ ...inputBase, width: 110 }}
                    type="number"
                    value={settings.bagStandardKg}
                    onChange={(e) => onSaveSettings({ ...settings, bagStandardKg: Number(e.target.value) })}
                  />
                  <div style={{ ...subtle, fontSize: 12 }}>Standard bag weight</div>
                </div>
              </div>
            </div>

            {!result ? (
              <p style={{ marginTop: 12, ...subtle }}>Select an item.</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 14 }}>
                <div style={{ ...card, boxShadow: 'none' }}>
                  <h3 style={{ marginTop: 0, marginBottom: 10 }}>Weights (per pc)</h3>
                  <div style={{ display: 'grid', gap: 6 }}>
                    <KV k="Box" v={`${result.perPc.boxG} g`} />
                    <KV k="Cover" v={`${result.perPc.coverG} g`} />
                    <KV k="Kunda" v={`${result.perPc.kundaG} g`} />
                    <KV k="Polybag" v={`${result.perPc.polybagG} g`} />
                    <KV k="Pipe" v={`${result.perPc.pipeG} g`} />
                    <div style={{ height: 1, background: tokens.border, margin: '6px 0' }} />
                    <KV k="Total packed" v={`${result.perPc.totalPackedG} g`} strong />
                  </div>
                  <div style={{ marginTop: 12, ...subtle }}>
                    PCS per {settings.bagStandardKg}kg bag: <b style={{ color: tokens.text }}>{result.pcsPerBag}</b>
                  </div>
                </div>

                <div style={{ ...card, boxShadow: 'none' }}>
                  <h3 style={{ marginTop: 0, marginBottom: 10 }}>Rates</h3>
                  <div style={{ display: 'grid', gap: 6 }}>
                    <KV k="Per kg" v={`₹${result.perKgRate}`} strong />
                    <KV k="Per pc" v={`₹${result.perPcRate}`} strong />
                  </div>

                  <details style={{ marginTop: 12 }}>
                    <summary style={{ cursor: 'pointer', fontWeight: 700, color: tokens.text }}>Debug cost split</summary>
                    <pre
                      style={{
                        background: '#f3f4f6',
                        padding: 12,
                        borderRadius: 12,
                        overflow: 'auto',
                        marginTop: 10,
                        border: `1px solid ${tokens.border}`
                      }}
                    >
{JSON.stringify(result.debug, null, 2)}
                    </pre>
                  </details>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Items */}
        {tab === 'items' && (
          <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 14 }}>
            <div style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                <h3 style={{ marginTop: 0, marginBottom: 10 }}>Items</h3>
                <div style={{ ...subtle, fontSize: 12 }}>{items.length} total</div>
              </div>

              {items.length === 0 ? (
                <div style={{ ...subtle }}>No items yet. Try Sync or re-login.</div>
              ) : (
                <div style={{ display: 'grid', gap: 8 }}>
                  {items.map(it => {
                    const active = it.id === selectedId
                    return (
                      <div
                        key={it.id}
                        style={{
                          padding: 10,
                          borderRadius: 12,
                          border: active ? `1px solid ${tokens.border}` : `1px solid transparent`,
                          background: active ? '#f3f4f6' : 'transparent'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                          <button
                            style={{
                              ...btnBase,
                              flex: 1,
                              textAlign: 'left',
                              background: active ? '#ffffff' : '#ffffff',
                              border: `1px solid ${tokens.border}`,
                              ...disabledStyle(busy)
                            }}
                            onClick={() => setSelectedId(it.id)}
                            disabled={busy}
                          >
                            {it.name}
                          </button>
                          <button style={{ ...btnDanger, ...disabledStyle(busy) }} onClick={() => void onDelete(it.id)} disabled={busy}>
                            Del
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div style={card}>
              <h3 style={{ marginTop: 0 }}>Editor</h3>
              {!selected ? <p style={subtle}>Select an item.</p> : <ItemEditor item={selected} onSave={onSaveItem} busy={busy} inputStyle={inputBase} tokens={tokens} />}
            </div>
          </div>
        )}

        {/* Backup */}
        {tab === 'backup' && (
          <div style={card}>
            <h3 style={{ marginTop: 0 }}>Backup / Restore</h3>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <button style={{ ...btnBase, ...disabledStyle(busy) }} onClick={doExport} disabled={busy}>
                Export JSON
              </button>

              <label
                style={{
                  ...btnBase,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  cursor: busy ? 'not-allowed' : 'pointer',
                  opacity: busy ? 0.55 : 1
                }}
              >
                Import JSON
                <input
                  type="file"
                  accept="application/json"
                  style={{ display: 'none' }}
                  disabled={busy}
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) void doImport(f)
                    e.currentTarget.value = ''
                  }}
                />
              </label>
            </div>

            <p style={{ ...subtle, marginTop: 10 }}>
              Export/Import still works. Cloud is primary storage now.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function KV({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
      <div style={{ color: '#6b7280' }}>{k}</div>
      <div style={{ fontWeight: strong ? 800 : 700 }}>{v}</div>
    </div>
  )
}

function Num({
  label,
  value,
  onChange,
  step = 0.01,
  inputStyle
}: {
  label: string
  value: number
  onChange: (n: number) => void
  step?: number
  inputStyle: React.CSSProperties
}) {
  return (
    <label style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 10, alignItems: 'center', marginBottom: 10 }}>
      <span style={{ color: '#374151', fontWeight: 600 }}>{label}</span>
      <input style={inputStyle} type="number" step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  )
}

function ItemEditor({
  item,
  onSave,
  busy,
  inputStyle,
  tokens
}: {
  item: Item
  onSave: (it: Item) => Promise<void>
  busy: boolean
  inputStyle: React.CSSProperties
  tokens: { danger: string; ok: string; subtle: string; border: string }
}) {
  const [it, setIt] = useState<Item>(item)
  const [localMsg, setLocalMsg] = useState<string>('')

  useEffect(() => {
    setIt(item)
    setLocalMsg('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id])

  function ensureInduction(part: Item['box']): Item['box'] {
    if (part.induction) return part
    return { ...part, induction: { enabled: false, ratePerKg: 10 } }
  }

  const box = ensureInduction(it.box)
  const cover = ensureInduction(it.cover)

  async function saveNow() {
    setLocalMsg('')
    try {
      const next: Item = { ...it, box, cover }
      await onSave(next)
      setLocalMsg('Saved.')
      setIt(next)
    } catch (e: any) {
      setLocalMsg(e.message || 'Save failed')
    }
  }

  const sectionTitle: React.CSSProperties = { marginTop: 18, marginBottom: 10, fontWeight: 900, letterSpacing: -0.1 }

  return (
    <div>
      {localMsg && (
        <div
          style={{
            marginTop: 0,
            marginBottom: 12,
            borderRadius: 12,
            padding: '10px 12px',
            border: `1px solid ${localMsg === 'Saved.' ? '#bfe3c9' : '#f1c6c6'}`,
            background: localMsg === 'Saved.' ? '#f3fbf5' : '#fff7f7',
            color: localMsg === 'Saved.' ? tokens.ok : tokens.danger,
            fontWeight: 700
          }}
        >
          {localMsg}
        </div>
      )}

      <label style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
        <span style={{ color: '#374151', fontWeight: 800 }}>Item name</span>
        <input
          style={inputStyle}
          value={it.name}
          onChange={(e) => setIt({ ...it, name: e.target.value })}
        />
      </label>

      <div style={sectionTitle}>Box</div>
      <Num inputStyle={inputStyle} label="Box circle (inch)" value={box.circleSizeIn} onChange={(n) => setIt({ ...it, box: { ...box, circleSizeIn: n } })} step={0.01} />
      <Num inputStyle={inputStyle} label="Box thickness (mm)" value={box.thicknessMm} onChange={(n) => setIt({ ...it, box: { ...box, thicknessMm: n } })} step={0.01} />
      <Num inputStyle={inputStyle} label="Box press rate (₹/kg)" value={box.press.ratePerKg} onChange={(n) => setIt({ ...it, box: { ...box, press: { ...box.press, ratePerKg: n } } })} step={1} />
      <Num inputStyle={inputStyle} label="Box actual wastage % (weight)" value={box.press.actualWastagePct} onChange={(n) => setIt({ ...it, box: { ...box, press: { ...box.press, actualWastagePct: n } } })} step={0.1} />
      <Num inputStyle={inputStyle} label="Box job wastage % (kept)" value={box.press.jobWastagePct} onChange={(n) => setIt({ ...it, box: { ...box, press: { ...box.press, jobWastagePct: n } } })} step={0.1} />
      <Num inputStyle={inputStyle} label="Box tut % (scrap)" value={box.press.tutPct} onChange={(n) => setIt({ ...it, box: { ...box, press: { ...box.press, tutPct: n } } })} step={0.1} />

      <label style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
        <input
          type="checkbox"
          checked={!!box.induction?.enabled}
          onChange={(e) =>
            setIt({ ...it, box: { ...box, induction: { enabled: e.target.checked, ratePerKg: box.induction?.ratePerKg ?? 10 } } })
          }
        />
        <span style={{ fontWeight: 700, color: '#374151' }}>Enable Induction (Box)</span>
      </label>
      <Num
        inputStyle={inputStyle}
        label="Induction rate (Box) ₹/kg"
        value={box.induction?.ratePerKg ?? 10}
        onChange={(n) => setIt({ ...it, box: { ...box, induction: { enabled: box.induction?.enabled ?? false, ratePerKg: n } } })}
        step={1}
      />

      <div style={sectionTitle}>Cover</div>
      <Num inputStyle={inputStyle} label="Cover circle (inch)" value={cover.circleSizeIn} onChange={(n) => setIt({ ...it, cover: { ...cover, circleSizeIn: n } })} step={0.01} />
      <Num inputStyle={inputStyle} label="Cover thickness (mm)" value={cover.thicknessMm} onChange={(n) => setIt({ ...it, cover: { ...cover, thicknessMm: n } })} step={0.01} />
      <Num inputStyle={inputStyle} label="Cover press rate (₹/kg)" value={cover.press.ratePerKg} onChange={(n) => setIt({ ...it, cover: { ...cover, press: { ...cover.press, ratePerKg: n } } })} step={1} />
      <Num inputStyle={inputStyle} label="Cover actual wastage % (weight)" value={cover.press.actualWastagePct} onChange={(n) => setIt({ ...it, cover: { ...cover, press: { ...cover.press, actualWastagePct: n } } })} step={0.1} />
      <Num inputStyle={inputStyle} label="Cover job wastage % (kept)" value={cover.press.jobWastagePct} onChange={(n) => setIt({ ...it, cover: { ...cover, press: { ...cover.press, jobWastagePct: n } } })} step={0.1} />
      <Num inputStyle={inputStyle} label="Cover tut % (scrap)" value={cover.press.tutPct} onChange={(n) => setIt({ ...it, cover: { ...cover, press: { ...cover.press, tutPct: n } } })} step={0.1} />

      <label style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
        <input
          type="checkbox"
          checked={!!cover.induction?.enabled}
          onChange={(e) =>
            setIt({ ...it, cover: { ...cover, induction: { enabled: e.target.checked, ratePerKg: cover.induction?.ratePerKg ?? 10 } } })
          }
        />
        <span style={{ fontWeight: 700, color: '#374151' }}>Enable Induction (Cover)</span>
      </label>
      <Num
        inputStyle={inputStyle}
        label="Induction rate (Cover) ₹/kg"
        value={cover.induction?.ratePerKg ?? 10}
        onChange={(n) => setIt({ ...it, cover: { ...cover, induction: { enabled: cover.induction?.enabled ?? false, ratePerKg: n } } })}
        step={1}
      />

      <div style={sectionTitle}>Polish (shared)</div>
      <Num inputStyle={inputStyle} label="Polish rate (₹/kg)" value={it.polish.ratePerKg} onChange={(n) => setIt({ ...it, polish: { ...it.polish, ratePerKg: n } })} step={1} />
      <Num inputStyle={inputStyle} label="Polish wastage % (weight)" value={it.polish.wastagePct} onChange={(n) => setIt({ ...it, polish: { ...it.polish, wastagePct: n } })} step={0.1} />
      <Num inputStyle={inputStyle} label="Polish tut % (scrap)" value={it.polish.tutPct} onChange={(n) => setIt({ ...it, polish: { ...it.polish, tutPct: n } })} step={0.1} />

      <div style={sectionTitle}>Packing</div>
      <Num inputStyle={inputStyle} label="Packing rate (₹/kg)" value={it.packing.packingRatePerKg} onChange={(n) => setIt({ ...it, packing: { ...it.packing, packingRatePerKg: n } })} step={1} />
      <Num inputStyle={inputStyle} label="Packing tut % (scrap)" value={it.packing.tutPct} onChange={(n) => setIt({ ...it, packing: { ...it.packing, tutPct: n } })} step={0.1} />

      <div style={sectionTitle}>Kunda</div>
      <label style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
        <input type="checkbox" checked={it.kunda.enabled} onChange={(e) => setIt({ ...it, kunda: { ...it.kunda, enabled: e.target.checked } })} />
        <span style={{ fontWeight: 700, color: '#374151' }}>Enable kunda</span>
      </label>
      <Num inputStyle={inputStyle} label="Kunda weight (g)" value={it.kunda.weightG} onChange={(n) => setIt({ ...it, kunda: { ...it.kunda, weightG: n } })} step={1} />
      <Num inputStyle={inputStyle} label="Kunda rate (₹/kg)" value={it.kunda.ratePerKg} onChange={(n) => setIt({ ...it, kunda: { ...it.kunda, ratePerKg: n } })} step={1} />

      <div style={sectionTitle}>Bag (polybag + pipe)</div>
      <Num inputStyle={inputStyle} label="Polybag size (inch)" value={it.bagProfile.polybag.sizeIn} onChange={(n) => setIt({ ...it, bagProfile: { ...it.bagProfile, polybag: { ...it.bagProfile.polybag, sizeIn: n } } })} step={1} />
      <Num inputStyle={inputStyle} label="Polybag gauge" value={it.bagProfile.polybag.gauge} onChange={(n) => setIt({ ...it, bagProfile: { ...it.bagProfile, polybag: { ...it.bagProfile.polybag, gauge: n } } })} step={1} />
      <Num inputStyle={inputStyle} label="Polybag rate (₹/kg)" value={it.bagProfile.polybag.ratePerKg} onChange={(n) => setIt({ ...it, bagProfile: { ...it.bagProfile, polybag: { ...it.bagProfile.polybag, ratePerKg: n } } })} step={1} />

      <Num inputStyle={inputStyle} label="Pipe width (inch)" value={it.bagProfile.pipe.widthIn} onChange={(n) => setIt({ ...it, bagProfile: { ...it.bagProfile, pipe: { ...it.bagProfile.pipe, widthIn: n } } })} step={1} />
      <Num inputStyle={inputStyle} label="Pipe length (inch)" value={it.bagProfile.pipe.lengthIn} onChange={(n) => setIt({ ...it, bagProfile: { ...it.bagProfile, pipe: { ...it.bagProfile.pipe, lengthIn: n } } })} step={1} />
      <Num inputStyle={inputStyle} label="Pipe gauge" value={it.bagProfile.pipe.gauge} onChange={(n) => setIt({ ...it, bagProfile: { ...it.bagProfile, pipe: { ...it.bagProfile.pipe, gauge: n } } })} step={1} />
      <Num inputStyle={inputStyle} label="PCS per pipe" value={it.bagProfile.pipe.pcsPerPipe} onChange={(n) => setIt({ ...it, bagProfile: { ...it.bagProfile, pipe: { ...it.bagProfile.pipe, pcsPerPipe: n } } })} step={1} />
      <Num inputStyle={inputStyle} label="Pipe rate (₹/kg)" value={it.bagProfile.pipe.ratePerKg} onChange={(n) => setIt({ ...it, bagProfile: { ...it.bagProfile, pipe: { ...it.bagProfile.pipe, ratePerKg: n } } })} step={1} />

      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        <button
          onClick={() => void saveNow()}
          disabled={busy}
          style={{
            padding: '10px 12px',
            borderRadius: 12,
            border: '1px solid #111',
            background: '#111',
            color: '#fff',
            cursor: busy ? 'not-allowed' : 'pointer',
            fontWeight: 800,
            opacity: busy ? 0.6 : 1
          }}
        >
          {busy ? 'Saving…' : 'Save'}
        </button>

        <button
          onClick={() => setIt(item)}
          disabled={busy}
          style={{
            padding: '10px 12px',
            borderRadius: 12,
            border: `1px solid ${tokens.border}`,
            background: '#fff',
            cursor: busy ? 'not-allowed' : 'pointer',
            fontWeight: 800,
            opacity: busy ? 0.6 : 1
          }}
        >
          Reset
        </button>
      </div>
    </div>
  )
}