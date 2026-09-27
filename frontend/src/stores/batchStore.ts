import { create } from 'zustand'
import type { BatchAnomaly, CollectBatch, Specimen } from '@/types'
import { findBatchAnomalies } from '@/types'
import { db, deleteRow, loadAll, putRow } from '@/hooks/usePersistentStore'

/** 当前批次选择持久化在 localStorage，刷新后登记页面仍带批次 */
const CURRENT_KEY = 'gbinsectlog.currentBatch'

function readCurrentId(): string {
  try {
    return localStorage.getItem(CURRENT_KEY) ?? ''
  } catch {
    return ''
  }
}

export interface SealResult {
  ok: boolean
  anomalies: BatchAnomaly[]
}

export interface BatchState {
  rows: CollectBatch[]
  loaded: boolean
  /** 采集登记页当前选用的批次 id，空串表示未选用 */
  currentId: string
  hydrate: () => Promise<void>
  save: (row: CollectBatch) => Promise<void>
  remove: (id: string) => Promise<void>
  setCurrent: (id: string) => void
  /** 收队封存：存在异常标本（日期超范围 / 采集地不在计划内）时暂不封存并返回异常清单 */
  seal: (id: string) => Promise<SealResult>
}

export const batchStore = create<BatchState>((set, get) => ({
  rows: [],
  loaded: false,
  currentId: readCurrentId(),
  hydrate: async () => {
    const rows = await loadAll<CollectBatch>(db.batches)
    rows.sort((a, b) => b.dateStart.localeCompare(a.dateStart, 'zh-Hans-CN') || a.name.localeCompare(b.name, 'zh-Hans-CN'))
    // 当前批次被删除或已封存时自动失效
    const current = rows.find((row) => row.id === get().currentId && !row.sealed)
    set({ rows, loaded: true, currentId: current ? current.id : '' })
  },
  save: async (row) => {
    await putRow<CollectBatch>(db.batches, row)
    await get().hydrate()
  },
  remove: async (id) => {
    await deleteRow<CollectBatch>(db.batches, id)
    await get().hydrate()
  },
  setCurrent: (id) => {
    try {
      if (id) {
        localStorage.setItem(CURRENT_KEY, id)
      } else {
        localStorage.removeItem(CURRENT_KEY)
      }
    } catch {
      // localStorage 不可用时仅保留内存状态
    }
    set({ currentId: id })
  },
  seal: async (id) => {
    const batch = get().rows.find((row) => row.id === id)
    if (!batch) return { ok: false, anomalies: [] }
    if (batch.sealed) return { ok: true, anomalies: [] }
    const specimens = await loadAll<Specimen>(db.specimens)
    const anomalies = findBatchAnomalies(batch, specimens)
    if (anomalies.length > 0) return { ok: false, anomalies }
    const sealedDate = new Date().toISOString().slice(0, 10)
    await putRow<CollectBatch>(db.batches, { ...batch, sealed: true, sealedDate })
    await get().hydrate()
    return { ok: true, anomalies: [] }
  }
}))
