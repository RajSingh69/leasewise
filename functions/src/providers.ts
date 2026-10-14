// Listing provider adapters. Each adapter wraps one licensed data source. Add an adapter
// only for a source whose terms permit this use, and keep its key in Secret Manager
// (defineSecret) — never in source control or the browser bundle.

export interface SearchCriteria {
  location: string
  radiusMiles: number
  minPrice?: number
  maxPrice?: number
  maxLeaseYears?: number
  minBedrooms?: number
  includeAuctions: boolean
}

export interface ProviderListing {
  ref: string // provider's own listing id, used for de-duplication
  url: string
  address: string
  postcode?: string
  price?: number
  leaseYears?: number
  groundRent?: number
  serviceCharge?: number
  bedrooms?: number
  propertyType?: string
  listingDate?: string
  auction?: boolean
  licence: string // terms under which the data was obtained
}

export interface ListingProvider {
  id: string
  name: string
  isConfigured(): boolean
  search(c: SearchCriteria): Promise<ProviderListing[]>
}

// No licensed providers are connected yet. Example shape for a future adapter:
//
// const KEY = defineSecret('EXAMPLE_PROVIDER_KEY')
// export const exampleProvider: ListingProvider = {
//   id: 'example', name: 'Example Data Ltd',
//   isConfigured: () => Boolean(process.env.EXAMPLE_PROVIDER_KEY),
//   async search(c) { /* call the provider's documented API and map fields */ return [] },
// }
export const providers: ListingProvider[] = []
