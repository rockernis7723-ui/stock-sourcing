import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, X, Shield, Eye, EyeOff } from 'lucide-react'
import { supabase } from '../lib/supabase'

const emptyForm = { full_name: '', email: '', password: '', role: 'staff' }
const roles = [
  { value: 'admin', label: 'Admin', desc: 'ทุกสิทธิ์', color: 'bg-red-100 text-red-700' },
  { value: 'manager', label: 'Manager', desc: 'จัดการสินค้า + รายงาน', color: 'bg-orange-100 text-orange-700' },
  { value: 'staff', label: 'Staff', desc: 'สแกนสต็อก + ดูประวัติ', color: 'bg-slate-100 text-slate-700' },
]

export default function Users() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => { fetchUsers() }, [])

  async function fetchUsers() {
    const { data } = await supabase.from('profiles').select('*').order('full_name')
    setUsers(data || [])
    setLoading(false)
  }

  function openCreate() {
    setForm(emptyForm)
    setEditId(null)
    setError('')
    setShowPassword(false)
    setModal(true)
  }

  function openEdit(u) {
    setForm({ full_name: u.full_name, email: u.email || '', role: u.role })
    setEditId(u.id)
    setError('')
    setShowPassword(false)
    setModal(true)
  }

  async function handleSave() {
    if (!form.full_name || !form.email) {
      setError('กรุณากรอกชื่อและอีเมล')
      return
    }

    setSaving(true)
    setError('')

    try {
      if (editId) {
        // แก้ไขผู้ใช้ที่มีอยู่
        const { error } = await supabase.from('profiles').update({
          full_name: form.full_name,
          role: form.role,
        }).eq('id', editId)
        if (error) throw new Error(error.message)
      } else {
        // สร้าง User ใหม่
        if (!form.password || form.password.length < 6) {
          setError('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร')
          setSaving(false)
          return
        }

        // สร้าง Auth user
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: form.email,
          password: form.password,
        })

        if (authError) throw new Error(authError.message)

        // สร้าง Profile
        const { error: profileError } = await supabase.from('profiles').insert({
          id: authData.user?.id,
          email: form.email,
          full_name: form.full_name,
          role: form.role,
        })
        if (profileError) throw new Error(profileError.message)
      }

      setSaving(false)
      setModal(false)
      fetchUsers()
    } catch (err) {
      setError(err.message || 'เกิดข้อผิดพลาด')
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    if (!confirm('ยืนยันลบ User นี้?')) return
    await supabase.from('profiles').delete().eq('id', id)
    fetchUsers()
  }

  const getRoleInfo = (role) => roles.find(r => r.value === role) || roles[2]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">จัดการ User</h1>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-5 py-3 rounded-xl text-sm font-semibold transition-colors"
        >
          <Plus size={18} /> เพิ่ม User
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-slate-400">กำลังโหลด...</div>
        ) : users.length === 0 ? (
          <div className="text-center py-12 text-slate-400">ยังไม่มี User</div>
        ) : (
          <div className="divide-y divide-slate-50">
            {users.map(u => {
              const roleInfo = getRoleInfo(u.role)
              return (
                <div key={u.id} className="flex items-center gap-4 px-5 py-4">
                  <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-sm font-bold text-slate-600 shrink-0">
                    {u.full_name?.[0]?.toUpperCase() || 'U'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-800">{u.full_name}</p>
                    <p className="text-sm text-slate-400 truncate">{u.email}</p>
                  </div>
                  <div className="shrink-0">
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${roleInfo.color}`}>
                      {roleInfo.label}
                    </span>
                    <p className="text-xs text-slate-400 mt-1 text-center">{roleInfo.desc}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => openEdit(u)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                      <Pencil size={15} />
                    </button>
                    <button onClick={() => handleDelete(u.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800">{editId ? 'แก้ไข User' : 'เพิ่ม User ใหม่'}</h2>
              <button onClick={() => setModal(false)}><X size={20} className="text-slate-400" /></button>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">ชื่อ-นามสกุล</label>
              <input
                type="text"
                value={form.full_name}
                onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">อีเมล</label>
              <input
                type="email"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                disabled={!!editId}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 disabled:bg-slate-50 disabled:text-slate-400"
              />
              {editId && <p className="text-xs text-slate-400 mt-1">ไม่สามารถแก้ไขอีเมลได้</p>}
            </div>

            {!editId && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">รหัสผ่าน</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    placeholder="อย่างน้อย 6 ตัวอักษร"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">สิทธิ์การใช้งาน</label>
              <div className="space-y-2">
                {roles.map(r => (
                  <label key={r.value} className={`flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-colors ${form.role === r.value ? 'border-red-500 bg-red-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                    <input
                      type="radio"
                      value={r.value}
                      checked={form.role === r.value}
                      onChange={() => setForm(f => ({ ...f, role: r.value }))}
                      className="text-red-600"
                    />
                    <div>
                      <p className="text-sm font-medium text-slate-800">{r.label}</p>
                      <p className="text-xs text-slate-400">{r.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

            <div className="flex gap-3 pt-2">
              <button onClick={() => setModal(false)} className="flex-1 py-2.5 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
                ยกเลิก
              </button>
              <button onClick={handleSave} disabled={saving} className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white rounded-lg text-sm font-medium transition-colors">
                {saving ? 'กำลังบันทึก...' : editId ? 'บันทึก' : 'เพิ่ม User'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
