import type { Specimen } from './specimen'

/** CollectBatch 采集批次：一次外出行动的标本归集单位 */
export interface CollectBatch {
  id: string
  /** 批次名称，如「2026 黔南综合考察 · 第一批」 */
  name: string
  /** 计划采集日期范围 */
  dateStart: string
  dateEnd: string
  /** 负责人 */
  leader: string
  /** 计划采集地 id 列表（空表示未限定） */
  siteIds: string[]
  /** 是否已封存（收队），封存后不再接收新标本 */
  sealed: boolean
  /** 封存日期 */
  sealedDate: string
  note: string
}

/** 封存前检查出的异常标本 */
export interface BatchAnomaly {
  specimen: Specimen
  reasons: string[]
}

/**
 * 找出批次内的异常标本：
 * - 采集日期超出批次日期范围
 * - 采集地不在计划采集地内（批次未限定采集地时跳过该项检查）
 */
export function findBatchAnomalies(batch: CollectBatch, specimens: Specimen[]): BatchAnomaly[] {
  return specimens
    .filter((item) => item.batchId === batch.id)
    .map((specimen) => {
      const reasons: string[] = []
      if (specimen.collectDate < batch.dateStart || specimen.collectDate > batch.dateEnd) {
        reasons.push(`采集日期 ${specimen.collectDate} 超出批次范围 ${batch.dateStart} ~ ${batch.dateEnd}`)
      }
      if (batch.siteIds.length > 0 && !batch.siteIds.includes(specimen.siteId)) {
        reasons.push('采集地不在计划采集地内')
      }
      return { specimen, reasons }
    })
    .filter((item) => item.reasons.length > 0)
}

/** 计划采集地的覆盖情况：每个计划点位已关联的标本数（0 即漏采） */
export function plannedSiteCoverage(batch: CollectBatch, specimens: Specimen[]): Map<string, number> {
  const counts = new Map<string, number>()
  batch.siteIds.forEach((siteId) => counts.set(siteId, 0))
  specimens
    .filter((item) => item.batchId === batch.id)
    .forEach((item) => {
      if (counts.has(item.siteId)) counts.set(item.siteId, (counts.get(item.siteId) ?? 0) + 1)
    })
  return counts
}
