// Property-specific correspondence. Drafts only: the user edits and approves before sending.

import type { Deal, Settings } from './types'

export type LetterTemplateId =
  | 'agent-lease'
  | 'viewing'
  | 'solicitor'
  | 'surveyor'
  | 'freeholder'
  | 'legal-pack'
  | 'broker'
  | 'follow-up'
  | 'offer'
  | 'missing-docs'

export const LETTER_TEMPLATES: { id: LetterTemplateId; label: string; to: string }[] = [
  { id: 'agent-lease', label: 'Lease & charges enquiry', to: 'Estate agent' },
  { id: 'viewing', label: 'Viewing request', to: 'Estate agent' },
  { id: 'missing-docs', label: 'Request missing documents', to: 'Estate agent' },
  { id: 'legal-pack', label: 'Auction legal pack request', to: 'Auctioneer' },
  { id: 'solicitor', label: 'Solicitor quote request', to: 'Solicitor' },
  { id: 'surveyor', label: 'Lease-extension valuation request', to: 'Surveyor' },
  { id: 'broker', label: 'Mortgage broker enquiry', to: 'Mortgage broker' },
  { id: 'freeholder', label: 'Freeholder informal enquiry', to: 'Freeholder / managing agent' },
  { id: 'offer', label: 'Offer (subject to contract)', to: 'Estate agent' },
  { id: 'follow-up', label: 'Follow-up', to: 'Anyone' },
]

export interface LetterContext {
  deal: Deal
  settings: Settings
  recipientName?: string
  offerAmount?: number
}

const gbp = (n?: number) => (n ? '£' + Math.round(n).toLocaleString('en-GB') : 'not yet confirmed')

