import { useEffect, useState } from 'react'
import { Search, Filter } from 'lucide-react'
import { supabase } from '../lib/supabase'

export default function Transactions() {
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('ALL')
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 20

  useEffect(() => { fetchTransactions() }, [typeFilter, page])

  async function fetchTransactions() {
    setLoading(true)
    let query = supabase
      .from('transactions')
      .select('*, products(name, unit), profiles(full_name)')
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    if (typeFilter !== 'ALL') query = query.eq('type', typeFilter)

    const { data } = await query
    setTransactions(data || [])
    setLoading(false)
  }

  const filtered = transactions.filter(t =>
    t.products?.name?.toLowerCase().includes(search.toLowerCase()) ||
    t.note?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-800">ประวัติธุรกรรม</h1>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหาสินค้า..."
            className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-500"
          />
        </div>
        <select
          value={typeFilter}
          onChange={e => { setTypeFilter(e.target.value); setPage(0) }}
          className="px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-500"
        >
          <option value="ALL">ทั้งหมด</option>
          <option value="IN">รับเข้า</option>
          <option value="OUT">จ่ายออก</option>
        </select>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-slate-400">กำลังโหลด...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-slate-400">ไม่มีข้อมูล</div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
                  <tr>
                    {['วันที่/เวลา', 'ประเภท', 'สินค้า', 'จำนวน', 'วันหมดอายุ', 'ผู้ดำเนินการ', 'หมายเหตุ'].map(h => (
                      <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filtered.map(tx => (
                    <tr key={tx.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                        {new Date(tx.created_at).toLocaleString('th-TH', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-bold px-2 py-1 rounded-full ${tx.type === 'IN' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                          {tx.type === 'IN' ? 'รับเข้า' : 'จ่ายออก'}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-800">{tx.products?.name}</td>
                      <td className="px-4 py-3 text-slate-700">{tx.quantity} {tx.products?.unit}</td>
                      <td className="px-4 py-3 text-slate-500">
                        {tx.expiry_date ? new Date(tx.expiry_date).toLocaleDateString('th-TH') : '-'}
                      </td>
                      <td className="px-4 py-3 text-slate-500">{tx.profiles?.full_name || '-'}</td>
                      <td className="px-4 py-3 text-slate-400">{tx.note || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="lg:hidden divide-y divide-slate-50">
              {filtered.map(tx => (
                <div key={tx.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-800 truncate">{tx.products?.name}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {new Date(tx.created_at).toLocaleString('th-TH', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        {tx.profiles?.full_name ? ` · ${tx.profiles.full_name}` : ''}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${tx.type === 'IN' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                        {tx.type === 'IN' ? '+' : '-'}{tx.quantity} {tx.products?.unit}
                      </span>
                      {tx.expiry_date && (
                        <p className="text-xs text-slate-400 mt-1">
                          หมดอายุ {new Date(tx.expiry_date).toLocaleDateString('th-TH')}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="flex justify-between items-center">
        <button
          disabled={page === 0}
          onClick={() => setPage(p => p - 1)}
          className="px-5 py-3 text-sm font-medium border border-slate-200 rounded-xl disabled:opacity-40 hover:bg-slate-50 transition-colors"
        >
          ← ก่อนหน้า
        </button>
        <span className="text-sm text-slate-500">หน้า {page + 1}</span>
        <button
          disabled={transactions.length < PAGE_SIZE}
          onClick={() => setPage(p => p + 1)}
          className="px-5 py-3 text-sm font-medium border border-slate-200 rounded-xl disabled:opacity-40 hover:bg-slate-50 transition-colors"
        >
          ถัดไป →
        </button>
      </div>
    </div>
  )
}
