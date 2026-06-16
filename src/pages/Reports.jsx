import { useEffect, useState } from 'react'
import { Download, FileSpreadsheet, AlertTriangle, Clock, Printer, FileText } from 'lucide-react'
import * as XLSX from 'xlsx'
import html2pdf from 'html2pdf.js'
import { supabase } from '../lib/supabase'

export default function Reports() {
  const [stockSummary, setStockSummary] = useState([])
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0]
  })
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [transactions, setTransactions] = useState([])

  useEffect(() => { fetchSummary() }, [])

  async function fetchSummary() {
    setLoading(true)
    const { data } = await supabase
      .from('products')
      .select('*, stock_lots(quantity, expiry_date)')
      .order('name')
    setStockSummary(data || [])
    setLoading(false)
  }

  async function exportTransactions() {
    setExporting(true)
    const { data } = await supabase
      .from('transactions')
      .select('*, products(name, unit), profiles(full_name)')
      .gte('created_at', dateFrom + 'T00:00:00')
      .lte('created_at', dateTo + 'T23:59:59')
      .order('created_at', { ascending: false })

    const rows = (data || []).map(tx => ({
      'วันที่/เวลา': new Date(tx.created_at).toLocaleString('th-TH'),
      'ประเภท': tx.type === 'IN' ? 'รับเข้า' : 'จ่ายออก',
      'ชื่อสินค้า': tx.products?.name || '',
      'จำนวน': tx.quantity,
      'หน่วย': tx.products?.unit || '',
      'วันหมดอายุ': tx.expiry_date ? new Date(tx.expiry_date).toLocaleDateString('th-TH') : '',
      'ผู้ดำเนินการ': tx.profiles?.full_name || '',
      'หมายเหตุ': tx.note || '',
    }))

    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'ธุรกรรม')

    const stockRows = stockSummary.map(p => ({
      'ชื่อสินค้า': p.name,
      'รหัสสินค้า (SKU)': p.product_code || '',
      'บาร์โค้ด': p.barcode,
      'สต็อกปัจจุบัน': p.current_stock,
      'หน่วย': p.unit,
      'สต็อกขั้นต่ำ': p.min_stock,
      'สถานะ': p.current_stock <= p.min_stock ? 'ต่ำกว่าขั้นต่ำ' : 'ปกติ',
    }))
    const ws2 = XLSX.utils.json_to_sheet(stockRows)
    XLSX.utils.book_append_sheet(wb, ws2, 'สรุปสต็อก')

    XLSX.writeFile(wb, `stock-report-${dateFrom}-to-${dateTo}.xlsx`)
    setExporting(false)
  }

  async function exportPDF() {
    setExporting(true)
    const { data } = await supabase
      .from('transactions')
      .select('*, products(name, unit), profiles(full_name)')
      .gte('created_at', dateFrom + 'T00:00:00')
      .lte('created_at', dateTo + 'T23:59:59')
      .order('created_at', { ascending: false })

    const htmlContent = `
      <div style="padding: 20px; font-family: Arial, sans-serif;">
        <h1 style="text-align: center; color: #dc2626;">รายงานสต็อกสินค้า</h1>
        <p style="text-align: center; color: #666;">วันที่ ${dateFrom} ถึง ${dateTo}</p>

        <h2 style="color: #374151; border-bottom: 2px solid #dc2626; padding-bottom: 10px;">ธุรกรรม</h2>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <thead>
            <tr style="background-color: #f3f4f6;">
              <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">วันที่/เวลา</th>
              <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">ประเภท</th>
              <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">สินค้า</th>
              <th style="border: 1px solid #ddd; padding: 8px; text-align: center;">จำนวน</th>
              <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">ผู้ดำเนินการ</th>
            </tr>
          </thead>
          <tbody>
            ${(data || []).map(tx => `
              <tr>
                <td style="border: 1px solid #ddd; padding: 8px;">${new Date(tx.created_at).toLocaleString('th-TH')}</td>
                <td style="border: 1px solid #ddd; padding: 8px;"><strong>${tx.type === 'IN' ? '📥 รับเข้า' : '📤 จ่ายออก'}</strong></td>
                <td style="border: 1px solid #ddd; padding: 8px;">${tx.products?.name || ''}</td>
                <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${tx.quantity} ${tx.products?.unit || ''}</td>
                <td style="border: 1px solid #ddd; padding: 8px;">${tx.profiles?.full_name || ''}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <h2 style="color: #374151; border-bottom: 2px solid #dc2626; padding-bottom: 10px;">สรุปสต็อก</h2>
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="background-color: #f3f4f6;">
              <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">ชื่อสินค้า</th>
              <th style="border: 1px solid #ddd; padding: 8px; text-align: center;">สต็อก</th>
              <th style="border: 1px solid #ddd; padding: 8px; text-align: center;">ขั้นต่ำ</th>
              <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">สถานะ</th>
            </tr>
          </thead>
          <tbody>
            ${stockSummary.map(p => `
              <tr style="background-color: ${p.current_stock <= p.min_stock ? '#fee2e2' : 'white'};">
                <td style="border: 1px solid #ddd; padding: 8px;">${p.name}</td>
                <td style="border: 1px solid #ddd; padding: 8px; text-align: center; font-weight: bold;">${p.current_stock} ${p.unit}</td>
                <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${p.min_stock}</td>
                <td style="border: 1px solid #ddd; padding: 8px;">
                  <span style="background-color: ${p.current_stock <= p.min_stock ? '#fca5a5' : '#86efac'}; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px;">
                    ${p.current_stock <= p.min_stock ? '⚠ ต่ำ' : '✓ ปกติ'}
                  </span>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `

    const element = document.createElement('div')
    element.innerHTML = htmlContent

    const opt = {
      margin: 10,
      filename: `stock-report-${dateFrom}-to-${dateTo}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { orientation: 'portrait', unit: 'mm', format: 'a4' }
    }

    html2pdf().set(opt).from(element).save()
    setExporting(false)
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-slate-800">รายงาน</h1>

      {/* Export section */}
      <div className="bg-white rounded-xl shadow-sm p-5 space-y-4">
        <div className="flex items-center gap-2">
          <FileSpreadsheet size={18} className="text-green-600" />
          <h2 className="font-semibold text-slate-700">Export Excel</h2>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">จากวันที่</label>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">ถึงวันที่</label>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={exportTransactions}
            disabled={exporting}
            className="flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white px-5 py-3.5 rounded-xl text-sm font-semibold transition-colors"
          >
            <FileSpreadsheet size={18} />
            Excel
          </button>
          <button
            onClick={exportPDF}
            disabled={exporting}
            className="flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white px-5 py-3.5 rounded-xl text-sm font-semibold transition-colors"
          >
            <FileText size={18} />
            PDF
          </button>
        </div>
        <p className="text-xs text-slate-400 text-center">ดาวน์โหลด Excel หรือ PDF</p>
      </div>

      {/* Stock summary */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-700">สรุปสต็อกปัจจุบัน</h2>
        </div>

        {loading ? (
          <div className="text-center py-12 text-slate-400">กำลังโหลด...</div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
                  <tr>
                    {['ชื่อสินค้า', 'รหัสสินค้า (SKU)', 'บาร์โค้ด', 'สต็อก', 'ขั้นต่ำ', 'สถานะ', 'ล็อตใกล้หมดอายุ'].map(h => (
                      <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {stockSummary.map(p => {
                    const isLow = p.current_stock <= p.min_stock
                    const nearExpiry = p.stock_lots?.filter(l => {
                      if (!l.expiry_date || l.quantity <= 0) return false
                      const days = (new Date(l.expiry_date) - new Date()) / (1000 * 60 * 60 * 24)
                      return days <= 30 && days > 0
                    }) || []
                    return (
                      <tr key={p.id} className={`hover:bg-slate-50 ${isLow ? 'bg-red-50/50' : ''}`}>
                        <td className="px-4 py-3 font-medium text-slate-800">{p.name}</td>
                        <td className="px-4 py-3 text-slate-500 font-mono text-xs">{p.product_code || '-'}</td>
                        <td className="px-4 py-3 text-slate-500 font-mono text-xs">{p.barcode}</td>
                        <td className="px-4 py-3 font-semibold text-slate-800">{p.current_stock} {p.unit}</td>
                        <td className="px-4 py-3 text-slate-500">{p.min_stock}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${isLow ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                            {isLow ? 'ต่ำกว่าขั้นต่ำ' : 'ปกติ'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {nearExpiry.length > 0 ? (
                            <span className="text-xs text-yellow-600 font-medium">{nearExpiry.length} ล็อต</span>
                          ) : <span className="text-slate-300">-</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="lg:hidden divide-y divide-slate-50">
              {stockSummary.length === 0 && (
                <p className="text-center py-12 text-slate-400">ไม่มีสินค้า</p>
              )}
              {stockSummary.map(p => {
                const isLow = p.current_stock <= p.min_stock
                const nearExpiry = p.stock_lots?.filter(l => {
                  if (!l.expiry_date || l.quantity <= 0) return false
                  const days = (new Date(l.expiry_date) - new Date()) / (1000 * 60 * 60 * 24)
                  return days <= 30 && days > 0
                }) || []
                return (
                  <div key={p.id} className={`px-4 py-3 ${isLow ? 'bg-red-50/40' : ''}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-800 truncate">{p.name}</p>
                        <p className="text-xs text-slate-400 mt-0.5 font-mono">{p.product_code ? `${p.product_code} · ` : ''}{p.barcode}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`text-lg font-bold ${isLow ? 'text-red-600' : 'text-slate-800'}`}>
                          {p.current_stock} <span className="text-sm font-normal text-slate-500">{p.unit}</span>
                        </p>
                        <p className="text-xs text-slate-400">ขั้นต่ำ {p.min_stock}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${isLow ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                        {isLow ? '⚠ ต่ำกว่าขั้นต่ำ' : '✓ ปกติ'}
                      </span>
                      {nearExpiry.length > 0 && (
                        <span className="text-xs text-yellow-600 font-medium flex items-center gap-1">
                          <Clock size={11} />
                          ใกล้หมดอายุ {nearExpiry.length} ล็อต
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
