import { useRef, useState, useEffect, useCallback } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { Camera, Plus, Minus, CheckCircle, XCircle, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export default function Scan() {
  const [mode, setMode] = useState('IN')
  const [product, setProduct] = useState(null)
  const [lots, setLots] = useState([])
  const [quantity, setQuantity] = useState(1)
  const [expiryDate, setExpiryDate] = useState('')
  const [note, setNote] = useState('')
  const [status, setStatus] = useState(null)
  const [refNo, setRefNo] = useState('')
  const [manualBarcode, setManualBarcode] = useState('')
  const [scanning, setScanning] = useState(false)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [photo, setPhoto] = useState(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const html5QrRef = useRef(null)
  const fileInputRef = useRef(null)
  const { user } = useAuth()

  const stopScanner = useCallback(async () => {
    if (html5QrRef.current) {
      try {
        await html5QrRef.current.stop()
        html5QrRef.current.clear()
      } catch {}
      html5QrRef.current = null
    }
    setCameraOpen(false)
    setScanning(false)
  }, [])

  useEffect(() => {
    return () => { stopScanner() }
  }, [stopScanner])

  async function startScanner() {
    setStatus(null)
    setProduct(null)
    setLots([])
    setCameraOpen(true)
    // wait for div to render
    setTimeout(async () => {
      try {
        const html5Qr = new Html5Qrcode('qr-reader-live')
        html5QrRef.current = html5Qr
        await html5Qr.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 260, height: 100 }, aspectRatio: 1.5 },
          async (decodedText) => {
            await stopScanner()
            setScanning(true)
            await lookupProduct(decodedText)
            setScanning(false)
          },
          () => {}
        )
      } catch {
        setCameraOpen(false)
        setStatus({ type: 'error', message: 'ไม่สามารถเปิดกล้องได้ กรุณาอนุญาตการใช้กล้อง' })
      }
    }, 100)
  }

  async function lookupProduct(barcode) {
    const { data, error } = await supabase.from('products').select('*').eq('barcode', barcode).single()
    if (error || !data) {
      setStatus({ type: 'error', message: `ไม่พบสินค้าบาร์โค้ด: ${barcode}` })
      return
    }
    setProduct(data)
    setStatus(null)
    if (mode === 'OUT') {
      const { data: lotData } = await supabase
        .from('stock_lots').select('*')
        .eq('product_id', data.id).gt('quantity', 0)
        .order('expiry_date', { ascending: true })
      setLots(lotData || [])
    }
  }

  async function handlePhotoCapture(e) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadingPhoto(true)
    try {
      const fileName = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      const { error: uploadError, data } = await supabase.storage
        .from('product_photos')
        .upload(`${user.id}/${fileName}`, file)

      if (uploadError) throw uploadError

      const { data: publicUrl } = supabase.storage
        .from('product_photos')
        .getPublicUrl(`${user.id}/${fileName}`)

      setPhoto({ name: file.name, url: publicUrl.publicUrl })
      setStatus({ type: 'success_photo', message: 'บันทึกรูปเสร็จแล้ว' })
      setTimeout(() => setStatus(null), 2000)
    } catch (error) {
      setStatus({ type: 'error', message: 'ไม่สามารถบันทึกรูป: ' + error.message })
    } finally {
      setUploadingPhoto(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function generateRefNo() {
    const now = new Date()
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '')
    const { count } = await supabase
      .from('transactions')
      .select('*', { count: 'exact', head: true })
      .eq('type', 'IN')
      .gte('created_at', `${now.toISOString().slice(0, 10)}T00:00:00`)
    const seq = String((count || 0) + 1).padStart(3, '0')
    return `SMM-${dateStr}-${seq}`
  }

  async function handleSubmit() {
    if (!product) return
    if (mode === 'IN' && !expiryDate) {
      setStatus({ type: 'error', message: 'กรุณาระบุวันหมดอายุ' })
      return
    }
    if (mode === 'IN') {
      const { error: lotError } = await supabase.from('stock_lots').insert({
        product_id: product.id, quantity, expiry_date: expiryDate,
      })
      if (lotError) { setStatus({ type: 'error', message: 'เกิดข้อผิดพลาด' }); return }
      await supabase.rpc('update_product_stock', { p_product_id: product.id, p_delta: quantity })
    } else {
      let remaining = quantity
      for (const lot of lots) {
        if (remaining <= 0) break
        const deduct = Math.min(lot.quantity, remaining)
        await supabase.from('stock_lots').update({ quantity: lot.quantity - deduct }).eq('id', lot.id)
        remaining -= deduct
      }
      if (remaining > 0) { setStatus({ type: 'error', message: 'สต็อกไม่เพียงพอ' }); return }
      await supabase.rpc('update_product_stock', { p_product_id: product.id, p_delta: -quantity })
    }
    const generatedRef = mode === 'IN' ? await generateRefNo() : null
    if (generatedRef) setRefNo(generatedRef)
    await supabase.from('transactions').insert({
      product_id: product.id, type: mode, quantity,
      expiry_date: mode === 'IN' ? expiryDate : null,
      note: mode === 'IN' ? `[${generatedRef}] ${note}`.trim() : note,
      created_by: user.id,
      photo_url: photo?.url || null,
    })
    setStatus({ type: 'success', message: `${mode === 'IN' ? 'รับเข้า' : 'จ่ายออก'} ${product.name} จำนวน ${quantity} ${product.unit} สำเร็จ` })
    setProduct(null); setLots([]); setQuantity(1)
    setExpiryDate(''); setNote(''); setManualBarcode(''); setPhoto(null)
  }

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <h1 className="text-xl font-bold text-slate-800">สแกนสต็อก</h1>

      {/* Mode Toggle */}
      <div className="flex bg-white rounded-xl shadow-sm p-1.5 gap-1.5">
        {['IN', 'OUT'].map(m => (
          <button key={m}
            onClick={() => { setMode(m); setProduct(null); setLots([]); setStatus(null) }}
            className={`flex-1 py-3.5 rounded-xl text-base font-semibold transition-colors ${
              mode === m
                ? m === 'IN' ? 'bg-green-500 text-white shadow-sm' : 'bg-orange-500 text-white shadow-sm'
                : 'text-slate-500'
            }`}
          >
            {m === 'IN' ? '📥 รับเข้า' : '📤 จ่ายออก'}
          </button>
        ))}
      </div>

      {/* Success status + ทำรายการต่อ */}
      {status?.type === 'success' && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-3">
          <div className="flex items-start gap-3">
            <CheckCircle size={20} className="text-green-600 shrink-0 mt-0.5" />
            <p className="text-sm font-medium text-green-700">{status.message}</p>
          </div>
          {refNo && (
            <div className="bg-white border border-green-300 rounded-lg px-4 py-3 text-center">
              <p className="text-xs text-slate-500 mb-1">เลขรับสินค้า</p>
              <p className="text-lg font-bold text-green-700 tracking-wider">{refNo}</p>
            </div>
          )}
          <button onClick={() => { setStatus(null); setRefNo('') }}
            className="w-full py-3.5 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl text-base transition-colors">
            📷 ทำรายการต่อ
          </button>
        </div>
      )}

      {status?.type !== 'success' && (
        <>
          {/* Scanner Card */}
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">

            {/* Camera Viewfinder */}
            {cameraOpen && (
              <div className="relative bg-black">
                {/* Html5Qrcode renders video here */}
                <div id="qr-reader-live" className="w-full" />

                {/* Scanning line animation overlay */}
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div className="relative w-64 h-24">
                    {/* Corner marks */}
                    <div className="absolute top-0 left-0 w-5 h-5 border-t-2 border-l-2 border-red-500 rounded-tl" />
                    <div className="absolute top-0 right-0 w-5 h-5 border-t-2 border-r-2 border-red-500 rounded-tr" />
                    <div className="absolute bottom-0 left-0 w-5 h-5 border-b-2 border-l-2 border-red-500 rounded-bl" />
                    <div className="absolute bottom-0 right-0 w-5 h-5 border-b-2 border-r-2 border-red-500 rounded-br" />
                    {/* Scanning line */}
                    <div className="absolute left-1 right-1 h-0.5 bg-red-500 shadow-[0_0_6px_2px_rgba(239,68,68,0.6)] scan-line" />
                  </div>
                </div>

                {/* Close button */}
                <button
                  onClick={stopScanner}
                  className="absolute top-3 right-3 w-9 h-9 bg-black/60 hover:bg-black/80 text-white rounded-full flex items-center justify-center z-10"
                >
                  <X size={18} />
                </button>

                {/* Hint text */}
                <div className="absolute bottom-3 left-0 right-0 text-center">
                  <span className="text-white text-xs bg-black/50 px-3 py-1 rounded-full">
                    จ่อบาร์โค้ดให้อยู่ในกรอบ
                  </span>
                </div>
              </div>
            )}

            <div className="p-4 space-y-3">
              <button
                onClick={cameraOpen ? stopScanner : startScanner}
                disabled={scanning}
                className={`w-full flex items-center justify-center gap-2 py-4 rounded-xl font-semibold text-base transition-colors text-white ${
                  cameraOpen
                    ? 'bg-slate-600 hover:bg-slate-700'
                    : 'bg-red-600 hover:bg-red-700 disabled:bg-red-400'
                }`}
              >
                <Camera size={22} />
                {scanning ? 'กำลังอ่านบาร์โค้ด...' : cameraOpen ? 'ปิดกล้อง' : 'เปิดกล้องสแกน'}
              </button>

              <div className="flex gap-2">
                <input
                  value={manualBarcode}
                  onChange={e => setManualBarcode(e.target.value)}
                  placeholder="หรือพิมพ์บาร์โค้ดด้วยตนเอง"
                  className="flex-1 px-3 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                  onKeyDown={e => e.key === 'Enter' && manualBarcode && lookupProduct(manualBarcode)}
                />
                <button
                  onClick={() => manualBarcode && lookupProduct(manualBarcode)}
                  className="px-5 py-3 bg-slate-100 hover:bg-slate-200 rounded-xl text-sm font-medium text-slate-700 transition-colors"
                >
                  ค้นหา
                </button>
              </div>
            </div>
          </div>

          {/* Product Info */}
          {product && (
            <div className="bg-white rounded-xl shadow-sm p-4 space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-red-50 rounded-lg flex items-center justify-center shrink-0">
                  <Camera size={18} className="text-red-600" />
                </div>
                <div>
                  <p className="font-semibold text-slate-800">{product.name}</p>
                  <p className="text-sm text-slate-500">{product.barcode} · สต็อก: {product.current_stock} {product.unit}</p>
                </div>
              </div>

              {mode === 'OUT' && lots.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-slate-500 mb-2">ล็อตที่จะเบิก (เรียงตามวันหมดอายุก่อน)</p>
                  <div className="space-y-1.5">
                    {lots.map((lot, i) => (
                      <div key={lot.id} className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm ${i === 0 ? 'bg-orange-50 border border-orange-200' : 'bg-slate-50'}`}>
                        <span className="text-slate-700">หมดอายุ: {new Date(lot.expiry_date).toLocaleDateString('th-TH')}</span>
                        <span className="font-medium text-slate-800">คงเหลือ {lot.quantity} {product.unit}</span>
                        {i === 0 && <span className="text-xs text-orange-600 font-medium">เบิกก่อน</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {mode === 'OUT' && lots.length === 0 && (
                <div className="bg-red-50 text-red-600 text-sm px-3 py-2 rounded-lg">ไม่มีสต็อกสำหรับสินค้านี้</div>
              )}

              {mode === 'IN' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">วันหมดอายุ <span className="text-red-500">*</span></label>
                  <input type="date" value={expiryDate}
                    onChange={e => setExpiryDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">จำนวน ({product.unit})</label>
                <div className="flex items-center gap-3">
                  <button onClick={() => setQuantity(q => Math.max(1, q - 1))}
                    className="w-14 h-14 rounded-xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 flex items-center justify-center transition-colors text-slate-700">
                    <Minus size={22} />
                  </button>
                  <input type="number" value={quantity}
                    onChange={e => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                    className="flex-1 text-center px-3 py-3 border border-slate-200 rounded-xl text-xl font-bold focus:outline-none focus:ring-2 focus:ring-red-500"
                    min={1}
                  />
                  <button onClick={() => setQuantity(q => q + 1)}
                    className="w-14 h-14 rounded-xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 flex items-center justify-center transition-colors text-slate-700">
                    <Plus size={22} />
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">หมายเหตุ (ถ้ามี)</label>
                <input value={note} onChange={e => setNote(e.target.value)}
                  placeholder="เช่น เลข PO, Invoice"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>

              {mode === 'IN' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">📷 รูปภาพสินค้า (ถ้ามี)</label>
                  {photo ? (
                    <div className="space-y-2">
                      <div className="relative bg-slate-100 rounded-lg overflow-hidden aspect-video">
                        <img src={photo.url} alt="captured" className="w-full h-full object-cover" />
                        <button
                          onClick={() => setPhoto(null)}
                          className="absolute top-2 right-2 w-8 h-8 bg-red-600 hover:bg-red-700 text-white rounded-full flex items-center justify-center"
                        >
                          <X size={16} />
                        </button>
                      </div>
                      <p className="text-xs text-slate-500">{photo.name}</p>
                    </div>
                  ) : (
                    <>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={handlePhotoCapture}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadingPhoto}
                        className="w-full py-3 border-2 border-dashed border-slate-300 rounded-lg hover:border-red-500 hover:bg-red-50 text-slate-600 hover:text-red-600 font-medium transition-colors disabled:opacity-50"
                      >
                        {uploadingPhoto ? 'กำลังบันทึก...' : '📸 ถ่ายรูปหรือเลือกจากแกลเลอรี่'}
                      </button>
                    </>
                  )}
                </div>
              )}

              <button onClick={handleSubmit}
                disabled={mode === 'OUT' && lots.length === 0}
                className={`w-full py-4 rounded-xl font-semibold text-white text-base transition-colors disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 ${
                  mode === 'IN' ? 'bg-green-500 hover:bg-green-600' : 'bg-orange-500 hover:bg-orange-600'
                }`}>
                {mode === 'IN' ? '✓ บันทึกรับเข้า' : '✓ บันทึกจ่ายออก'}
              </button>
            </div>
          )}

          {status?.type === 'error' && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium bg-red-50 text-red-700">
              <XCircle size={18} />
              {status.message}
            </div>
          )}
        </>
      )}
    </div>
  )
}
