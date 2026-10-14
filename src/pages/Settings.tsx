import { useState } from 'react'
import { store, useDb } from '../data/store'
import { parseBackup } from '../data/migrate'
import { firebaseConfigured } from '../data/firebase'
import { today } from '../domain/factories'
import { normalisePostcode } from '../domain/listing'
import type { BuyerCircumstances } from '../domain/types'
import { Button, Card, Field, Notice, NumberInput, PageHead, download } from '../ui/kit'
import { LeaseImportCard } from '../ui/LeaseRegister'
import { getPropertyDataKey, setPropertyDataKey, PROPERTYDATA_SIGNUP } from '../providers/propertyData'
import { Ext } from '../ui/kit'

export function SettingsPage() {
  const db = useDb()
  const s = db.settings
  const [msg, setMsg] = useState<{ tone: 'info' | 'danger'; text: string } | null>(null)
  const setBuyer = (p: Partial<BuyerCircumstances>) => store.updateSettings({ buyer: { ...s.buyer, ...p } })

  return (
    <div className="space-y-6">
      <PageHead title="Settings" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="text-xl font-semibold">Budget & area</h2>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Field label="Capital available (£)">
              <NumberInput value={s.capital} onChange={(v) => store.updateSettings({ capital: v ?? 0 })} />
            </Field>
            <Field label="Keep in reserve (£)" hint="never spent">
              <NumberInput value={s.reserve} onChange={(v) => store.updateSettings({ reserve: v ?? 0 })} />
            </Field>
            <Field label="Search location">
              <input defaultValue={s.location} onBlur={(e) => store.updateSettings({ location: e.target.value.trim() || 'Woking' })} />
            </Field>
            <Field label="Centre postcode">
              <input defaultValue={s.postcode} onBlur={(e) => store.updateSettings({ postcode: normalisePostcode(e.target.value) ?? e.target.value.trim() })} />
            </Field>
            <Field label="Search radius (miles)">
              <NumberInput value={s.radiusMiles} onChange={(v) => store.updateSettings({ radiusMiles: v ?? 3 })} />
            </Field>
          </div>
        </Card>
        <Card>
          <h2 className="text-xl font-semibold">Your circumstances</h2>
          <p className="mt-1 text-sm text-muted">Used for Stamp Duty. If unsure, ask your conveyancer.</p>
          <div className="mt-3 space-y-2 text-sm">
            {(
              [
                ['firstTimeBuyer', 'I am a first-time buyer and will live in the property'],
                ['additionalProperty', 'I will own more than one home after buying (higher rates)'],
                ['nonResident', 'I am not UK resident for SDLT purposes'],
              ] as const
            ).map(([k, l]) => (
              <label key={k} className="flex items-start gap-2">
                <input type="checkbox" className="mt-1 w-auto" checked={s.buyer[k]} onChange={(e) => setBuyer({ [k]: e.target.checked })} /> {l}
              </label>
            ))}
          </div>
          <h3 className="mt-5 font-semibold">Letter signature</h3>
          <div className="mt-2 grid gap-3 sm:grid-cols-3">
            {(['name', 'email', 'phone'] as const).map((k) => (
              <Field key={k} label={k[0].toUpperCase() + k.slice(1)}>
                <input defaultValue={s.sender[k]} onBlur={(e) => store.updateSettings({ sender: { ...s.sender, [k]: e.target.value.trim() } })} />
              </Field>
            ))}
          </div>
        </Card>
        <Card>
          <h2 className="text-xl font-semibold">Your data</h2>
          <p className="mt-1 text-sm text-muted">
            {firebaseConfigured ? 'Synced to your private Firestore workspace.' : 'Local mode: everything is saved in this browser only. Export a backup regularly.'}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={() => download(`leasewise-backup-${today()}.json`, JSON.stringify(db, null, 2), 'application/json')}>Export backup</Button>
            <label className="inline-flex cursor-pointer items-center rounded-lg bg-forest-soft px-3.5 py-2 text-sm font-medium text-forest">
              Import backup
              <input
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0]
                  if (!f) return
                  try {
                    const next = parseBackup(await f.text(), s.ownerId, store.db)
                    const added = next.deals.length - store.db.deals.length
                    await store.replaceAll(next)
                    setMsg({ tone: 'info', text: `Imported. ${added >= 0 ? `${added} new properties.` : ''}` })
                  } catch (err) {
                    setMsg({ tone: 'danger', text: err instanceof Error ? err.message : String(err) })
                  }
                  e.target.value = ''
                }}
              />
            </label>
          </div>
          <p className="mt-2 text-xs text-muted">Accepts v2 backups and the original Leasewise prototype’s “leasewise-backup.json” (v1 properties are merged in).</p>
          {msg && (
            <div className="mt-3">
              <Notice tone={msg.tone}>{msg.text}</Notice>
            </div>
          )}
          {firebaseConfigured && (
            <Button kind="ghost" className="mt-4" onClick={() => import('../data/firebase').then((f) => f.signOutUser())}>
              Sign out
            </Button>
          )}
        </Card>
        <Card>
          <h2 className="text-xl font-semibold">Live listings (PropertyData)</h2>
          <p className="mt-1 text-sm text-muted">
            Paste your PropertyData API key to search properties currently for sale from Discover. It’s stored only in this browser, never in the code or on GitHub. Plans from £30/month; free 14-day trial for testing (<Ext href={PROPERTYDATA_SIGNUP}>pricing</Ext>). Each search uses about 10–20 credits.
          </p>
          <input className="mt-3" type="password" autoComplete="off" defaultValue={getPropertyDataKey()} placeholder="API key" onBlur={(e) => setPropertyDataKey(e.target.value)} />
        </Card>
        <LeaseImportCard />
      </div>
    </div>
  )
}
