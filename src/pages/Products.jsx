import { useEffect, useRef, useState, useCallback } from 'react'
import { Plus, Pencil, Trash2, Search, X, Camera, Printer } from 'lucide-react'
import { Html5Qrcode } from 'html5-qrcode'
import JsBarcode from 'jsbarcode'
import { supabase } from '../lib/supabase'

const emptyForm = { name: '', barcode: '', unit: 'ชิ้น', min_stock: 0, product_code: '' }

export default function Products() {
  const [products, setProducts] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [scanningBarcode, setScanningBarcode] = useState(false)
  const [barcodeCameraOpen, setBarcodeCameraOpen] = useState(false)
  const [printProduct, setPrintProduct] = useState(null)
  const barcodeCameraRef = useRef(null)
  const html5QrBarRef = useRef(null)
  const barcodeRef = useRef(null)

  useEffect(() => { fetchProducts() }, [])

  async function fetchProducts() {
    const { data } = await supabase.from('products').select('*').order('name')
    setProducts(data || [])
    setLoading(false)
  }

  function openCreate() {
    setForm(emptyForm)
    setEditId(null)
    setModal(true)
  }

  function openEdit(p) {
    setForm({ name: p.name, barcode: p.barcode, unit: p.unit, min_stock: p.min_stock, product_code: p.product_code || '' })
    setEditId(p.id)
    setModal(true)
  }

  async function handleSave() {
    if (!form.name || !form.barcode) return
    setSaving(true)

    try {
      if (editId) {
        await supabase.from('products').update(form).eq('id', editId)
      } else {
        // Generate product_code (Order Number)
        const { data: lastProduct } = await supabase
          .from('products')
          .select('product_code')
          .order('created_at', { ascending: false })
          .limit(1)

        let nextNumber = 20290001
        if (lastProduct && lastProduct.length > 0 && lastProduct[0].product_code) {
          const lastCode = lastProduct[0].product_code
          const lastNum = parseInt(lastCode.split('-')[1])
          nextNumber = lastNum + 1
        }

        const productCode = `SC02-${nextNumber}`

        await supabase.from('products').insert({
          ...form,
          current_stock: 0,
          product_code: productCode
        })
      }
      setSaving(false)
      setModal(false)
      fetchProducts()
    } catch (error) {
      console.error('Error saving product:', error)
      setSaving(false)
    }
  }

  const stopBarcodeScanner = useCallback(async () => {
    if (html5QrBarRef.current) {
      try {
        await html5QrBarRef.current.stop()
        html5QrBarRef.current.clear()
      } catch {}
      html5QrBarRef.current = null
    }
    setBarcodeCameraOpen(false)
    setScanningBarcode(false)
  }, [])

  async function startBarcodeScanner() {
    setBarcodeCameraOpen(true)
    setScanningBarcode(true)
    setTimeout(async () => {
      try {
        const html5Qr = new Html5Qrcode('qr-reader-products-modal')
        html5QrBarRef.current = html5Qr
        await html5Qr.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 260, height: 100 }, aspectRatio: 1.5 },
          async (decodedText) => {
            await stopBarcodeScanner()
            setForm(f => ({ ...f, barcode: decodedText }))
          },
          () => {}
        )
      } catch {
        setBarcodeCameraOpen(false)
        setScanningBarcode(false)
      }
    }, 100)
  }

  // cleanup on unmount
  useEffect(() => {
    return () => { stopBarcodeScanner() }
  }, [stopBarcodeScanner])

  async function handleDelete(id) {
    if (!confirm('ยืนยันลบสินค้านี้?')) return
    await supabase.from('products').delete().eq('id', id)
    fetchProducts()
  }

  function openPrintBarcode(product) {
    setPrintProduct(product)
    setTimeout(() => {
      if (barcodeRef.current) {
        try {
          JsBarcode(barcodeRef.current, product.barcode, {
            format: 'CODE128',
            width: 2,
            height: 50,
            displayValue: true,
          })
        } catch (e) {
          console.error('Barcode error:', e)
        }
      }
    }, 100)
  }

  function printBarcode() {
    const printWindow = window.open('', '', 'width=600,height=400')
    const content = document.getElementById('barcode-print-content')
    if (content && printWindow) {
      printWindow.document.write(content.innerHTML)
      printWindow.document.close()
      printWindow.print()
    }
  }

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.barcode.includes(search)
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">จัดการสินค้า</h1>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-5 py-3 rounded-xl text-sm font-semibold transition-colors"
        >
          <Plus size={18} /> เพิ่มสินค้า
        </button>
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="ค้นหาชื่อหรือบาร์โค้ด..."
          className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-500"
        />
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-slate-400">กำลังโหลด...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-slate-400">ไม่พบสินค้า</div>
        ) : (
          <div className="divide-y divide-slate-50">
            {filtered.map(p => (
              <div key={p.id} className="flex items-center gap-4 px-5 py-3.5">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-slate-800 truncate">{p.name}</p>
                    {p.product_code && (
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded shrink-0">
                        {p.product_code}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">{p.barcode} · หน่วย: {p.unit}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-sm font-semibold ${p.current_stock <= p.min_stock ? 'text-red-600' : 'text-slate-800'}`}>
                    {p.current_stock} {p.unit}
                  </p>
                  <p className="text-xs text-slate-400">ขั้นต่ำ {p.min_stock}</p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => openEdit(p)} className="p-3 text-slate-400 hover:text-red-600 hover:bg-red-50 active:bg-red-100 rounded-xl transition-colors">
                    <Pencil size={17} />
                  </button>
                  <button onClick={() => openPrintBarcode(p)} className="p-3 text-slate-400 hover:text-blue-600 hover:bg-blue-50 active:bg-blue-100 rounded-xl transition-colors">
                    <Printer size={17} />
                  </button>
                  <button onClick={() => handleDelete(p.id)} className="p-3 text-slate-400 hover:text-red-600 hover:bg-red-50 active:bg-red-100 rounded-xl transition-colors">
                    <Trash2 size={17} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>


      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800">{editId ? 'แก้ไขสินค้า' : 'เพิ่มสินค้าใหม่'}</h2>
              <button onClick={() => setModal(false)}><X size={20} className="text-slate-400" /></button>
            </div>

            {editId && form.product_code && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-xs text-blue-600 font-medium">เลขอ้างอิง (Order Number)</p>
                <p className="text-sm font-bold text-blue-900">{form.product_code}</p>
              </div>
            )}

            {[
              { label: 'ชื่อสินค้า', key: 'name', type: 'text', placeholder: 'เช่น น้ำดื่ม 600ml' },
              { label: 'หน่วย', key: 'unit', type: 'text', placeholder: 'ชิ้น, ขวด, กล่อง' },
              { label: 'สต็อกขั้นต่ำ', key: 'min_stock', type: 'number', placeholder: '' },
            ].map(({ label, key, type, placeholder }) => (
              <div key={key}>
                <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
                <input
                  type={type}
                  value={form[key] === 0 ? '' : form[key]}
                  onChange={e => setForm(f => ({ ...f, [key]: type === 'number' ? (e.target.value === '' ? 0 : parseInt(e.target.value) || 0) : e.target.value }))}
                  placeholder={placeholder}
                  min={type === 'number' ? '0' : undefined}
                  className="w-full px-3 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
            ))}

            {/* Barcode field with camera viewfinder */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">บาร์โค้ด</label>

              {barcodeCameraOpen && (
                <div className="relative bg-black rounded-xl overflow-hidden mb-2">
                  <div id="qr-reader-products-modal" className="w-full" />

                  {/* Scanning line overlay */}
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    <div className="relative w-64 h-20">
                      {/* Corner marks */}
                      <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-red-500 rounded-tl" />
                      <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-red-500 rounded-tr" />
                      <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-red-500 rounded-bl" />
                      <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-red-500 rounded-br" />
                      {/* Scanning line */}
                      <div className="absolute left-1 right-1 h-0.5 bg-red-500 shadow-[0_0_6px_2px_rgba(239,68,68,0.6)] scan-line" />
                    </div>
                  </div>

                  {/* Close button */}
                  <button
                    onClick={stopBarcodeScanner}
                    className="absolute top-2 right-2 w-8 h-8 bg-black/60 hover:bg-black/80 text-white rounded-full flex items-center justify-center z-10"
                  >
                    <X size={16} />
                  </button>
                </div>
              )}

              <div className="flex gap-2">
                <input
                  type="text"
                  value={form.barcode}
                  onChange={e => setForm(f => ({ ...f, barcode: e.target.value }))}
                  placeholder="EAN-13"
                  className="flex-1 px-3 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                />
                <button
                  type="button"
                  onClick={barcodeCameraOpen ? stopBarcodeScanner : startBarcodeScanner}
                  disabled={scanningBarcode}
                  className={`flex items-center gap-1.5 px-4 py-3 rounded-xl text-sm font-semibold transition-colors shrink-0 ${
                    barcodeCameraOpen
                      ? 'bg-slate-500 hover:bg-slate-600 text-white'
                      : 'bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white'
                  }`}
                >
                  <Camera size={18} />
                  {scanningBarcode ? '...' : barcodeCameraOpen ? 'ปิด' : 'สแกน'}
                </button>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={() => setModal(false)} className="flex-1 py-3.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
                ยกเลิก
              </button>
              <button onClick={handleSave} disabled={saving} className="flex-1 py-3.5 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white rounded-xl text-sm font-semibold transition-colors">
                {saving ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Print Barcode Modal */}
      {printProduct && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800">พิมพ์บาร์โค้ด</h2>
              <button onClick={() => setPrintProduct(null)}><X size={20} className="text-slate-400" /></button>
            </div>

            <div id="barcode-print-content" className="bg-slate-50 rounded-lg p-6 flex flex-col items-center space-y-3">
              <p className="text-sm font-medium text-slate-700">{printProduct.name}</p>
              <svg ref={barcodeRef}></svg>
              <p className="text-xs text-slate-500">{printProduct.barcode}</p>
              {printProduct.product_code && (
                <p className="text-xs font-bold text-blue-600">Order: {printProduct.product_code}</p>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setPrintProduct(null)}
                className="flex-1 py-2.5 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
              >
                ยกเลิก
              </button>
              <button
                onClick={printBarcode}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
              >
                <Printer size={16} />
                พิมพ์
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
