import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { CollectBatch } from '@/types'
import { findBatchAnomalies, plannedSiteCoverage } from '@/types'
import { usePersistentStore } from '@/hooks/usePersistentStore'
import { batchStore } from '@/stores/batchStore'
import { specimenStore } from '@/stores/specimenStore'
import { siteStore } from '@/stores/siteStore'
import { uid } from '@/utils/id'

interface BatchForm {
  name: string
  dateStart: string
  dateEnd: string
  leader: string
  siteIds: string[]
  note: string
}

const today = new Date().toISOString().slice(0, 10)

const EMPTY_FORM: BatchForm = {
  name: '',
  dateStart: today,
  dateEnd: today,
  leader: '',
  siteIds: [],
  note: ''
}

/** 采集批次：建立批次、计划点位覆盖（漏采提示）、收队封存前异常检查、空批次清除 */
export default function BatchesPage(): JSX.Element {
  const batches = usePersistentStore(batchStore, (state) => state.rows)
  const currentId = usePersistentStore(batchStore, (state) => state.currentId)
  const specimens = usePersistentStore(specimenStore, (state) => state.rows)
  const sites = usePersistentStore(siteStore, (state) => state.rows)

  const [form, setForm] = useState<BatchForm>(EMPTY_FORM)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const siteMap = useMemo(() => new Map(sites.map((site) => [site.id, site])), [sites])
  const countOf = (batchId: string): number => specimens.filter((item) => item.batchId === batchId).length

  const patch = (next: Partial<BatchForm>): void => setForm((prev) => ({ ...prev, ...next }))

  const toggleSite = (siteId: string): void => {
    setForm((prev) => ({
      ...prev,
      siteIds: prev.siteIds.includes(siteId) ? prev.siteIds.filter((id) => id !== siteId) : [...prev.siteIds, siteId]
    }))
  }

  const submit = async (): Promise<void> => {
    if (!form.name.trim()) {
      setError('请填写批次名称')
      return
    }
    if (!form.leader.trim()) {
      setError('请填写负责人')
      return
    }
    if (!form.dateStart || !form.dateEnd || form.dateStart > form.dateEnd) {
      setError('批次日期范围无效（起始日期不能晚于结束日期）')
      return
    }
    setError('')
    const row: CollectBatch = {
      id: uid('batch'),
      name: form.name.trim(),
      dateStart: form.dateStart,
      dateEnd: form.dateEnd,
      leader: form.leader.trim(),
      siteIds: form.siteIds,
      sealed: false,
      sealedDate: '',
      note: form.note.trim()
    }
    await batchStore.getState().save(row)
    batchStore.getState().setCurrent(row.id)
    setMessage(`批次「${row.name}」已建立并设为当前批次，之后登记的标本会自动带入`)
    setForm(EMPTY_FORM)
  }

  const seal = async (batch: CollectBatch): Promise<void> => {
    const result = await batchStore.getState().seal(batch.id)
    if (result.ok) {
      setError('')
      setMessage(`批次「${batch.name}」已封存（${new Date().toISOString().slice(0, 10)}），不再接收新标本`)
    } else {
      setMessage('')
      setError(
        `批次「${batch.name}」有 ${result.anomalies.length} 份异常标本（日期超范围或采集地不在计划内），已暂不封存；请在下方异常清单核对，调整归属或修正信息后再封存`
      )
    }
  }

  const moveAllOut = async (batch: CollectBatch): Promise<void> => {
    const ids = specimens.filter((item) => item.batchId === batch.id).map((item) => item.id)
    if (ids.length === 0) return
    await specimenStore.getState().bulkSetBatch(ids, '')
    setError('')
    setMessage(`已把 ${ids.length} 份标本移出「${batch.name}」（置为未关联批次），现在可以清除该批次`)
  }

  const remove = async (batch: CollectBatch): Promise<void> => {
    const count = countOf(batch.id)
    if (count > 0) {
      setMessage('')
      setError(`「${batch.name}」下仍有 ${count} 份标本，请先把标本移走（点「移出全部标本」，或在标本清单批量调整归属）再清除批次`)
      return
    }
    await batchStore.getState().remove(batch.id)
    setError('')
    setMessage(`批次「${batch.name}」已清除`)
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">采集批次</h1>
          <p className="page-sub">
            每次外出建立一个批次：先定名称、日期范围、负责人与计划采集地；收队封存前会检查日期超范围、采集地不在计划内的异常标本，封存后不再接收新标本。
          </p>
        </div>
        <Link className="btn-ghost" to="/collect">
          去采集登记
        </Link>
      </header>

      <section className="panel flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-slate-700">新建批次</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <span className="field-label">批次名称</span>
            <input className="field-input" value={form.name} onChange={(e) => patch({ name: e.target.value })} placeholder="如 黔南综合考察 · 第二批" />
          </div>
          <div>
            <span className="field-label">负责人</span>
            <input className="field-input" value={form.leader} onChange={(e) => patch({ leader: e.target.value })} placeholder="如 陆昀" />
          </div>
          <div>
            <span className="field-label">备注</span>
            <input className="field-input" value={form.note} onChange={(e) => patch({ note: e.target.value })} placeholder="样线安排、天气等（可空）" />
          </div>
          <div>
            <span className="field-label">采集日期起</span>
            <input type="date" className="field-input" value={form.dateStart} onChange={(e) => patch({ dateStart: e.target.value })} />
          </div>
          <div>
            <span className="field-label">采集日期止</span>
            <input type="date" className="field-input" value={form.dateEnd} onChange={(e) => patch({ dateEnd: e.target.value })} />
          </div>
          <div className="md:col-span-3">
            <span className="field-label">计划采集地（勾选，可不选表示未限定）</span>
            <div className="grid max-h-36 gap-1 overflow-y-auto rounded-lg border border-slate-200 p-2 md:grid-cols-2">
              {sites.map((site) => (
                <label key={site.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-field-50">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-field-600"
                    checked={form.siteIds.includes(site.id)}
                    onChange={() => toggleSite(site.id)}
                  />
                  <span className="font-mono text-xs text-field-700">{site.code}</span>
                  <span className="truncate">{site.name}</span>
                </label>
              ))}
              {sites.length === 0 ? <p className="px-2 py-1 text-xs text-slate-400">还没有采集地，请先到「采集地管理」建立</p> : null}
            </div>
          </div>
        </div>
        {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        {message ? <p className="text-sm text-field-700">{message}</p> : null}
        <div>
          <button className="btn-primary" type="button" onClick={() => void submit()}>
            建立批次并设为当前批次
          </button>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {batches.map((batch) => {
          const count = countOf(batch.id)
          const coverage = plannedSiteCoverage(batch, specimens)
          const anomalies = batch.sealed ? [] : findBatchAnomalies(batch, specimens)
          const missed = batch.siteIds.filter((siteId) => (coverage.get(siteId) ?? 0) === 0).length
          return (
            <article key={batch.id} className="panel flex flex-col gap-2" data-testid="batch-card">
              <header className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">
                    {batch.name}
                    {currentId === batch.id ? (
                      <span className="ml-2 rounded-full bg-field-600 px-2 py-0.5 text-xs font-normal text-white">当前批次</span>
                    ) : null}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {batch.dateStart} ~ {batch.dateEnd} · 负责人 {batch.leader || '—'}
                  </p>
                </div>
                {batch.sealed ? (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">已封存 {batch.sealedDate}</span>
                ) : (
                  <span className="rounded-full bg-field-50 px-2 py-0.5 text-xs text-field-700">进行中</span>
                )}
              </header>

              {batch.note ? <p className="rounded-lg bg-slate-50 px-2 py-1 text-xs text-slate-500">{batch.note}</p> : null}

              <div className="text-xs text-slate-600">
                <p className="mb-1 text-slate-400">
                  计划采集地（{batch.siteIds.length > 0 ? `${batch.siteIds.length} 个点位` : '未限定'}）
                  {missed > 0 ? <span className="ml-1 text-amber-600">漏采 {missed} 个点位</span> : null}
                </p>
                {batch.siteIds.length > 0 ? (
                  <ul className="flex flex-wrap gap-1">
                    {batch.siteIds.map((siteId) => {
                      const site = siteMap.get(siteId)
                      const siteCount = coverage.get(siteId) ?? 0
                      return (
                        <li
                          key={siteId}
                          className={`rounded-full px-2 py-0.5 ${
                            siteCount === 0 ? 'bg-amber-50 text-amber-700' : 'bg-field-50 text-field-700'
                          }`}
                        >
                          {site ? `${site.code} ${site.name}` : '（已删除的采集地）'} × {siteCount}
                          {siteCount === 0 ? ' · 漏采' : ''}
                        </li>
                      )
                    })}
                  </ul>
                ) : null}
              </div>

              <p className="text-xs text-slate-500">已关联标本 {count} 份</p>

              {anomalies.length > 0 ? (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800" data-testid="batch-anomalies">
                  <p className="font-medium">异常标本 {anomalies.length} 份（封存前需处理）：</p>
                  <ul className="mt-1 space-y-0.5">
                    {anomalies.map((item) => (
                      <li key={item.specimen.id}>
                        <span className="font-mono">{item.specimen.code}</span>：{item.reasons.join('；')}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <footer className="mt-auto flex flex-wrap gap-2 pt-2">
                {!batch.sealed && currentId !== batch.id ? (
                  <button className="btn-ghost" type="button" onClick={() => batchStore.getState().setCurrent(batch.id)}>
                    设为当前批次
                  </button>
                ) : null}
                {!batch.sealed ? (
                  <button className="btn-primary" type="button" onClick={() => void seal(batch)}>
                    收队封存
                  </button>
                ) : null}
                {count > 0 ? (
                  <button className="btn-ghost" type="button" onClick={() => void moveAllOut(batch)}>
                    移出全部标本
                  </button>
                ) : null}
                <button className="btn-danger" type="button" onClick={() => void remove(batch)}>
                  清除批次
                </button>
              </footer>
            </article>
          )
        })}
        {batches.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-400">
            还没有采集批次，先在上方建立一个；也可以到「采集登记」页边登记边建
          </p>
        ) : null}
      </section>
    </div>
  )
}
