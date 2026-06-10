import { useEffect, useState } from 'react'
import { AlertTriangle, Clock, CheckCircle, Trash2, AlertCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'

export default function Notifications() {
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all') // 'all', 'unread', 'low_stock', 'near_expiry'

  useEffect(() => {
    fetchNotifications()
    // โหลดข้อมูล + เช็คเพื่อสร้าง notification ใหม่
    checkAndCreateNotifications()
  }, [])

  async function fetchNotifications() {
    const { data } = await supabase
      .from('notifications')
      .select('*, products(name, barcode, current_stock, min_stock)')
      .order('created_at', { ascending: false })
      .limit(100)
    setNotifications(data || [])
    setLoading(false)
  }

  async function checkAndCreateNotifications() {
    // เช็ค Low Stock
    const { data: lowStockProducts } = await supabase
      .from('products')
      .select('*')
      .or(`current_stock.lte.min_stock`)

    // เช็ค Near Expiry (ใน 30 วัน)
    const thirtyDaysLater = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const today = new Date().toISOString().split('T')[0]
    const { data: nearExpiryLots } = await supabase
      .from('stock_lots')
      .select('*, products(name, id)')
      .lte('expiry_date', thirtyDaysLater)
      .gt('expiry_date', today)
      .gt('quantity', 0)

    // สร้าง Notification สำหรับ Low Stock
    if (lowStockProducts) {
      for (const product of lowStockProducts) {
        const existing = notifications.find(
          n => n.type === 'low_stock' && n.product_id === product.id && !n.read
        )
        if (!existing) {
          await supabase.from('notifications').insert({
            type: 'low_stock',
            product_id: product.id,
            title: `⚠️ สต็อกต่ำ: ${product.name}`,
            message: `สต็อกเหลือเพียง ${product.current_stock} ${product.unit} (ขั้นต่ำ: ${product.min_stock})`,
          })
        }
      }
    }

    // สร้าง Notification สำหรับ Near Expiry
    if (nearExpiryLots) {
      for (const lot of nearExpiryLots) {
        const existing = notifications.find(
          n => n.type === 'near_expiry' && n.product_id === lot.product_id && !n.read
        )
        if (!existing) {
          const daysUntilExpiry = Math.ceil(
            (new Date(lot.expiry_date) - new Date()) / (1000 * 60 * 60 * 24)
          )
          await supabase.from('notifications').insert({
            type: 'near_expiry',
            product_id: lot.product_id,
            title: `🕐 เกือบหมดอายุ: ${lot.products?.name}`,
            message: `หมดอายุภายใน ${daysUntilExpiry} วัน (${new Date(lot.expiry_date).toLocaleDateString('th-TH')})`,
          })
        }
      }
    }

    fetchNotifications()
  }

  async function markAsRead(id) {
    await supabase.from('notifications').update({ read: true }).eq('id', id)
    fetchNotifications()
  }

  async function deleteNotification(id) {
    await supabase.from('notifications').delete().eq('id', id)
    fetchNotifications()
  }

  async function markAllAsRead() {
    await supabase.from('notifications').update({ read: true }).eq('read', false)
    fetchNotifications()
  }

  const filtered = notifications.filter(n => {
    if (filter === 'unread') return !n.read
    if (filter === 'low_stock') return n.type === 'low_stock'
    if (filter === 'near_expiry') return n.type === 'near_expiry'
    return true
  })

  const unreadCount = notifications.filter(n => !n.read).length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">แจ้งเตือน</h1>
          {unreadCount > 0 && (
            <p className="text-sm text-red-600">มี {unreadCount} รายการใหม่</p>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllAsRead}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            ทำเครื่องหมาย "อ่านแล้ว" ทั้งหมด
          </button>
        )}
      </div>

      {/* Filter Buttons */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {[
          { value: 'all', label: 'ทั้งหมด' },
          { value: 'unread', label: '⭐ ยังไม่อ่าน' },
          { value: 'low_stock', label: '⚠️ สต็อกต่ำ' },
          { value: 'near_expiry', label: '🕐 เกือบหมดอายุ' },
        ].map(f => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
              filter === f.value
                ? 'bg-red-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Notifications List */}
      <div className="space-y-3">
        {loading ? (
          <div className="text-center py-12 text-slate-400">กำลังโหลด...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <AlertCircle size={48} className="mx-auto text-slate-300 mb-3" />
            <p className="text-slate-400">ไม่มีแจ้งเตือน</p>
          </div>
        ) : (
          filtered.map(notification => (
            <div
              key={notification.id}
              className={`rounded-xl p-4 ${
                notification.read ? 'bg-slate-50' : 'bg-blue-50 border-l-4 border-blue-500'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="text-2xl mt-1">
                  {notification.type === 'low_stock' ? '⚠️' : '🕐'}
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-slate-800">{notification.title}</p>
                  <p className="text-sm text-slate-600 mt-1">{notification.message}</p>
                  <p className="text-xs text-slate-400 mt-2">
                    {new Date(notification.created_at).toLocaleString('th-TH')}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  {!notification.read && (
                    <button
                      onClick={() => markAsRead(notification.id)}
                      className="p-2 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                      title="ทำเครื่องหมายว่าอ่านแล้ว"
                    >
                      <CheckCircle size={18} />
                    </button>
                  )}
                  <button
                    onClick={() => deleteNotification(notification.id)}
                    className="p-2 text-red-600 hover:bg-red-100 rounded-lg transition-colors"
                    title="ลบ"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
