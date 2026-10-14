import { useMemo } from 'react'
import { analyseDeal, type DealAnalysis } from '../domain/analysis'
import type { Db } from '../domain/types'

export function useAnalyses(db: Db): Map<string, DealAnalysis> {
  return useMemo(() => new Map(db.deals.map((d) => [d.id, analyseDeal(d, db.settings)])), [db.deals, db.settings])
}
