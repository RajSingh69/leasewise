import { useEffect, useState } from 'react'
import { store } from '../data/store'
import { nowIso, today } from '../domain/factories'
import { shortDate } from '../domain/format'
import { parseLeaseTerm, yearsRemaining } from '../domain/leaseTerm'
import { leaseForSale, outwardCode, type LeaseRow } from '../domain/registeredLeases'
import type { Deal } from '../domain/types'
import { clearLeaseIndex, importRegisteredLeases, leaseIndexMeta, leasesAt, LEASES_DATASET_URL, type LeaseIndexMeta } from '../providers/leases'
import { Button, Card, Ext, Field, Notice } from './kit'

/** Default districts: the home postcode's district and its numeric neighbours (e.g. GU21 → GU19–GU23). */
function defaultDistricts(pc: string) {
  const out = outwardCode(pc || 'GU21')
  const m = out.match(/^([A-Z]+)(\d+)$/)
  if (!m) return out
  const n = Number(m[2])
  return [n - 2, n - 1, n, n + 1, n + 2].filter((x) => x > 0).map((x) => m[1] + x).join(', ')
}

export function LeaseImportCard() {
  const [meta, setMeta] = useState<LeaseIndexMeta | null>(null)
  const [districts, setDistricts] = useState(defaultDistricts(store.db.settings.postcode))
  const [pct, setPct] = useState<number | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    leaseIndexMeta().then(setMeta)
  }, [])
  const onFile = async (f: File) => {
    setErr(null)
    setPct(0)
    try {
      setMeta(await importRegisteredLeases(f, districts.split(/[,\s]+/), setPct))
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setPct(null)
    }
  }
  return (
    <Card>
      <h2 className="text-xl font-semibold">Lease lengths (HM Land Registry)</h2>
      <p className="mt-1 text-sm text-muted">
        Land Registry’s <Ext href={LEASES_DATASET_URL}>Registered Leases</Ext> dataset gives the term of every registered lease. With it, Leasewise can tell which nearby sales were long or short leases — the biggest gap in the valuation evidence.
      </p>
      <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-sm">
        <li>Create a free account on HM Land Registry’s “Use land and property data” service and accept the licence that fits your use.</li>
        <li>Download the full Registered Leases CSV (large — several GB).</li>
        <li>Choose it below. It is read in this browser; only the districts you list are kept. Nothing is uploaded.</li>
      </ol>
      <Notice tone="warn">The free licence covers personal and non-commercial use. Using Leasewise as a paid service would need HM Land Registry’s commercial licence. Don’t share the file.</Notice>
      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
        <Field label="Postcode districts to keep">
          <input value={districts} onChange={(e) => setDistricts(e.target.value)} />
        </Field>
        <label className="inline-flex cursor-pointer items-center self-end rounded-lg bg-forest-soft px-3.5 py-2 text-sm font-medium text-forest">
          {pct != null ? `Reading… ${pct}%` : 'Choose CSV'}
          <input type="file" accept=".csv,text/csv" className="hidden" disabled={pct != null} onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        </label>
      </div>
      {err && <p className="mt-2 text-sm text-danger">{err}</p>}
      {meta ? (
        <p className="mt-3 text-sm">
          Loaded {meta.rows.toLocaleString('en-GB')} leases across {meta.postcodes.toLocaleString('en-GB')} postcodes in {meta.districts.join(', ')} from {meta.fileName}, {shortDate(meta.importedAt)}.{' '}
          <button className="text-muted underline" onClick={() => clearLeaseIndex().then(() => setMeta(null))}>
            Remove
          </button>
          <span className="block text-xs text-muted">Refresh comparables on a property to apply it. Re-import monthly to stay current.</span>
        </p>
      ) : (
        <p className="mt-3 text-sm text-muted">Not loaded. Until then, mark sales as long/short yourself after checking them.</p>
      )}
    </Card>
  )
}

/** Look up this property's own registered lease; the user confirms before anything changes. */
export function SubjectLeaseCheck({ deal }: { deal: Deal }) {
  const [meta, setMeta] = useState<LeaseIndexMeta | null | undefined>(undefined)
  const [rows, setRows] = useState<LeaseRow[] | null>(null)
  useEffect(() => {
    leaseIndexMeta().then(setMeta)
  }, [])
  if (meta === undefined) return null
  if (!meta)
    return (
      <p className="mt-3 text-xs text-muted">
        Verify the lease length from the title register (HM Land Registry, small fee per title) or import the Registered Leases data in <a href="#/settings">Settings</a>.
      </p>
    )
  if (!deal.postcode) return <p className="mt-3 text-xs text-muted">Add the postcode to check the Registered Leases data.</p>
  const parts = deal.address.split(',').map((s) => s.trim())
  const finding = rows ? leaseForSale({ saon: parts.find((p) => /\b(flat|apartment|unit)\b/i.test(p)), paon: parts.find((p) => !/\b(flat|apartment|unit)\b/i.test(p)), street: parts[2], postcode: deal.postcode, date: today() }, rows) : null
  const apply = (term: string, dateOfLease: string) => {
    const p = parseLeaseTerm(term, dateOfLease)
    if (!p) return
    store.updateDeal(deal.id, (d) => {
      d.facts.leaseYears = { value: Math.floor(yearsRemaining(p, today()) * 10) / 10, provenance: 'verified', source: `HMLR Registered Leases: ${term}`, updatedAt: nowIso() }
      d.leaseYearsAsAt = today()
    })
  }
  return (
    <div className="mt-3 rounded-lg bg-paper p-3 text-sm">
      {!rows ? (
        <Button kind="secondary" onClick={() => leasesAt(deal.postcode!).then(setRows)}>
          Check the Registered Leases data
        </Button>
      ) : !rows.length ? (
        <p className="text-muted">No registered leases at {deal.postcode} in your imported data.</p>
      ) : (
        <>
          {finding?.yearsAtSale != null && finding.confidence === 'high' && (
            <p className="mb-2">
              Best match: <b>{finding.address}</b> — “{finding.termText}”, about {Math.round(finding.yearsAtSale)} years left today.
            </p>
          )}
          <p className="text-xs text-muted">Pick this flat’s lease only if you’re sure it’s the same flat. Terms are as written on the register.</p>
          <ul className="mt-1 max-h-56 divide-y divide-line overflow-y-auto rounded-lg border border-line bg-white">
            {rows.map((r) => {
              const p = parseLeaseTerm(r.term, r.dateOfLease)
              return (
                <li key={r.uid + r.regOrder} className="flex items-center justify-between gap-2 px-3 py-1.5">
                  <span>
                    {r.address}
                    <span className="block text-xs text-muted">
                      “{r.term || 'no term recorded'}”{r.dateOfLease && `, dated ${r.dateOfLease}`}
                      {p ? ` · ${Math.round(yearsRemaining(p, today()))} yrs left` : ' · term not readable'}
                    </span>
                  </span>
                  {p && (
                    <button className="shrink-0 text-xs text-forest underline" onClick={() => apply(r.term, r.dateOfLease)}>
                      This one
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}
