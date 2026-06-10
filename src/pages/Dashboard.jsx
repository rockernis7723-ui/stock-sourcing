import { useEffect, useState } from 'react'
import { Package, TrendingUp, TrendingDown, AlertTriangle, Clock, Zap } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { supabase } from '../lib/supabase'

function StatCard({ title, value, subtitle, icon: Icon, color }) {
  return (
    <div className="bg-white rounded-xl p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-slate-500">{title}</p>
          <p className="text-2xl font-bold text-slate-800 mt-1">{value}</p>
          {subtitle && <p className="text-xs text-slate-400 mt-1">{subtitle}</p>}
        </div>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
          <Icon size={20} className="text-white" />
        </div>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [stats, setStats] = useState({ total: 0, lowStock: 0, nearExpiry: 0, todayIn: 0, todayOut: 0 })
  const [chartData, setChartData] = useState([])
  const [recentTx, setRecentTx] = useState([])
  const [fifoAlerts, setFifoAlerts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchDashboard()
  }, [])

  async function fetchDashboard() {
    const today = new Date().toISOString().split('T')[0]
    const thirtyDaysLater = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    const [productsRes, lowStockRes, nearExpiryRes, todayTxRes, recentRes, weeklyRes, fifoRes] = await Promise.all([
      supabase.from('products').select('id', { count: 'exact', head: true }),
      supabase.from('products').select('id', { count: 'exact', head: true }).lt('current_stock', 'min_stock'),
      supabase.from('stock_lots').select('id', { count: 'exact', head: true }).lte('expiry_date', thirtyDaysLater).gt('expiry_date', today).gt('quantity', 0),
      supabase.from('transactions').select('type').gte('created_at', today + 'T00:00:00'),
      supabase.from('transactions').select('*, products(name), expiry_date').order('created_at', { ascending: false }).limit(8),
      supabase.rpc('weekly_summary'),
      supabase.from('stock_lots').select('*, products(name)').gt('quantity', 0).order('expiry_date').limit(5),
    ])

    const todayIn = todayTxRes.data?.filter(t => t.type === 'IN').length || 0
    const todayOut = todayTxRes.data?.filter(t => t.type === 'OUT').length || 0

    setStats({
      total: productsRes.count || 0,
      lowStock: lowStockRes.count || 0,
      nearExpiry: nearExpiryRes.count || 0,
      todayIn,
      todayOut,
    })
    setRecentTx(recentRes.data || [])
    setChartData(weeklyRes.data || [])
    setFifoAlerts(fifoRes.data || [])
    setLoading(false)
  }

  if (loading) return <div className="flex items-center justify-center h-64 text-slate-400">กำลังโหลด...</div>

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-slate-800">แดชบอร์ด</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="สินค้าทั้งหมด" value={stats.total} subtitle="รายการ" icon={Package} color="bg-red-500" />
        <StatCard title="รับเข้าวันนี้" value={stats.todayIn} subtitle="รายการ" icon={TrendingUp} color="bg-green-500" />
        <StatCard title="จ่ายออกวันนี้" value={stats.todayOut} subtitle="รายการ" icon={TrendingDown} color="bg-red-500" />
        <StatCard title="สต็อกต่ำ" value={stats.lowStock} subtitle="รายการ" icon={AlertTriangle} color="bg-red-500" />
      </div>

      {stats.nearExpiry > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex items-center gap-3">
          <Clock size={20} className="text-yellow-600 shrink-0" />
          <p className="text-sm text-yellow-800">
            มีสินค้า <strong>{stats.nearExpiry} ล็อต</strong> ที่จะหมดอายุภายใน 30 วัน
          </p>
        </div>
      )}

      {fifoAlerts.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="flex items-center gap-3 mb-3">
            <Zap size={20} className="text-blue-600 shrink-0" />
            <p className="font-semibold text-blue-800">🎯 FIFO - เอาของเก่าออกก่อน</p>
          </div>
          <div className="space-y-2">
            {fifoAlerts.map((lot, idx) => (
              <div key={lot.id} className="flex items-center justify-between bg-white rounded-lg p-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800">{lot.products?.name}</p>
                  <p className="text-xs text-slate-500">คงเหลือ {lot.quantity} ล็อต</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-red-600">
                    {new Date(lot.expiry_date).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' })}
                  </p>
                  <p className="text-xs text-slate-400">หมดอายุ</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl p-5 shadow-sm">
          <h2 className="font-semibold text-slate-700 mb-4">IN / OUT รายสัปดาห์</h2>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="in" name="รับเข้า" fill="#22c55e" radius={[4,4,0,0]} />
                <Bar dataKey="out" name="จ่ายออก" fill="#f97316" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-slate-400 text-sm">ยังไม่มีข้อมูล</div>
          )}
        </div>

        <div className="bg-white rounded-xl p-5 shadow-sm">
          <h2 className="font-semibold text-slate-700 mb-4">ธุรกรรมล่าสุด</h2>
          <div className="space-y-2">
            {recentTx.length === 0 && <p className="text-slate-400 text-sm text-center py-8">ยังไม่มีธุรกรรม</p>}
            {recentTx.map(tx => (
              <div key={tx.id} className="py-2 border-b border-slate-50 last:border-0">
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${tx.type === 'IN' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                    {tx.type}
                  </span>
                  <span className="text-sm text-slate-700 flex-1 truncate">{tx.products?.name}</span>
                  <span className="text-sm font-medium text-slate-800 shrink-0">{tx.quantity}</span>
                  <span className="text-xs text-slate-400 shrink-0">{new Date(tx.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                {tx.type === 'IN' && tx.expiry_date && (
                  <p className="text-xs text-red-600 mt-1 ml-12">📅 หมดอายุ: {new Date(tx.expiry_date).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' })}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
