'use client'
// src/app/admin/repair-covers/page.tsx

import { useState } from 'react'

export default function RepairCoversPage() {
  const [dryRun, setDryRun] = useState(true)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<any[]>([])
  const [totals, setTotals] = useState<any>(null)

  const handleRepairAll = async () => {
    setLoading(true)
    setResults([])
    setTotals(null)

    // Prima prendi tutti i user_id distinti
    const usersRes = await fetch('/api/admin/repair-covers/users')
    const usersData = await usersRes.json()
    const userIds: string[] = usersData.user_ids || []

    const allResults: any[] = []
    let totalChecked = 0, totalBroken = 0, totalRepaired = 0, totalNotFound = 0

    for (const userId of userIds) {
      const res = await fetch('/api/admin/repair-covers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, dry_run: dryRun, admin_secret: 'geekore_admin' }),
      })
      const data = await res.json()
      if (data.broken > 0) {
        allResults.push({ userId, ...data })
      }
      totalChecked  += data.checked  || 0
      totalBroken   += data.broken   || 0
      totalRepaired += data.repaired || 0
      totalNotFound += data.not_found || 0
      setResults([...allResults])
    }

    setTotals({ checked: totalChecked, broken: totalBroken, repaired: totalRepaired, not_found: totalNotFound })
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Repair Cover Images</h1>
      <p className="text-zinc-500 text-sm mb-8">Ripara tutte le cover rotte per tutti gli utenti con un click.</p>

      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => setDryRun(v => !v)}
          className={`w-10 h-6 rounded-full transition-colors ${dryRun ? 'bg-violet-600' : 'bg-zinc-700'}`}
        >
          <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform mx-0.5 ${dryRun ? 'translate-x-4' : 'translate-x-0'}`} />
        </button>
        <span className="text-sm text-zinc-300">
          Dry run {dryRun
            ? <span className="text-violet-400">(attivo — non modifica nulla)</span>
            : <span className="text-emerald-400">(disattivo — modifica il DB)</span>}
        </span>
      </div>

      <button
        onClick={handleRepairAll}
        disabled={loading}
        className="w-full py-3 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 rounded-2xl font-semibold text-sm transition"
      >
        {loading ? 'In esecuzione...' : dryRun ? 'Dry Run — tutti gli utenti' : 'Ripara tutti gli utenti'}
      </button>

      {totals && (
        <div className="mt-6 bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
          <p className="text-sm font-semibold text-white mb-4">
            {dryRun ? '[DRY RUN] ' : ''}{totals.repaired} cover {dryRun ? 'da riparare' : 'riparate'} su {totals.broken} rotte trovate ({totals.checked} totali controllate)
          </p>
          <div className="grid grid-cols-4 gap-3 mb-4">
            {[
              { label: 'Controllati', value: totals.checked, color: 'text-zinc-400' },
              { label: 'Rotti', value: totals.broken, color: 'text-red-400' },
              { label: 'Riparati', value: totals.repaired, color: 'text-emerald-400' },
              { label: 'Non trovati', value: totals.not_found, color: 'text-yellow-400' },
            ].map(({ label, value, color }) => (
              <div key={label} className="text-center">
                <p className={`text-2xl font-bold ${color}`}>{value}</p>
                <p className="text-xs text-zinc-600 mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          {results.length > 0 && (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {results.map((r, i) => (
                <div key={i} className="bg-zinc-800 rounded-xl p-3">
                  <p className="text-xs text-zinc-500 font-mono mb-2">{r.userId}</p>
                  <div className="space-y-1">
                    {r.details?.map((d: any, j: number) => (
                      <div key={j} className="flex items-start gap-2 text-xs">
                        <span className={d.status === 'repaired' ? 'text-emerald-400' : 'text-yellow-400'}>
                          {d.status === 'repaired' ? '✓' : '✗'}
                        </span>
                        <span className="text-zinc-300 truncate">{d.title} <span className="text-zinc-600">({d.type})</span></span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}