import { useState, useRef } from 'react'
import { Upload, Download, ShoppingCart, Package2, AlertCircle, FileSpreadsheet, X, CheckCircle } from 'lucide-react'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'

export default function OrderImport() {
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState(null)
  const [importDate, setImportDate] = useState('')
  const [activeTab, setActiveTab] = useState('buy')
  const fileInputRef = useRef(null)

  function handleFileChange(e) {
    const f = e.target.files[0]
    if (!f) return
    setFile(f)
    setResults(null)
  }

  function clearFile() {
    setFile(null)
    setResults(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleAnalyze() {
    if (!file) return
    setLoading(true)

    try {
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer)
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

      // Extract date from row 1 (index 0), col B (index 1)
      const dateRaw = rows[0]?.[1]
      setImportDate(dateRaw ? String(dateRaw) : '')

      // Parse summary rows: col A = product name, col B = numeric total qty, col C = empty
      const orderItems = []
      for (let i = 4; i < rows.length; i++) {
        const row = rows[i]
        const name = String(row[0] || '').trim()
        const colB = row[1]
        if (!name) continue
        if (typeof colB === 'number' && colB > 0) {
          orderItems.push({ name, qty: colB })
        }
      }

      // Fetch all products with stock lots
      const { data: products } = await supabase
        .from('products')
        .select('id, name, unit, product_code, min_stock, stock_lots(quantity)')
        .order('name')

      const toBuy = []
      const fromStock = []
      const notFound = []

      for (const item of orderItems) {
        const match = products?.find(
          p => p.name.trim().toLowerCase() === item.name.toLowerCase()
        )

        if (!match) {
          notFound.push({ name: item.name, qty: item.qty })
          continue
        }

        const currentStock = (match.stock_lots || []).reduce(
          (sum, lot) => sum + (lot.quantity || 0),
          0
        )

        if (currentStock >= item.qty) {
          fromStock.push({
            name: item.name,
            orderedQty: item.qty,
            currentStock,
            unit: match.unit,
            product_code: match.product_code || '',
          })
        } else {
          toBuy.push({
            name: item.name,
            orderedQty: item.qty,
            currentStock,
            needToBuy: item.qty - currentStock,
            unit: match.unit,
            product_code: match.product_code || '',
          })
        }
      }

      setResults({ toBuy, fromStock, notFound })
      setActiveTab(toBuy.length > 0 ? 'buy' : 'stock')
    } finally {
      setLoading(false)
    }
  }

  function exportToBuy() {
    if (!results?.toBuy.length) return
    const rows = results.toBuy.map(item => ({
      'รหัสสินค้า (SKU)': item.product_code,
      'ชื่อสินค้า': item.name,
      'ยอดสั่ง': item.orderedQty,
      'สต็อกปัจจุบัน': item.currentStock,
      'ต้องซื้อเพิ่ม': item.needToBuy,
      'หน่วย': item.unit,
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = [{ wch: 18 }, { wch: 45 }, { wch: 10 }, { wch: 16 }, { wch: 12 }, { wch: 8 }]
    const wbOut = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wbOut, ws, 'ควรซื้อเพิ่ม')
    XLSX.writeFile(wbOut, `ควรซื้อเพิ่ม_${importDate || 'export'}.xlsx`)
  }

  function exportFromStock() {
    if (!results?.fromStock.length) return
    const rows = results.fromStock.map(item => ({
      'รหัสสินค้า (SKU)': item.product_code,
      'ชื่อสินค้า': item.name,
      'ยอดสั่ง': item.orderedQty,
      'สต็อกปัจจุบัน': item.currentStock,
      'หน่วย': item.unit,
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = [{ wch: 18 }, { wch: 45 }, { wch: 10 }, { wch: 16 }, { wch: 8 }]
    const wbOut = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wbOut, ws, 'หยิบจาก Stock')
    XLSX.writeFile(wbOut, `หยิบจากStock_${importDate || 'export'}.xlsx`)
  }

  const tabs = [
    { key: 'buy', label: 'ควรซื้อเพิ่ม', count: results?.toBuy.length ?? 0, color: 'red' },
    { key: 'stock', label: 'หยิบจาก Stock', count: results?.fromStock.length ?? 0, color: 'green' },
    { key: 'notfound', label: 'ไม่พบในระบบ', count: results?.notFound.length ?? 0, color: 'slate' },
  ]

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-800">นำเข้าคำสั่งซื้อ ERP</h1>
        <p className="text-sm text-slate-500 mt-0.5">วิเคราะห์รายการสั่งซื้อจากไฟล์ Excel แล้วแยกว่าควรซื้อเพิ่มหรือหยิบจาก Stock</p>
      </div>

      {/* Upload card */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
        <p className="text-sm font-medium text-slate-700 mb-3">อัปโหลดไฟล์ Export by Buyer จาก ERP</p>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            {file ? (
              <div className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg bg-slate-50">
                <FileSpreadsheet size={16} className="text-green-600 shrink-0" />
                <span className="text-sm text-slate-700 truncate flex-1">{file.name}</span>
                <button onClick={clearFile} className="text-slate-400 hover:text-slate-600 transition-colors">
                  <X size={15} />
                </button>
              </div>
            ) : (
              <label className="flex items-center gap-2 px-3 py-2 border-2 border-dashed border-slate-300 rounded-lg cursor-pointer hover:border-red-400 hover:bg-red-50 transition-colors">
                <Upload size={16} className="text-slate-400" />
                <span className="text-sm text-slate-500">เลือกไฟล์ .xlsx</span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
            )}
          </div>
          <button
            onClick={handleAnalyze}
            disabled={!file || loading}
            className="px-5 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'กำลังวิเคราะห์...' : 'วิเคราะห์'}
          </button>
        </div>
        {importDate && results && (
          <p className="text-xs text-slate-400 mt-2">วันที่ในไฟล์: {importDate}</p>
        )}
      </div>

      {/* Results */}
      {results && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
          {/* Summary bar */}
          <div className="grid grid-cols-3 divide-x divide-slate-100 border-b border-slate-100">
            <div className="px-4 py-3 text-center">
              <p className="text-2xl font-bold text-red-600">{results.toBuy.length}</p>
              <p className="text-xs text-slate-500 mt-0.5">ควรซื้อเพิ่ม</p>
            </div>
            <div className="px-4 py-3 text-center">
              <p className="text-2xl font-bold text-green-600">{results.fromStock.length}</p>
              <p className="text-xs text-slate-500 mt-0.5">หยิบจาก Stock</p>
            </div>
            <div className="px-4 py-3 text-center">
              <p className="text-2xl font-bold text-slate-400">{results.notFound.length}</p>
              <p className="text-xs text-slate-500 mt-0.5">ไม่พบในระบบ</p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-slate-100">
            {tabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.key
                    ? tab.color === 'red'
                      ? 'border-red-500 text-red-600'
                      : tab.color === 'green'
                      ? 'border-green-500 text-green-600'
                      : 'border-slate-400 text-slate-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                {tab.label}
                <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${
                  activeTab === tab.key
                    ? tab.color === 'red' ? 'bg-red-100 text-red-600'
                    : tab.color === 'green' ? 'bg-green-100 text-green-600'
                    : 'bg-slate-100 text-slate-600'
                    : 'bg-slate-100 text-slate-500'
                }`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="p-4">
            {activeTab === 'buy' && (
              <>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm text-slate-500">สินค้าที่สต็อกไม่เพียงพอ ต้องจัดซื้อเพิ่ม</p>
                  {results.toBuy.length > 0 && (
                    <button
                      onClick={exportToBuy}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 text-sm font-medium rounded-lg hover:bg-red-100 transition-colors"
                    >
                      <Download size={14} />
                      Export Excel
                    </button>
                  )}
                </div>
                {results.toBuy.length === 0 ? (
                  <div className="text-center py-10 text-slate-400">
                    <CheckCircle size={32} className="mx-auto mb-2 text-green-400" />
                    <p className="text-sm">ไม่มีสินค้าที่ต้องซื้อเพิ่ม</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-100">
                          <th className="text-left pb-2 pr-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">ชื่อสินค้า</th>
                          <th className="text-right pb-2 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">ยอดสั่ง</th>
                          <th className="text-right pb-2 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">สต็อกปัจจุบัน</th>
                          <th className="text-right pb-2 pl-3 text-xs font-semibold text-red-500 uppercase tracking-wide whitespace-nowrap">ต้องซื้อเพิ่ม</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {results.toBuy.map((item, i) => (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="py-2.5 pr-3">
                              <p className="text-slate-800 font-medium leading-snug">{item.name}</p>
                              {item.product_code && (
                                <p className="text-xs text-slate-400 font-mono mt-0.5">{item.product_code}</p>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right text-slate-600 whitespace-nowrap">{item.orderedQty} {item.unit}</td>
                            <td className="py-2.5 px-3 text-right text-slate-500 whitespace-nowrap">{item.currentStock} {item.unit}</td>
                            <td className="py-2.5 pl-3 text-right font-bold text-red-600 whitespace-nowrap">{item.needToBuy} {item.unit}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}

            {activeTab === 'stock' && (
              <>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm text-slate-500">สินค้าที่มีสต็อกเพียงพอ หยิบจัดได้เลย</p>
                  {results.fromStock.length > 0 && (
                    <button
                      onClick={exportFromStock}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 text-green-600 text-sm font-medium rounded-lg hover:bg-green-100 transition-colors"
                    >
                      <Download size={14} />
                      Export Excel
                    </button>
                  )}
                </div>
                {results.fromStock.length === 0 ? (
                  <div className="text-center py-10 text-slate-400">
                    <Package2 size={32} className="mx-auto mb-2" />
                    <p className="text-sm">ไม่มีสินค้าที่หยิบจาก Stock ได้</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-100">
                          <th className="text-left pb-2 pr-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">ชื่อสินค้า</th>
                          <th className="text-right pb-2 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">ยอดสั่ง</th>
                          <th className="text-right pb-2 pl-3 text-xs font-semibold text-green-600 uppercase tracking-wide whitespace-nowrap">สต็อกปัจจุบัน</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {results.fromStock.map((item, i) => (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="py-2.5 pr-3">
                              <p className="text-slate-800 font-medium leading-snug">{item.name}</p>
                              {item.product_code && (
                                <p className="text-xs text-slate-400 font-mono mt-0.5">{item.product_code}</p>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right text-slate-600 whitespace-nowrap">{item.orderedQty} {item.unit}</td>
                            <td className="py-2.5 pl-3 text-right font-bold text-green-600 whitespace-nowrap">{item.currentStock} {item.unit}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}

            {activeTab === 'notfound' && (
              <>
                <p className="text-sm text-slate-500 mb-3">รายการที่ไม่พบในระบบ Stock (ชื่อไม่ตรงกัน)</p>
                {results.notFound.length === 0 ? (
                  <div className="text-center py-10 text-slate-400">
                    <CheckCircle size={32} className="mx-auto mb-2 text-green-400" />
                    <p className="text-sm">พบสินค้าทั้งหมดในระบบ</p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {results.notFound.map((item, i) => (
                      <div key={i} className="flex items-center justify-between px-3 py-2 bg-slate-50 rounded-lg">
                        <div className="flex items-center gap-2">
                          <AlertCircle size={14} className="text-slate-400 shrink-0" />
                          <span className="text-sm text-slate-600">{item.name}</span>
                        </div>
                        <span className="text-sm text-slate-400 whitespace-nowrap ml-3">{item.qty}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
