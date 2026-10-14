import type { Db, Deal, Fact, Settings } from './types'

export const LOCAL_OWNER = 'local'

export const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36)

export const nowIso = () => new Date().toISOString()
export const today = () => nowIso().slice(0, 10)

export const missing = <T>(): Fact<T> => ({ provenance: 'missing' })
export const agentFact = <T>(value: T | undefined, source = 'Listing'): Fact<T> =>
  value == null || (typeof value === 'number' && Number.isNaN(value)) ? missing<T>() : { value, provenance: 'agent', source, updatedAt: nowIso() }

export function defaultSettings(ownerId = LOCAL_OWNER): Settings {
  return {
    ownerId,
    capital: 20000,
    reserve: 3000,
    location: 'Woking',
    postcode: 'GU21 6XR',
    radiusMiles: 3,
    buyer: { firstTimeBuyer: false, additionalProperty: false, nonResident: false },
    sender: { name: '', email: '', phone: '' },
    updatedAt: nowIso(),
  }
}

export function emptyDb(ownerId = LOCAL_OWNER): Db {
  return { schemaVersion: 2, settings: defaultSettings(ownerId), deals: [], tasks: [], professionals: [], quotes: [], letters: [], searches: [], discoveries: [] }
}

export function newDeal(ownerId: string, address: string): Deal {
  const t = nowIso()
  return {
    id: uid(),
    ownerId,
    createdAt: t,
    updatedAt: t,
    address,
    stage: 'new',
    sources: [],
    facts: {
      askingPrice: missing(),
      leaseYears: missing(),
      groundRent: missing(),
      serviceCharge: missing(),
      bedrooms: missing(),
      floorAreaSqm: missing(),
      propertyType: { value: 'Flat', provenance: 'estimate' },
      listingDate: missing(),
    },
    flags: {
      auction: false,
      retirement: 'unknown',
      sharedOwnership: 'unknown',
      groundRentReview: 'unknown',
      priceReduced: false,
      refurbOpportunity: false,
      unusualLeaseTerms: 'unknown',
      legalPackReviewed: false,
    },
    financing: 'cash',
    inputs: {},
    notes: '',
  }
}
