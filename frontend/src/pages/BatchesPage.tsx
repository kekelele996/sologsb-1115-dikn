import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { CollectBatch } from '@/types'
import { usePersistentStore } from '@/hooks/usePersistentStore'
import { batchStore } from '@/stores/batchStore'
import { specimenStore } from '@/stores/specimenStore'
import { siteStore } from '@/stores/siteStore'
import { findBatchAnomalies, type BatchAnomaly } from '@/utils/batch'
import { uid } from '@/utils/id'

/** 批次删除时「移出全部标本」的下拉取值：不关联批次 */
const MOVE_NONE = '__none__'

/** 采集批次：先登记批次计划（名称/日期范围/负责人/计划采集地），标本自动归入当前批次，收队封存前做异常检查 */
export default function BatchesPage(): JSX.Element {
  const batches = usePersistentStore(batchStore, (state) => state.rows)
  const currentId = usePersistentStore(batchStore, (state) => state.currentId)
  const specimens = usePersistentStore(specimenStore, (state) => state.rows)
  const sites = usePersistentStore(siteStore, (state) => state.rows)

  const today = new Date().toISOString().slice(0, 10)
  const [name, setName] = useState('')
  const [dateStart, setDateStart] = useState(today)
  const [dateEnd, setDateEnd] = useState(today)
  const [leader, setLeader] = useState('')
  const [siteIds, setSiteIds] = useState<string[]>([])
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  /** 封存时被拦下的异常标本（按批次） */
  const [blocked, setBlocked] = useState<{ batchId: string; list: BatchAnomaly[] } | null>(null)
  /** 各批次「移出并清除」选择的目标批次 */
  const [moveTarget, setMoveTarget] = useState<Record<string, string>>({})

  const siteMap = useMemo(() => new Map(sites.map((site) => [site.id, site])), [sites])
  const countOf = (batchId: string): number => specimens.filter((item) => item.batchId === batchId).length

  const toggleSite = (id: string): void => {
    setSiteIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]))
  }

  const createBatch = async (): Promise<void> => {
    if (!name.trim()) {
      setError('请填写批次名称')
      return
    }
    if (!dateStart || !dateEnd || dateStart > dateEnd) {
      setError('日期范围无效：开始日期不能晚于结束日期')
      return
    }
    if (siteIds.length === 0) {
      setError('请至少勾选一个计划采集地')
      return
    }
    setError('')
    const batch: CollectBatch = {
      id: uid('batch'),
      name: name.trim(),
      dateStart,
      dateEnd,
      leader: leader.trim(),
      siteIds,
      sealed: false,
      sealedDate: '',
      note: note.trim()
    }
    await batchStore.getState().save(batch)
    // 新建批次自动设为当前批次，之后登记的标本自动带入
    await batchStore.getState().setCurrent(batch.id)
    setMessage(`批次「${batch.name}」已建立并设为当前批次，去「采集登记」录入的标本将自动归入该批次`)
    setName('')
    setLeader('')
    setSiteIds([])
    setNote('')
  }

  const sealBatch = async (batch: CollectBatch): Promise<void> => {
    const anomalies = findBatchAnomalies(batch, specimens)
    if (anomalies.length > 0) {
      // 存在异常标本：指出异常并暂不封存
      setBlocked({ batchId: batch.id, list: anomalies })
      setMessage(`批次「${batch.name}」存在 ${anomalies.length} 份异常标本，已暂不封存，请先核对或调整归属`)
      return
    }
    setBlocked(null)
    await batchStore.getState().seal(batch.id)
    setMessage(`批次「${batch.name}」已封存，之后不再接收新标本`)
  }

  const removeBatch = async (batch: CollectBatch): Promise<void> => {
    const inside = specimens.filter((item) => item.batchId === batch.id)
    if (inside.length > 0) {
      // 已有标本：先按所选目标移走，再清除批次
      const target = moveTarget[batch.id] ?? MOVE_NONE
      const targetId = target === MOVE_NONE ? '' : target
      await specimenStore.getState().bulkSetBatch(
        inside.map((item) => item.id),
        targetId
      )
      const targetName = targetId ? batches.find((item) => item.id === targetId)?.name ?? '' : '未关联批次'
      setMessage(`已把 ${inside.length} 份标本移至「${targetName}」，并清除批次「${batch.name}」`)
    } else {
      setMessage(`批次「${batch.name}」无关联标本，已清除`)
    }
    if (blocked?.batchId === batch.id) setBlocked(null)
    await batchStore.getState().remove(batch.id)
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">采集批次</h1>
          <p className="page-sub">
            每次外出建立一个批次：先写名称、日期范围、负责人与计划采集地；之后登记的标本自动带入当前批次，收队封存前会核对日期与采集地。
          </p>
        </div>
        <Link className="btn-ghost" to="/collect">
          去采集登记
        </Link>
      </header>

      <section className="panel flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-slate-700">新建批次</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <span className="field-label">批次名称</span>
            <input className="field-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="如 2026 黔南春季调查" />
          </div>
          <div>
            <span className="field-label">负责人</span>
            <input className="field-input" value={leader} onChange={(e) => setLeader(e.target.value)} placeholder="如 陆昀" />
          </div>
          <div>
            <span className="field-label">开始日期</span>
            <input type="date" className="field-input" value={dateStart} onChange={(e) => setDateStart(e.target.value)} />
          </div>
          <div>
            <span className="field-label">结束日期</span>
            <input type="date" className="field-input" value={dateEnd} onChange={(e) => setDateEnd(e.target.value)} />
          </div>
        </div>
        <div>
          <span className="field-label">计划采集地（勾选，封存时据此核对标本）</span>
          <div className="flex flex-wrap gap-2">
            {sites.map((site) => (
              <label
                key={site.id}
                className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm ${
                  siteIds.includes(site.id) ? 'border-field-500 bg-field-50 text-field-700' : 'border-slate-300 text-slate-600'
                }`}
              >
                <input
                  type="checkbox"
                  className="accent-field-600"
                  checked={siteIds.includes(site.id)}
                  onChange={() => toggleSite(site.id)}
                />
                <span className="font-mono text-xs">{site.code}</span> {site.name}
              </label>
            ))}
            {sites.length === 0 ? <p className="text-xs text-slate-400">暂无采集地，请先到「采集地管理」新增</p> : null}
          </div>
        </div>
        <div>
          <span className="field-label">备注</span>
          <input className="field-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="如 首轮样线与灯诱同步进行" />
        </div>
        {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        <div>
          <button className="btn-primary" type="button" onClick={() => void createBatch()}>
            建立批次并设为当前
          </button>
        </div>
      </section>

      {message ? <p className="text-sm text-field-700">{message}</p> : null}

      <section className="flex flex-col gap-3">
        {batches.map((batch) => {
          const count = countOf(batch.id)
          const plannedSites = batch.siteIds.map((id) => siteMap.get(id)?.name ?? id).join('、')
          const isCurrent = batch.id === currentId
          return (
            <article key={batch.id} className="panel flex flex-col gap-3" data-testid="batch-card">
              <header className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold text-slate-800">{batch.name}</h2>
                {isCurrent ? (
                  <span className="rounded-full bg-field-100 px-2 py-0.5 text-xs text-field-700">当前批次</span>
                ) : null}
                {batch.sealed ? (
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-600">
                    已封存 {batch.sealedDate}
                  </span>
                ) : (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">进行中</span>
                )}
                <span className="ml-auto text-xs text-slate-500">关联标本 {count} 份</span>
              </header>
              <dl className="grid gap-x-6 gap-y-1 text-xs text-slate-600 md:grid-cols-2 xl:grid-cols-4">
                <div>
                  <dt className="text-slate-400">日期范围</dt>
                  <dd>
                    {batch.dateStart} ~ {batch.dateEnd}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-400">负责人</dt>
                  <dd>{batch.leader || '—'}</dd>
                </div>
                <div className="md:col-span-2">
                  <dt className="text-slate-400">计划采集地</dt>
                  <dd>{plannedSites || '—'}</dd>
                </div>
              </dl>
              {batch.note ? <p className="rounded-lg bg-slate-50 px-2 py-1 text-xs text-slate-500">{batch.note}</p> : null}

              <div className="flex flex-wrap items-center gap-2">
                {!batch.sealed && !isCurrent ? (
                  <button
                    className="btn-ghost"
                    type="button"
                    onClick={() => void batchStore.getState().setCurrent(batch.id)}
                  >
                    设为当前批次
                  </button>
                ) : null}
                {!batch.sealed ? (
                  <button className="btn-primary" type="button" onClick={() => void sealBatch(batch)}>
                    收队封存
                  </button>
                ) : null}
                {count === 0 ? (
                  <button className="btn-danger" type="button" onClick={() => void removeBatch(batch)}>
                    清除批次
                  </button>
                ) : (
                  <span className="flex flex-wrap items-center gap-2">
                    <select
                      className="field-input w-48"
                      value={moveTarget[batch.id] ?? MOVE_NONE}
                      onChange={(e) => setMoveTarget((prev) => ({ ...prev, [batch.id]: e.target.value }))}
                    >
                      <option value={MOVE_NONE}>移至：不关联批次</option>
                      {batches
                        .filter((item) => item.id !== batch.id && !item.sealed)
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            移至：{item.name}
                          </option>
                        ))}
                    </select>
                    <button className="btn-danger" type="button" onClick={() => void removeBatch(batch)}>
                      移出 {count} 份标本并清除
                    </button>
                  </span>
                )}
              </div>

              {blocked?.batchId === batch.id ? (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-3" data-testid="batch-anomalies">
                  <p className="text-xs font-semibold text-amber-800">
                    以下 {blocked.list.length} 份标本异常，已暂不封存（可在「标本清单」按批次筛选后调整归属）：
                  </p>
                  <ul className="mt-1 space-y-1 text-xs text-amber-800">
                    {blocked.list.map(({ specimen, reasons }) => (
                      <li key={specimen.id}>
                        <span className="font-mono">{specimen.code}</span> — {reasons.join('；')}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </article>
          )
        })}
        {batches.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-400">
            还没有采集批次，先在上方建立一个
          </p>
        ) : null}
      </section>
    </div>
  )
}
