// App.tsx
import { useEffect, useMemo, useState } from 'react'
import type { AppSettings, Item } from '../types'
import { calculate } from '../calc'
import { makeId, seedItems, seedSettings } from '../seed'
import { supabase } from '../supabase'

type Tab = 'items' | 'calc' | 'backup'
function deepClone<T>(x: T): T { return JSON.parse(JSON.stringify(x)) }

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

  // ===========================
  // Supabase data helpers
  // ===========================
  async function refresh() {
    if (!session?.user?.id) return
    setBusy(true)
    setMsg('')

    const uid = session.user.id

    // settings
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
    setLocalSettings(loadedSettings || seedSettings)

    // items
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

    // Seed if empty
    if (loadedItems.length === 0) {
      // seed items
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

      // seed settings (only if missing)
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

      // reload after seeding
      setBusy(false)
      await refresh()
      return
    }

    setItems(loadedItems)

    // selection safety
    if (loadedItems.length && !selectedId) setSelectedId(loadedItems[0].id)
    if (loadedItems.length && selectedId && !loadedItems.find(i => i.id === selectedId)) setSelectedId(loadedItems[0].id)

    setBusy(false)
  }

  useEffect(() => {
    if (session?.user?.id) void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id])

  async function upsertItem(it: Item) {
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

  async function deleteItem(id: string) {
    if (!session?.user?.id) return
    const uid = session.user.id
    const res = await supabase.from('items').delete().eq('user_id', uid).eq('id', id)
    if (res.error) throw new Error(res.error.message)
  }

  async function setSettings(s: AppSettings) {
    if (!session?.user?.id) return
    const uid = session.user.id
    const res = await supabase.from('settings').upsert({
      user_id: uid,
      data: s
    })
    if (res.error) throw new Error(res.error.message)
  }

  // ===========================
  // UI actions
  // ===========================
  const selected = useMemo(() => items.find(i => i.id === selectedId) || null, [items, selectedId])
  const result = useMemo(() => selected ? calculate(selected, settings) : null, [selected, settings])

  async function onDelete(id: string) {
    try {
      setBusy(true)
      await deleteItem(id)
      await refresh()
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
      const copy = deepClone(selected)
      copy.id = makeId()
      copy.name = selected.name + ' (copy)'
      await upsertItem(copy)
      await refresh()
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
      await upsertItem(it)
      await refresh()
    } catch (e: any) {
      setMsg(e.message || 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  // IMPORTANT: don’t refresh on every settings keypress (keeps UI stable)
  async function onSaveSettings(s: AppSettings) {
    try {
      setLocalSettings(s) // optimistic UI
      await setSettings(s)
    } catch (e: any) {
      setMsg(e.message || 'Settings save failed')
    }
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
      const text = await file.text()
      const blob = JSON.parse(text) as { settings?: AppSettings; items?: Item[] }
      if (blob.settings) {
        await setSettings(blob.settings)
        setLocalSettings(blob.settings)
      }
      if (blob.items?.length) {
        for (const it of blob.items) await upsertItem(it)
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
  // Render
  // ===========================
  if (!session?.user?.id) {
    return (
      <div style={{ fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial', padding: 16, maxWidth: 520, margin: '0 auto' }}>
        <h2 style={{ margin: 0 }}>Dockfinity Costing</h2>
        <p style={{ marginTop: 6, color: '#444' }}>Login required (Supabase). Data will be saved in cloud.</p>

        <div style={{ border: '1px solid #ddd', borderRadius: 10, padding: 12, marginTop: 12 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <button onClick={() => setAuthMode('signin')} disabled={authMode === 'signin'}>Sign in</button>
            <button onClick={() => setAuthMode('signup')} disabled={authMode === 'signup'}>Sign up</button>
          </div>

          <label style={{ display: 'grid', gap: 6, marginBottom: 10 }}>
            <span>Email</span>
            <input value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} placeholder="you@domain.com" />
          </label>

          <label style={{ display: 'grid', gap: 6, marginBottom: 10 }}>
            <span>Password</span>
            <input type="password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} placeholder="••••••••" />
          </label>

          <button onClick={doAuth} disabled={busy} style={{ width: '100%' }}>
            {busy ? 'Please wait…' : (authMode === 'signin' ? 'Sign in' : 'Sign up')}
          </button>

          {msg && <p style={{ marginTop: 10, color: '#b00020' }}>{msg}</p>}
        </div>
      </div>
    )
  }

  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial', padding: 16, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0 }}>Dockfinity Costing</h2>
          <p style={{ marginTop: 6, color: '#444' }}>
            Cloud-saved via Supabase. Offline behavior depends on browser cache.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ color: '#555' }}>{session.user.email}</span>
          <button onClick={doLogout} disabled={busy}>Logout</button>
        </div>
      </div>

      {msg && <p style={{ marginTop: 10, color: '#b00020' }}>{msg}</p>}
      {busy && <p style={{ marginTop: 10, color: '#555' }}>Working…</p>}

      <div style={{ display: 'flex', gap: 8, margin: '12px 0', flexWrap: 'wrap' }}>
        <button onClick={() => setTab('calc')} disabled={tab === 'calc'}>Calculator</button>
        <button onClick={() => setTab('items')} disabled={tab === 'items'}>Items</button>
        <button onClick={() => setTab('backup')} disabled={tab === 'backup'}>Backup</button>
        <span style={{ flex: 1 }} />
        <button onClick={onClone} disabled={!selected || busy}>Clone Selected Item</button>
      </div>

      {tab === 'calc' && (
        <div style={{ border: '1px solid #ddd', borderRadius: 10, padding: 12 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <label>Item:</label>
            <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} disabled={busy}>
              {items.map(it => <option key={it.id} value={it.id}>{it.name}</option>)}
            </select>

            <div style={{ marginLeft: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <label>Circle Base</label>
              <input
                type="number"
                value={settings.circleBaseRate}
                onChange={(e) => onSaveSettings({ ...settings, circleBaseRate: Number(e.target.value) })}
                style={{ width: 90 }}
              />
              <label>+Add</label>
              <input
                type="number"
                value={settings.circleAddPerKg}
                onChange={(e) => onSaveSettings({ ...settings, circleAddPerKg: Number(e.target.value) })}
                style={{ width: 70 }}
              />
              <label>+Extra</label>
              <input
                type="number"
                value={settings.circleExtraAddPerKg}
                onChange={(e) => onSaveSettings({ ...settings, circleExtraAddPerKg: Number(e.target.value) })}
                style={{ width: 70 }}
              />
              <label>Bag Kg</label>
              <input
                type="number"
                value={settings.bagStandardKg}
                onChange={(e) => onSaveSettings({ ...settings, bagStandardKg: Number(e.target.value) })}
                style={{ width: 70 }}
              />
            </div>
          </div>

          {!result ? <p style={{ marginTop: 10 }}>Select an item.</p> : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
              <div style={{ border: '1px solid #eee', borderRadius: 10, padding: 12 }}>
                <h3 style={{ marginTop: 0 }}>Weights (per pc)</h3>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  <li>Box: {result.perPc.boxG} g</li>
                  <li>Cover: {result.perPc.coverG} g</li>
                  <li>Kunda: {result.perPc.kundaG} g</li>
                  <li>Polybag: {result.perPc.polybagG} g</li>
                  <li>Pipe: {result.perPc.pipeG} g</li>
                  <li><b>Total packed:</b> {result.perPc.totalPackedG} g</li>
                </ul>
                <p style={{ marginTop: 10, color: '#555' }}>
                  PCS per {settings.bagStandardKg}kg bag: <b>{result.pcsPerBag}</b>
                </p>
              </div>

              <div style={{ border: '1px solid #eee', borderRadius: 10, padding: 12 }}>
                <h3 style={{ marginTop: 0 }}>Rates</h3>
                <p style={{ margin: 0 }}>Per kg: <b>₹{result.perKgRate}</b></p>
                <p style={{ marginTop: 6 }}>Per pc: <b>₹{result.perPcRate}</b></p>

                <details style={{ marginTop: 10 }}>
                  <summary>Debug cost split</summary>
                  <pre style={{ background: '#fafafa', padding: 10, borderRadius: 8, overflow: 'auto' }}>
{JSON.stringify(result.debug, null, 2)}
                  </pre>
                </details>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'items' && (
        <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 14 }}>
          <div style={{ border: '1px solid #ddd', borderRadius: 10, padding: 12 }}>
            <h3 style={{ marginTop: 0 }}>Items</h3>
            {items.map(it => (
              <div key={it.id} style={{ padding: 8, borderRadius: 8, background: it.id === selectedId ? '#f3f3f3' : 'transparent', marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <button style={{ flex: 1, textAlign: 'left' }} onClick={() => setSelectedId(it.id)} disabled={busy}>{it.name}</button>
                  <button onClick={() => onDelete(it.id)} disabled={busy}>Del</button>
                </div>
              </div>
            ))}
          </div>

          <div style={{ border: '1px solid #ddd', borderRadius: 10, padding: 12 }}>
            <h3 style={{ marginTop: 0 }}>Editor</h3>
            {!selected ? <p>Select an item.</p> : <ItemEditor item={selected} onSave={onSaveItem} />}
          </div>
        </div>
      )}

      {tab === 'backup' && (
        <div style={{ border: '1px solid #ddd', borderRadius: 10, padding: 12 }}>
          <h3 style={{ marginTop: 0 }}>Backup / Restore</h3>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={doExport} disabled={busy}>Export JSON</button>
            <label style={{ border: '1px solid #ccc', padding: '6px 10px', borderRadius: 8, cursor: 'pointer' }}>
              Import JSON
              <input
                type="file"
                accept="application/json"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void doImport(f)
                  e.currentTarget.value = ''
                }}
              />
            </label>
          </div>
          <p style={{ color: '#666', marginTop: 10 }}>
            Export/Import still works. Cloud is primary storage now.
          </p>
        </div>
      )}
    </div>
  )
}

function Num({ label, value, onChange, step = 0.01 }: { label: string; value: number; onChange: (n: number) => void; step?: number }) {
  return (
    <label style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 10, alignItems: 'center', marginBottom: 8 }}>
      <span style={{ color: '#333' }}>{label}</span>
      <input type="number" step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  )
}

function ItemEditor({ item, onSave }: { item: Item; onSave: (it: Item) => Promise<void> }) {
  const [it, setIt] = useState<Item>(item)

  useEffect(() => { setIt(item) }, [item])

  function ensureInduction(part: Item['box']): Item['box'] {
    if (part.induction) return part
    return { ...part, induction: { enabled: false, ratePerKg: 10 } }
  }

  const box = ensureInduction(it.box)
  const cover = ensureInduction(it.cover)

  return (
    <div>
      <Num label="Name (edit in box below)" value={0} onChange={() => { }} />
      <input value={it.name} onChange={(e) => setIt({ ...it, name: e.target.value })} style={{ width: '100%', marginBottom: 12 }} />

      <h4>Box</h4>
      <Num label="Box circle (inch)" value={box.circleSizeIn} onChange={(n) => setIt({ ...it, box: { ...box, circleSizeIn: n } })} step={0.01} />
      <Num label="Box thickness (mm)" value={box.thicknessMm} onChange={(n) => setIt({ ...it, box: { ...box, thicknessMm: n } })} step={0.01} />
      <Num label="Box press rate (₹/kg)" value={box.press.ratePerKg} onChange={(n) => setIt({ ...it, box: { ...box, press: { ...box.press, ratePerKg: n } } })} step={1} />
      <Num label="Box actual wastage % (weight)" value={box.press.actualWastagePct} onChange={(n) => setIt({ ...it, box: { ...box, press: { ...box.press, actualWastagePct: n } } })} step={0.1} />
      <Num label="Box job wastage % (kept)" value={box.press.jobWastagePct} onChange={(n) => setIt({ ...it, box: { ...box, press: { ...box.press, jobWastagePct: n } } })} step={0.1} />
      <Num label="Box tut % (scrap)" value={box.press.tutPct} onChange={(n) => setIt({ ...it, box: { ...box, press: { ...box.press, tutPct: n } } })} step={0.1} />

      <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <input
          type="checkbox"
          checked={!!box.induction?.enabled}
          onChange={(e) => setIt({ ...it, box: { ...box, induction: { enabled: e.target.checked, ratePerKg: box.induction?.ratePerKg ?? 10 } } })}
        />
        <span>Enable Induction (Box)</span>
      </label>
      <Num
        label="Induction rate (Box) ₹/kg"
        value={box.induction?.ratePerKg ?? 10}
        onChange={(n) => setIt({ ...it, box: { ...box, induction: { enabled: box.induction?.enabled ?? false, ratePerKg: n } } })}
        step={1}
      />

      <h4>Cover</h4>
      <Num label="Cover circle (inch)" value={cover.circleSizeIn} onChange={(n) => setIt({ ...it, cover: { ...cover, circleSizeIn: n } })} step={0.01} />
      <Num label="Cover thickness (mm)" value={cover.thicknessMm} onChange={(n) => setIt({ ...it, cover: { ...cover, thicknessMm: n } })} step={0.01} />
      <Num label="Cover press rate (₹/kg)" value={cover.press.ratePerKg} onChange={(n) => setIt({ ...it, cover: { ...cover, press: { ...cover.press, ratePerKg: n } } })} step={1} />
      <Num label="Cover actual wastage % (weight)" value={cover.press.actualWastagePct} onChange={(n) => setIt({ ...it, cover: { ...cover, press: { ...cover.press, actualWastagePct: n } } })} step={0.1} />
      <Num label="Cover job wastage % (kept)" value={cover.press.jobWastagePct} onChange={(n) => setIt({ ...it, cover: { ...cover, press: { ...cover.press, jobWastagePct: n } } })} step={0.1} />
      <Num label="Cover tut % (scrap)" value={cover.press.tutPct} onChange={(n) => setIt({ ...it, cover: { ...cover, press: { ...cover.press, tutPct: n } } })} step={0.1} />

      <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <input
          type="checkbox"
          checked={!!cover.induction?.enabled}
          onChange={(e) => setIt({ ...it, cover: { ...cover, induction: { enabled: e.target.checked, ratePerKg: cover.induction?.ratePerKg ?? 10 } } })}
        />
        <span>Enable Induction (Cover)</span>
      </label>
      <Num
        label="Induction rate (Cover) ₹/kg"
        value={cover.induction?.ratePerKg ?? 10}
        onChange={(n) => setIt({ ...it, cover: { ...cover, induction: { enabled: cover.induction?.enabled ?? false, ratePerKg: n } } })}
        step={1}
      />

      <h4>Polish (shared)</h4>
      <Num label="Polish rate (₹/kg)" value={it.polish.ratePerKg} onChange={(n) => setIt({ ...it, polish: { ...it.polish, ratePerKg: n } })} step={1} />
      <Num label="Polish wastage % (weight)" value={it.polish.wastagePct} onChange={(n) => setIt({ ...it, polish: { ...it.polish, wastagePct: n } })} step={0.1} />
      <Num label="Polish tut % (scrap)" value={it.polish.tutPct} onChange={(n) => setIt({ ...it, polish: { ...it.polish, tutPct: n } })} step={0.1} />

      <h4>Packing</h4>
      <Num label="Packing rate (₹/kg)" value={it.packing.packingRatePerKg} onChange={(n) => setIt({ ...it, packing: { ...it.packing, packingRatePerKg: n } })} step={1} />
      <Num label="Packing tut % (scrap)" value={it.packing.tutPct} onChange={(n) => setIt({ ...it, packing: { ...it.packing, tutPct: n } })} step={0.1} />

      <h4>Kunda</h4>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <input type="checkbox" checked={it.kunda.enabled} onChange={(e) => setIt({ ...it, kunda: { ...it.kunda, enabled: e.target.checked } })} />
        <span>Enable kunda</span>
      </label>
      <Num label="Kunda weight (g)" value={it.kunda.weightG} onChange={(n) => setIt({ ...it, kunda: { ...it.kunda, weightG: n } })} step={1} />
      <Num label="Kunda rate (₹/kg)" value={it.kunda.ratePerKg} onChange={(n) => setIt({ ...it, kunda: { ...it.kunda, ratePerKg: n } })} step={1} />

      <h4>Bag (polybag + pipe)</h4>
      <Num label="Polybag size (inch)" value={it.bagProfile.polybag.sizeIn} onChange={(n) => setIt({ ...it, bagProfile: { ...it.bagProfile, polybag: { ...it.bagProfile.polybag, sizeIn: n } } })} step={1} />
      <Num label="Polybag gauge" value={it.bagProfile.polybag.gauge} onChange={(n) => setIt({ ...it, bagProfile: { ...it.bagProfile, polybag: { ...it.bagProfile.polybag, gauge: n } } })} step={1} />
      <Num label="Polybag rate (₹/kg)" value={it.bagProfile.polybag.ratePerKg} onChange={(n) => setIt({ ...it, bagProfile: { ...it.bagProfile, polybag: { ...it.bagProfile.polybag, ratePerKg: n } } })} step={1} />

      <Num label="Pipe width (inch)" value={it.bagProfile.pipe.widthIn} onChange={(n) => setIt({ ...it, bagProfile: { ...it.bagProfile, pipe: { ...it.bagProfile.pipe, widthIn: n } } })} step={1} />
      <Num label="Pipe length (inch)" value={it.bagProfile.pipe.lengthIn} onChange={(n) => setIt({ ...it, bagProfile: { ...it.bagProfile, pipe: { ...it.bagProfile.pipe, lengthIn: n } } })} step={1} />
      <Num label="Pipe gauge" value={it.bagProfile.pipe.gauge} onChange={(n) => setIt({ ...it, bagProfile: { ...it.bagProfile, pipe: { ...it.bagProfile.pipe, gauge: n } } })} step={1} />
      <Num label="PCS per pipe" value={it.bagProfile.pipe.pcsPerPipe} onChange={(n) => setIt({ ...it, bagProfile: { ...it.bagProfile, pipe: { ...it.bagProfile.pipe, pcsPerPipe: n } } })} step={1} />
      <Num label="Pipe rate (₹/kg)" value={it.bagProfile.pipe.ratePerKg} onChange={(n) => setIt({ ...it, bagProfile: { ...it.bagProfile, pipe: { ...it.bagProfile.pipe, ratePerKg: n } } })} step={1} />

      <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
        <button onClick={() => onSave({ ...it, box, cover })}>Save</button>
        <button onClick={() => setIt(item)}>Reset</button>
      </div>
    </div>
  )
}