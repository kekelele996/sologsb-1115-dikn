import type { CollectBatch, Specimen } from '@/types'

/** 批次异常标本：日期超出批次范围，或采集地不在计划内 */
export interface BatchAnomaly {
  specimen: Specimen
  reasons: string[]
}

/** 检查批次内标本，找出日期超范围或采集地不在计划内的异常标本 */
export function findBatchAnomalies(batch: CollectBatch, specimens: Specimen[]): BatchAnomaly[] {
  return specimens
    .filter((item) => item.batchId === batch.id)
    .map((item) => {
      const reasons: string[] = []
      if (item.collectDate && (item.collectDate < batch.dateStart || item.collectDate > batch.dateEnd)) {
        reasons.push(`采集日期 ${item.collectDate} 超出批次范围 ${batch.dateStart} ~ ${batch.dateEnd}`)
      }
      if (batch.siteIds.length > 0 && !batch.siteIds.includes(item.siteId)) {
        reasons.push('采集地不在本批次计划内')
      }
      return { specimen: item, reasons }
    })
    .filter((entry) => entry.reasons.length > 0)
}
