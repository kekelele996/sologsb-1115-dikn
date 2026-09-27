import { create } from 'zustand'
import type { CollectBatch } from '@/types'
import { db, deleteRow, loadAll, putRow } from '@/hooks/usePersistentStore'

/** meta 表中记录「当前批次」的键 */
const CURRENT_KEY = 'currentBatchId'

export interface BatchState {
  rows: CollectBatch[]
  /** 当前批次 id：采集登记时新标本自动带入 */
  currentId: string
  loaded: boolean
  hydrate: () => Promise<void>
  save: (row: CollectBatch) => Promise<void>
  remove: (id: string) => Promise<void>
  setCurrent: (id: string) => Promise<void>
  /** 收队封存：封存后不再接收新标本（异常检查由调用方先行完成） */
  seal: (id: string) => Promise<void>
}

export const batchStore = create<BatchState>((set, get) => ({
  rows: [],
  currentId: '',
  loaded: false,
  hydrate: async () => {
    const rows = await loadAll<CollectBatch>(db.batches)
    rows.sort((a, b) => b.dateStart.localeCompare(a.dateStart) || a.name.localeCompare(b.name, 'zh-Hans-CN'))
    const meta = await db.meta.get(CURRENT_KEY)
    const currentId = typeof meta?.value === 'string' ? meta.value : ''
    const current = rows.find((row) => row.id === currentId)
    // 当前批次已删除或已封存时自动清空，避免新标本带入已封存批次
    const validCurrent = current && !current.sealed ? current.id : ''
    set({ rows, currentId: validCurrent, loaded: true })
  },
  save: async (row) => {
    await putRow<CollectBatch>(db.batches, row)
    await get().hydrate()
  },
  remove: async (id) => {
    await deleteRow<CollectBatch>(db.batches, id)
    if (get().currentId === id) {
      await get().setCurrent('')
    }
    await get().hydrate()
  },
  setCurrent: async (id) => {
    await db.meta.put({ key: CURRENT_KEY, value: id })
    set({ currentId: id })
  },
  seal: async (id) => {
    const batch = get().rows.find((row) => row.id === id)
    if (!batch || batch.sealed) return
    await putRow<CollectBatch>(db.batches, {
      ...batch,
      sealed: true,
      sealedDate: new Date().toISOString().slice(0, 10)
    })
    if (get().currentId === id) {
      await get().setCurrent('')
    }
    await get().hydrate()
  }
}))
