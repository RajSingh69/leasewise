// Parse the free-text "Term" field of HM Land Registry's Registered Leases dataset, e.g.
// "99 years from 24 June 1985", "125 years (less 3 days) from 1.1.1990",
// "From and including 25 March 1980 to and including 24 March 2079",
// "999 years from the date of the lease". Unparseable terms return null — never a guess.

export interface ParsedTerm {
  start: string // ISO date
  end: string // ISO date
  years: number
  basis: 'years-from-date' | 'date-range' | 'years-from-lease-date'
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const iso = (y: number, m: number, d: number) => {
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? dt.toISOString().slice(0, 10) : null
}

/** UK-style dates: "24 June 1985", "24th Jun 1985", "24/06/1985", "24.6.85", "1985-06-24". */
export function parseUkDate(s: string): string | null {
  const t = s.trim().toLowerCase()
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return iso(+m[1], +m[2], +m[3])
  m = t.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+(?:day\s+of\s+)?([a-z]{3,9})\.?,?\s+(\d{4})/)
  if (m) {
    const mi = MONTHS.indexOf(m[2].slice(0, 3))
    return mi >= 0 ? iso(+m[3], mi + 1, +m[1]) : null
  }
  m = t.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/)
  if (m) {
    let y = +m[3]
    if (y < 100) y += y > 30 ? 1900 : 2000
    return iso(y, +m[2], +m[1])
  }
  return null
}

const addYears = (isoDate: string, years: number) => {
  const d = new Date(isoDate + 'T00:00:00Z')
  d.setUTCFullYear(d.getUTCFullYear() + years)
  return d.toISOString().slice(0, 10)
}

export function parseLeaseTerm(term: string | undefined, dateOfLease?: string): ParsedTerm | null {
  if (!term) return null
  const t = term.replace(/\s+/g, ' ').trim()
  const leaseDate = dateOfLease ? parseUkDate(dateOfLease) : null

  const range = t.match(/from\s+(?:and\s+including\s+|and\s+including\s+the\s+)?(.+?)\s+(?:to|until|expiring(?: on)?)\s+(?:and\s+including\s+)?(.+)$/i)
  if (range) {
    const start = parseUkDate(range[1])
    const end = parseUkDate(range[2])
    if (start && end && end > start) return { start, end, years: Math.round(((+new Date(end) - +new Date(start)) / (365.25 * 86400_000)) * 10) / 10, basis: 'date-range' }
  }
  const yrs = t.match(/(\d{1,4})\s*years?\b/i)
  if (!yrs) return null
  const years = Number(yrs[1])
  if (!(years > 0 && years <= 9999)) return null
  const after = t.slice((yrs.index ?? 0) + yrs[0].length)
  const from = after.match(/(?:from|commencing|beginning|starting)\s+(?:on\s+)?(?:and\s+including\s+)?(?:the\s+)?(.+)$/i)
  if (from) {
    if (/date\s+(?:of\s+(?:the\s+)?lease|hereof)/i.test(from[1])) return leaseDate ? { start: leaseDate, end: addYears(leaseDate, years), years, basis: 'years-from-lease-date' } : null
    const start = parseUkDate(from[1])
    if (start) return { start, end: addYears(start, years), years, basis: 'years-from-date' }
    return null
  }
  // A bare "99 years" is commonly from the lease date, but that is an assumption: only use it with the lease date.
  return leaseDate && /^\s*\d{1,4}\s*years?\s*(\(.*\))?\s*$/i.test(t) ? { start: leaseDate, end: addYears(leaseDate, years), years, basis: 'years-from-lease-date' } : null
}

/** Years left on the lease at a given date (negative = expired). */
export function yearsRemaining(p: ParsedTerm, at: string): number {
  return Math.round(((+new Date(p.end) - +new Date(at)) / (365.25 * 86400_000)) * 10) / 10
}

/** Lease status for valuation purposes from years left at the sale date. */
export function leaseStatusFromYears(y: number): 'long' | 'short' | 'unknown' {
  return y >= 90 ? 'long' : y < 80 ? 'short' : 'unknown'
}
