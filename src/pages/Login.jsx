import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Package, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [resetModal, setResetModal] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetLoading, setResetLoading] = useState(false)
  const [resetMessage, setResetMessage] = useState('')
  const [signupModal, setSignupModal] = useState(false)
  const { signIn } = useAuth()
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await signIn(email, password)
    setLoading(false)
    if (error) {
      setError('อีเมลหรือรหัสผ่านไม่ถูกต้อง')
    } else {
      navigate('/')
    }
  }

  async function handleResetPassword(e) {
    e.preventDefault()
    if (!resetEmail) {
      setResetMessage({ type: 'error', text: 'กรุณากรอกอีเมล' })
      return
    }
    setResetLoading(true)
    setResetMessage('')
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setResetLoading(false)
    if (error) {
      setResetMessage({ type: 'error', text: 'เกิดข้อผิดพลาด: ' + error.message })
    } else {
      setResetMessage({ type: 'success', text: 'ส่งลิงค์รีเซ็ตรหัสผ่านไปยังอีเมลแล้ว ตรวจสอบอีเมลของคุณ' })
      setResetEmail('')
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-600 to-red-800 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header banner */}
        <div className="bg-red-600 px-8 py-8 flex flex-col items-center">
          <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mb-4">
            <Package size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Stock Sourcing</h1>
          <p className="text-red-200 text-sm mt-1">ระบบจัดการสต็อกสินค้า</p>
        </div>

        <form onSubmit={handleSubmit} className="px-8 py-8 space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">อีเมล</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500 text-sm"
              placeholder="example@email.com"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">รหัสผ่าน</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500 text-sm"
              placeholder="••••••••"
              required
            />
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-xl border border-red-100">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white font-semibold py-3.5 rounded-xl transition-colors text-base"
          >
            {loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
          </button>

          <div className="text-center space-y-2">
            <button
              type="button"
              onClick={() => setResetModal(true)}
              className="text-sm text-red-600 hover:text-red-700 font-medium block w-full"
            >
              ลืมรหัสผ่าน?
            </button>
            <button
              type="button"
              onClick={() => setSignupModal(true)}
              className="text-sm text-slate-500 hover:text-slate-700 font-medium block w-full"
            >
              ยังไม่มีบัญชี? สมัครสมาชิก
            </button>
          </div>
        </form>
      </div>

      {/* Reset Password Modal */}
      {resetModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800">รีเซ็ตรหัสผ่าน</h2>
              <button onClick={() => setResetModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">อีเมล</label>
                <input
                  type="email"
                  value={resetEmail}
                  onChange={e => setResetEmail(e.target.value)}
                  placeholder="กรอกอีเมลของคุณ"
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500 text-sm"
                  required
                />
              </div>

              {resetMessage && (
                <div className={`text-sm px-4 py-3 rounded-xl ${
                  resetMessage.type === 'error'
                    ? 'bg-red-50 text-red-600 border border-red-100'
                    : 'bg-green-50 text-green-600 border border-green-100'
                }`}>
                  {resetMessage.text}
                </div>
              )}

              <button
                type="submit"
                disabled={resetLoading}
                className="w-full bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white font-semibold py-3 rounded-xl transition-colors text-base"
              >
                {resetLoading ? 'กำลังส่ง...' : 'ส่งลิงค์รีเซ็ต'}
              </button>
            </form>

            <button
              onClick={() => setResetModal(false)}
              className="w-full text-center text-sm text-slate-600 hover:text-slate-800 font-medium py-2"
            >
              ย้อนกลับ
            </button>
          </div>
        </div>
      )}

      {/* Sign Up Modal */}
      {signupModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800">สมัครสมาชิก</h2>
              <button onClick={() => setSignupModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
              <p className="text-sm text-blue-900 font-medium">วิธีการสมัครสมาชิก:</p>
              <ol className="text-sm text-blue-800 space-y-2 list-decimal list-inside">
                <li>ติดต่อผู้ดูแลระบบ (Admin)</li>
                <li>Admin จะสร้าง User ให้ในระบบ</li>
                <li>รับอีเมล + รหัสผ่านจาก Admin</li>
                <li>กลับมา Login ที่นี่ได้เลย</li>
              </ol>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <p className="text-xs text-amber-800">
                <strong>💡 หมายเหตุ:</strong> ระบบนี้ต้องให้ Admin สร้าง User เพื่อความปลอดภัย
              </p>
            </div>

            <button
              onClick={() => {
                window.open('https://supabase.com/dashboard', '_blank')
                setSignupModal(false)
              }}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition-colors"
            >
              ไปที่ Supabase Dashboard
            </button>

            <button
              onClick={() => setSignupModal(false)}
              className="w-full text-center text-sm text-slate-600 hover:text-slate-800 font-medium py-2"
            >
              ย้อนกลับ
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
