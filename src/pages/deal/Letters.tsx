import { useEffect, useState } from 'react'
import { store, useDb } from '../../data/store'
import { nowIso, uid } from '../../domain/factories'
import { shortDate } from '../../domain/format'
import { draftLetter, LETTER_TEMPLATES, type LetterTemplateId } from '../../domain/letters'
import type { Deal, ProfessionalKind } from '../../domain/types'
import { Button, Card, Field, NumberInput, download } from '../../ui/kit'

const KIND_FOR: Partial<Record<LetterTemplateId, ProfessionalKind[]>> = {
  'agent-lease': ['estate-agent'],
  viewing: ['estate-agent'],
  'missing-docs': ['estate-agent'],
  offer: ['estate-agent'],
  'legal-pack': ['auctioneer'],
  solicitor: ['lease-solicitor', 'conveyancer'],
  surveyor: ['surveyor'],
  broker: ['broker'],
}

export function LettersTab({ deal, initial }: { deal: Deal; initial?: string }) {
  const db = useDb()
  const valid = LETTER_TEMPLATES.some((t) => t.id === initial)
  const [tpl, setTpl] = useState<LetterTemplateId>(valid ? (initial as LetterTemplateId) : 'agent-lease')
  const [proId, setProId] = useState('')
  const [offer, setOffer] = useState<number | undefined>(deal.facts.askingPrice.value ? Math.round(deal.facts.askingPrice.value * 0.9) : undefined)
  const pro = db.professionals.find((p) => p.id === proId)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const l = draftLetter(tpl, { deal, settings: db.settings, recipientName: pro?.name, offerAmount: offer })
    setSubject(l.subject)
    setBody(l.body)
    // Regenerate only when the template, recipient or offer changes, not on every deal edit.
  }, [tpl, proId, offer])

  const kinds = KIND_FOR[tpl]
  const pros = db.professionals.filter((p) => !kinds || kinds.includes(p.kind))
  const log = db.letters.filter((l) => l.dealId === deal.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const save = (status: 'draft' | 'sent') =>
    store.upsert('letters', { id: uid(), ownerId: deal.ownerId, dealId: deal.id, templateId: tpl, recipient: pro?.name ?? '', subject, body, status, createdAt: nowIso(), sentAt: status === 'sent' ? nowIso() : undefined })
  const mailto = `mailto:${encodeURIComponent(pro?.email ?? '')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <h2 className="text-xl font-semibold">Correspondence assistant</h2>
        <p className="mt-1 text-sm text-muted">Drafts are filled in from what Leasewise knows and only ask for what’s missing. Read and edit before sending — nothing is sent automatically.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Letter">
            <select value={tpl} onChange={(e) => setTpl(e.target.value as LetterTemplateId)}>
              {LETTER_TEMPLATES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label} → {t.to}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Recipient" hint={pros.length ? undefined : 'add contacts in Professionals'}>
            <select value={proId} onChange={(e) => setProId(e.target.value)}>
              <option value="">— none —</option>
              {pros.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          {tpl === 'offer' && (
            <Field label="Offer amount (£)">
              <NumberInput value={offer} onChange={setOffer} />
            </Field>
          )}
          <Field label="Subject" className="sm:col-span-2">
            <input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </Field>
          <Field label="Message" className="sm:col-span-2">
            <textarea rows={16} value={body} onChange={(e) => setBody(e.target.value)} className="font-mono text-[13px] leading-relaxed" />
          </Field>
        </div>
        {!db.settings.sender.name && <p className="mt-2 text-xs text-warn">Add your name and contact details in Settings so they appear in the signature.</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            onClick={() =>
              navigator.clipboard?.writeText(`Subject: ${subject}\n\n${body}`).then(() => {
                setCopied(true)
                setTimeout(() => setCopied(false), 1500)
              })
            }
          >
            {copied ? 'Copied' : 'Copy'}
          </Button>
          <a href={mailto} className="inline-flex items-center rounded-lg bg-forest-soft px-3.5 py-2 text-sm font-medium text-forest no-underline">
            Open in email app ↗
          </a>
          <Button kind="ghost" onClick={() => download(`${subject.replace(/[^\w -]/g, '').slice(0, 60)}.txt`, `Subject: ${subject}\n\n${body}`)}>
            Download
          </Button>
          <Button kind="ghost" onClick={() => save('draft')}>
            Save draft
          </Button>
          <Button kind="ghost" onClick={() => save('sent')}>
            I’ve sent this
          </Button>
        </div>
      </Card>
      <Card>
        <h3 className="text-lg font-semibold">Correspondence log</h3>
        {log.length ? (
          <ul className="mt-2 divide-y divide-line text-sm">
            {log.map((l) => (
              <li key={l.id} className="py-2">
                <div className="font-medium">{l.subject}</div>
                <div className="text-xs text-muted">
                  {l.status === 'sent' ? `Sent ${shortDate(l.sentAt)}` : `Draft ${shortDate(l.createdAt)}`}
                  {l.recipient && ` · ${l.recipient}`}
                </div>
                <div className="mt-1 flex gap-3 text-xs">
                  <button
                    className="text-forest underline"
                    onClick={() => {
                      setSubject(l.subject)
                      setBody(l.body)
                    }}
                  >
                    Open
                  </button>
                  {l.status === 'draft' && (
                    <button className="text-forest underline" onClick={() => store.upsert('letters', { ...l, status: 'sent', sentAt: nowIso() })}>
                      Mark sent
                    </button>
                  )}
                  {l.status === 'sent' && (
                    <button
                      className="text-forest underline"
                      onClick={() => {
                        const due = new Date(Date.now() + 5 * 86400_000).toISOString().slice(0, 10)
                        store.upsert('tasks', { id: uid(), ownerId: deal.ownerId, dealId: deal.id, kind: 'follow-up', title: `Chase reply: ${l.subject}`, due, done: false, createdAt: nowIso() })
                      }}
                    >
                      Follow up in 5 days
                    </button>
                  )}
                  <button className="text-muted underline" onClick={() => store.remove('letters', l.id)}>
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted">Nothing saved yet.</p>
        )}
      </Card>
    </div>
  )
}
