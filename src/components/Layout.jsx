import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, ScanLine, Package, History,
  BarChart2, Users, LogOut, ChevronRight, Bell, Sun, Moon, FileSpreadsheet
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'

const navItems = [
  { path: '/', label: 'แดชบอร์ด', mobileLabel: 'หน้าหลัก', icon: LayoutDashboard, roles: ['admin', 'manager', 'staff'] },
  { path: '/scan', label: 'สแกนสต็อก', mobileLabel: 'สแกน', icon: ScanLine, roles: ['admin', 'manager', 'staff'] },
  { path: '/products', label: 'จัดการสินค้า', mobileLabel: 'สินค้า', icon: Package, roles: ['admin', 'manager'] },
  { path: '/transactions', label: 'ประวัติธุรกรรม', mobileLabel: 'ธุรกรรม', icon: History, roles: ['admin', 'manager', 'staff'] },
  { path: '/reports', label: 'รายงาน', mobileLabel: 'รายงาน', icon: BarChart2, roles: ['admin', 'manager'] },
  { path: '/notifications', label: '🔔 แจ้งเตือน', mobileLabel: 'แจ้ง', icon: Bell, roles: ['admin', 'manager', 'staff'] },
  { path: '/order-import', label: 'นำเข้าคำสั่งซื้อ', mobileLabel: 'คำสั่งซื้อ', icon: FileSpreadsheet, roles: ['admin', 'manager'] },
  { path: '/users', label: 'จัดการ User', mobileLabel: 'ผู้ใช้', icon: Users, roles: ['admin'] },
]

export default function Layout({ children }) {
  const { profile, signOut } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const location = useLocation()
  const navigate = useNavigate()

  const role = profile?.role || 'staff'
  const visibleItems = navItems.filter(item => item.roles.includes(role))

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="flex h-screen bg-slate-100">
      {/* Dark/light toggle - fixed top-right of screen (desktop) */}
      <button
        onClick={toggleTheme}
        className="hidden lg:flex fixed top-3 right-3 z-30 w-10 h-10 rounded-full bg-white shadow-md border border-slate-200 items-center justify-center text-slate-600 hover:bg-slate-50 transition-colors"
        aria-label="สลับโหมดมืด/สว่าง"
      >
        {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
      </button>

      {/* Sidebar - desktop only */}
      <aside className="hidden lg:flex flex-col w-64 bg-white shadow-lg shrink-0">
        <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-100">
          <div className="w-9 h-9 bg-red-600 rounded-lg flex items-center justify-center shrink-0">
            <Package size={18} className="text-white" />
          </div>
          <div>
            <p className="font-bold text-slate-800 text-base leading-tight">Stock Sourcing</p>
            <p className="text-[10px] text-slate-400 leading-tight">ระบบจัดการสต็อก</p>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {visibleItems.map(({ path, label, icon: Icon }) => {
            const active = location.pathname === path
            return (
              <Link
                key={path}
                to={path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? 'bg-red-50 text-red-700'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Icon size={18} />
                {label}
                {active && <ChevronRight size={16} className="ml-auto" />}
              </Link>
            )
          })}
        </nav>

        <div className="px-3 py-4 border-t border-slate-100">
          <div className="flex items-center gap-3 px-3 py-2 mb-2">
            <div className="w-8 h-8 bg-slate-200 rounded-full flex items-center justify-center text-sm font-bold text-slate-600">
              {profile?.full_name?.[0]?.toUpperCase() || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-800 truncate">{profile?.full_name || 'User'}</p>
              <p className="text-xs text-slate-500 capitalize">{role}</p>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-3 px-3 py-2.5 w-full rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
          >
            <LogOut size={18} />
            ออกจากระบบ
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top header */}
        <header className="lg:hidden bg-red-600 px-4 py-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-white/20 rounded-lg flex items-center justify-center">
              <Package size={15} className="text-white" />
            </div>
            <div>
              <p className="font-bold text-white text-sm leading-tight">Stock Sourcing</p>
              <p className="text-[9px] text-red-200 leading-tight">ระบบจัดการสต็อก</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center text-sm font-bold text-white">
              {profile?.full_name?.[0]?.toUpperCase() || 'U'}
            </div>
            <button
              onClick={toggleTheme}
              className="p-2 text-red-200 hover:text-white transition-colors"
              aria-label="สลับโหมดมืด/สว่าง"
            >
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button
              onClick={handleSignOut}
              className="p-2 text-red-200 hover:text-white transition-colors"
              aria-label="ออกจากระบบ"
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-4 lg:p-6 pb-24 lg:pb-6">
          {children}
        </main>

        {/* Mobile bottom tab bar */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-20 flex safe-area-bottom">
          {visibleItems.map(({ path, mobileLabel, icon: Icon }) => {
            const active = location.pathname === path
            return (
              <Link
                key={path}
                to={path}
                className={`flex-1 flex flex-col items-center justify-center py-2.5 gap-1 transition-colors min-h-[60px] ${
                  active ? 'text-red-600' : 'text-slate-400'
                }`}
              >
                <Icon size={22} strokeWidth={active ? 2.5 : 2} />
                <span className="text-[10px] font-medium leading-none">{mobileLabel}</span>
              </Link>
            )
          })}
        </nav>
      </div>
    </div>
  )
}
