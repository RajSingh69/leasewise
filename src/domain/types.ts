// Core data model. Every collection is owned by a user (ownerId) so the same shapes
// work for local single-user mode and for multi-user Firestore later.

/** Where a figure came from. Drives badges, risk flags and how much we trust it. */
export type Provenance =
  | 'verified' // checked against a document or official record by the user
  | 'quote' // a written quotation from a professional
  | 'agent' // claimed by the listing or estate agent, not verified
  | 'calculated' // derived by Leasewise from other figures
  | 'estimate' // the user's own estimate
  | 'assumption' // a Leasewise planning default, not specific to this property
  | 'missing'

export interface Fact<T> {
  value?: T
  provenance: Provenance
  source?: string
  note?: string
  updatedAt?: string
}

export type NumFact = Fact<number>
export type TriState = 'yes' | 'no' | 'unknown'

export type ListingProviderId =
  | 'rightmove'
  | 'zoopla'
  | 'onthemarket'
  | 'auction'
  | 'agent'
  | 'manual'
  | 'csv'
  | 'other'

export interface ListingSource {
  provider: ListingProviderId
  url?: string
  ref?: string
  observedAt: string
}

export type DealStage = 'new' | 'researching' | 'viewing' | 'offer' | 'rejected' | 'archived'
export type FinancingType = 'cash' | 'mortgage' | 'bridging'

export interface DealFacts {
  askingPrice: NumFact
  leaseYears: NumFact
  groundRent: NumFact
  serviceCharge: NumFact
  bedrooms: NumFact
  floorAreaSqm: NumFact
  propertyType: Fact<string>
  listingDate: Fact<string>
}

export interface DealFlags {
  auction: boolean
  auctionDate?: string
  retirement: TriState
  sharedOwnership: TriState
  groundRentReview: 'fixed' | 'doubling' | 'rpi' | 'other' | 'unknown'
  priceReduced: boolean
  refurbOpportunity: boolean
  unusualLeaseTerms: TriState
  legalPackReviewed: boolean
}

export type MatchConfidence = 'high' | 'low' | 'ambiguous' | 'none'

export interface EpcMatch {
  certificateNumber: string
  address: string
  floorAreaSqm?: number
  propertyType?: string
  energyBand?: string
  registrationDate?: string
  confidence: MatchConfidence
  reasons: string[]
}

export type LeaseEvidenceSource = 'registered-leases' | 'title-register' | 'sold-listing' | 'agent' | 'other'

export interface LeaseEvidence {
  source: LeaseEvidenceSource
  note?: string
  /** Original register wording, e.g. "99 years from 24 June 1985". */
  termText?: string
  yearsAtSale?: number
  confidence?: MatchConfidence
  /** User accepted an uncertain register match. */
  approved?: boolean
  checkedAt: string
}

/** Lease status of a comparable sale. Land Registry never records lease length, so "unknown" is the default. */
export type CompLeaseStatus = 'unknown' | 'long' | 'short'

export interface Comparable {
  id: string
  address: string
  /** Land Registry address parts, used for EPC matching. */
  saon?: string
  paon?: string
  street?: string
  postcode: string
  /** Completed sale price as recorded. */
  price: number
  date: string
  propertyType: string
  estate: 'leasehold' | 'freehold' | 'unknown'
  newBuild: boolean
  distanceM?: number
  sameStreet: boolean
  samePostcode: boolean
  /** Sale price restated to the latest HPI month. */
  adjustedPrice?: number
  hpiFactor?: number
  epc?: EpcMatch
  /** Floor area the user verified themselves (e.g. from a sold listing's floor plan). */
  userAreaSqm?: number
  /** User accepted a low-confidence or ambiguous EPC match. */
  epcApproved?: boolean
  leaseStatus: CompLeaseStatus
  /** Why the lease status is what it is. Required whenever the user sets long/short. */
  leaseEvidence?: LeaseEvidence
  /** User override of the automatic selection. */
  userChoice?: 'include' | 'exclude'
  source: 'hmlr-ppd' | 'manual'
  sourceUrl?: string
  /** Legacy fields from v0.2 saved data. */
  longLeaseConfirmed?: boolean
  included?: boolean
  score?: number
  reasons?: string[]
}

export interface SourceStatus {
  id: 'hmlr-ppd' | 'ukhpi' | 'epc' | 'postcodes' | 'leases'
  ok: boolean
  message: string
}

export interface HpiInfo {
  region: string
  series: 'flat-maisonette' | 'all-property'
  latestMonth: string
  /** Smoothed index by month (YYYY-MM). */
  index: Record<string, number>
}

export interface CompsResult {
  fetchedAt: string
  centrePostcode: string
  radiusM: number
  yearsBack: number
  items: Comparable[]
  note?: string
  sources?: SourceStatus[]
  hpi?: HpiInfo
}