export function draftLetter(id: LetterTemplateId, ctx: LetterContext): { subject: string; body: string } {
  const { deal, settings } = ctx
  const addr = deal.address + (deal.postcode && !deal.address.includes(deal.postcode) ? `, ${deal.postcode}` : '')
  const src = deal.sources[0]
  const ref = src?.ref ? ` (listing ref ${src.ref})` : ''
  const link = src?.url ? `\nListing: ${src.url}` : ''
  const lease = deal.facts.leaseYears.value != null ? `${deal.facts.leaseYears.value} years` : 'not stated'
  const price = gbp(deal.facts.askingPrice.value)
  const hello = `Dear ${ctx.recipientName?.trim() || 'Sir or Madam'},`
  const s = settings.sender
  const sign = `Kind regards,\n\n${s.name || '[Your name]'}${s.phone ? `\n${s.phone}` : ''}${s.email ? `\n${s.email}` : ''}`
  const unknownFacts: string[] = []
  if (deal.facts.leaseYears.value == null || deal.facts.leaseYears.provenance === 'agent') unknownFacts.push('the exact unexpired lease term, the lease start date and original length')
  if (deal.facts.groundRent.value == null) unknownFacts.push('the current ground rent and any review or escalation clauses')
  if (deal.facts.serviceCharge.value == null) unknownFacts.push('the service charge for the last three years and the reserve fund balance')
  if (deal.flags.retirement === 'unknown') unknownFacts.push('whether there are any age or occupancy restrictions')
  if (deal.flags.sharedOwnership === 'unknown') unknownFacts.push('whether this is a full (100%) share')
  const ask = (items: string[]) => items.map((x) => `- ${x[0].toUpperCase()}${x.slice(1)}`).join('\n')

  switch (id) {
    case 'agent-lease':
      return {
        subject: `Enquiry: ${addr}${ref}`,
        body: `${hello}\n\nI am interested in ${addr}${ref}, advertised at ${price}.${link}\n\nBefore arranging a viewing, could you please confirm:\n${ask([
          ...unknownFacts,
          'whether the freeholder has offered an informal lease extension, or whether the seller would serve a Section 42 notice and assign it on completion',
          'any planned major works, Section 20 notices or disputes',
          'whether any buyers have had mortgage applications declined on this property',
        ])}\n\nCopies of the lease and the latest service charge accounts would be very helpful.\n\n${sign}`,
      }
    case 'viewing':
      return {
        subject: `Viewing request: ${addr}${ref}`,
        body: `${hello}\n\nI would like to arrange a viewing of ${addr}${ref}.${link}\n\nI am generally available [add days and times]. Please let me know what suits the vendor.\n\nAhead of the viewing, could you also confirm the lease length (${lease} advertised), ground rent and service charge?\n\n${sign}`,
      }
    case 'missing-docs':
      return {
        subject: `Documents requested: ${addr}`,
        body: `${hello}\n\nThank you for your help with ${addr}. To progress my research, please could you send:\n- A copy of the lease and any deeds of variation\n- Title register and title plan (or the title number)\n- Service charge accounts and budgets for the last three years\n- Ground rent demands showing the current rent\n- The management pack (LPE1) if available\n- EPC and any building safety information (including EWS1 if relevant)\n\n${sign}`,
      }
    case 'legal-pack':
      return {
        subject: `Legal pack request: ${addr}${deal.flags.auctionDate ? ` (auction ${deal.flags.auctionDate})` : ''}`,
        body: `${hello}\n\nI am considering bidding on ${addr}${ref}${deal.flags.auctionDate ? ` in the auction on ${deal.flags.auctionDate}` : ''}.${link}\n\nPlease could you send the legal pack, including the lease, title documents, special conditions of sale, searches and any replies to enquiries. Please also confirm the buyer's premium and any other fees payable on exchange, and the completion period.\n\n${sign}`,
      }
    case 'solicitor':
      return {
        subject: `Quote request: short-lease flat purchase and lease extension — ${addr}`,
        body: `${hello}\n\nI am considering buying ${addr} (asking ${price}; lease advertised as ${lease}${deal.flags.auction ? '; being sold at auction' : ''}).\n\nPlease could you provide an itemised quotation, including VAT and disbursements, for:\n1. Leasehold purchase conveyancing${deal.flags.auction ? ' including review of the auction legal pack before the sale' : ''}\n2. A statutory lease extension under the Leasehold Reform, Housing and Urban Development Act 1993, including taking an assignment of a Section 42 notice from the seller if possible\n3. Any additional costs if the premium is referred to the First-tier Tribunal\n\nPlease also tell me whether you are regulated by the SRA, your experience with lease extensions, and your current timescales.\n\nI have not yet committed to purchasing.\n\n${sign}`,
      }
    case 'surveyor':
      return {
        subject: `Lease-extension valuation quote — ${addr}`,
        body: `${hello}\n\nI am researching ${addr}, advertised at ${price} with ${lease} remaining${deal.facts.groundRent.value != null ? ` and ground rent of £${deal.facts.groundRent.value} a year` : ''}.\n\nPlease could you quote for a statutory lease-extension premium valuation report (RICS-compliant), and say whether that includes negotiation with the freeholder's valuer. It would also help to know your typical turnaround and what documents you need.\n\n${sign}`,
      }
    case 'broker':
      return {
        subject: `Mortgage enquiry: short-lease flat — ${addr}`,
        body: `${hello}\n\nI am looking at ${addr}, asking ${price}, with ${lease} left on the lease. I would extend the lease after purchase.\n\nCould you tell me:\n- Whether any lenders would consider this lease length, and their minimum term at the end of the mortgage\n- Bridging or specialist options if mainstream lending is not available, with typical rates and fees\n- Whether a lender would refinance after a lease extension and refurbishment, and on what basis\n- Your fees\n\nI have approximately £${settings.capital.toLocaleString('en-GB')} available.\n\n${sign}`,
      }
    case 'freeholder':
      return {
        subject: `Informal enquiry: lease extension — ${addr}`,
        body: `${hello}\n\nI am a prospective buyer of ${addr}. Without prejudice and subject to contract, would you consider an informal lease extension, and if so on what indicative terms (premium, new term and ground rent)?\n\nThis letter is an enquiry only. It is not a notice under the Leasehold Reform, Housing and Urban Development Act 1993.\n\n${sign}`,
      }
    case 'offer':
      return {
        subject: `Offer (subject to contract): ${addr}`,
        body: `${hello}\n\nFurther to my viewing, I would like to offer ${gbp(ctx.offerAmount)} for ${addr}, subject to contract, survey, satisfactory review of the lease and a satisfactory lease extension arrangement.\n\n[Explain your position: e.g. cash buyer / mortgage agreed in principle / no chain.]\n\nI would ask the seller to serve a Section 42 notice before exchange and assign the benefit to me on completion.\n\n${sign}`,
      }
    case 'follow-up':
      return {
        subject: `Following up: ${addr}`,
        body: `${hello}\n\nI am following up my earlier message about ${addr}. I would be grateful for an update when you have a moment.\n\n${sign}`,
      }
  }
}
