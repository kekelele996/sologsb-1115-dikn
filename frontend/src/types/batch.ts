/** CollectBatch 采集批次：一次外出调查行动的标本归集单位 */
export interface CollectBatch {
  id: string
  /** 批次名称，如「2026 黔南春季调查」 */
  name: string
  /** 计划日期范围 */
  dateStart: string
  dateEnd: string
  /** 负责人 */
  leader: string
  /** 计划采集地 id 列表 */
  siteIds: string[]
  /** 收队封存：封存后不再接收新标本 */
  sealed: boolean
  sealedDate: string
  note: string
}