export interface Deal {
  id: string
  ownerId: string
  createdAt: string
  updatedAt: string
  address: string
  postcode?: string
  stage: DealStage
  sources: ListingSource[]
  facts: DealFacts
  /** Date the lease length figure applied (leases shorten every day). */
  leaseYearsAsAt?: string
  flags: DealFlags
  financing: FinancingType
  inputs: Partial<Record<InputKey, NumFact>>
  comps?: CompsResult
  priceHistory?: { date: string; price: number; source: string }[]
  notes: string
  lastChecked?: string
}

export type InputKey =
  | 'purchasePrice'
  | 'depositPct'
  | 'interestRatePct'
  | 'lenderFees'
  | 'brokerFee'
  | 'exitFeePct'
  | 'sdltOverride'
  | 'conveyancing'
  | 'searches'
  | 'survey'
  | 'auctionFees'
  | 'legalPackReview'
  | 'otherAcquisition'
  | 'premium'
  | 'leaseSolicitor'
  | 'leaseValuer'
  | 'freeholderCosts'
  | 'landRegistryFees'
  | 'leaseContingencyPct'
  | 'refurb'
  | 'layout'
  | 'permissionsFees'
  | 'buildingRegs'
  | 'improvementContingencyPct'
  | 'holdingMonths'
  | 'serviceChargeAnnual'
  | 'groundRentAnnual'
  | 'councilTaxMonthly'
  | 'insuranceAnnual'
  | 'utilitiesMonthly'
  | 'maintenanceMonthly'
  | 'otherMonthly'
  | 'resaleValue'
  | 'agentFeePct'
  | 'sellingLegal'
  | 'taxRatePct'
  | 'monthlyRent'
  | 'voidWeeks'
  | 'lettingAgentPct'
  | 'rentalMaintenancePct'
  | 'landlordInsuranceAnnual'
  | 'complianceAnnual'
  | 'postWorksValue'
  | 'refiLtvPct'
  | 'refiRatePct'
  | 'refiFees'

export interface BuyerCircumstances {
  firstTimeBuyer: boolean
  additionalProperty: boolean
  nonResident: boolean
}

export interface Settings {
  ownerId: string
  capital: number
  reserve: number
  location: string
  postcode: string
  radiusMiles: number
  buyer: BuyerCircumstances
  sender: { name: string; email: string; phone: string }
  updatedAt: string
}

export type TaskKind = 'task' | 'viewing' | 'auction' | 'deadline' | 'follow-up'

export interface Task {
  id: string
  ownerId: string
  dealId?: string
  kind: TaskKind
  title: string
  due?: string
  done: boolean
  createdAt: string
  notes?: string
}

export type ProfessionalKind =
  | 'lease-solicitor'
  | 'conveyancer'
  | 'surveyor'
  | 'broker'
  | 'estate-agent'
  | 'auctioneer'
  | 'contractor'

export interface Professional {
  id: string
  ownerId: string
  kind: ProfessionalKind
  name: string
  location: string
  email?: string
  phone?: string
  website?: string
  specialisms: string
  /** e.g. "SRA 123456", "RICS firm", "FCA FRN 123456" — only what the user has checked. */
  registration?: string
  registrationCheckedAt?: string
  infoSource: string
  infoDate: string
  status: 'not-contacted' | 'contacted' | 'quoted' | 'instructed' | 'declined'
  notes: string
}

export interface Quote {
  id: string
  ownerId: string
  professionalId: string
  dealId?: string
  service: string
  amount: number
  includesVat: boolean
  includes: string
  excludes: string
  receivedAt: string
  validUntil?: string
  status: 'requested' | 'received' | 'accepted' | 'rejected'
}

export interface Letter {
  id: string
  ownerId: string
  dealId?: string
  templateId: string
  recipient: string
  subject: string
  body: string
  status: 'draft' | 'sent'
  createdAt: string
  sentAt?: string
}

export interface SavedSearch {
  id: string
  ownerId: string
  name: string
  location: string
  radiusMiles: number
  minPrice?: number
  maxPrice?: number
  maxLeaseYears?: number
  minBedrooms?: number
  propertyType: 'flat' | 'maisonette' | 'any'
  includeAuctions: boolean
  excludeRetirement: boolean
  excludeSharedOwnership: boolean
  maxServiceCharge?: number
  createdAt: string
  lastRunAt?: string
}

export interface Db {
  schemaVersion: 2
  settings: Settings
  deals: Deal[]
  tasks: Task[]
  professionals: Professional[]
  quotes: Quote[]
  letters: Letter[]
  searches: SavedSearch[]
  discoveries: import('./discovery').Discovery[]
}

export type CollectionName = 'deals' | 'tasks' | 'professionals' | 'quotes' | 'letters' | 'searches' | 'discoveries'
