import { useState, useRef } from 'react'
import { Upload, Download, ShoppingCart, Package2, AlertCircle, FileSpreadsheet, X, CheckCircle, Link2, Database } from 'lucide-react'
import { Link } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'


const ERP_HEADERS = [
  'document_no', 'doc_date', 'customer_name', 'master_sku_name',
  'master_sku_product_code', 'qty', 'assign_name', 'notes',
]

const MASTER_SKU_HEADERS = [
  'master_sku_product_code', 'master_sku_name', 'group', 'category', 'type',
  'pack_size', 'spec_1', 'spec_2', 'unit', 'supplier_name',
]

function normalize(value) {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function numberValue(value) {
  const result = Number(String(value ?? '').replace(/,/g, '').trim())
  return Number.isFinite(result) ? result : 0
}

function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    const next = text[index + 1]
    if (char === '"') {
      if (quoted && next === '"') {
        field += '"'
        index += 1
      } else {
        quoted = !quoted
      }
    } else if (char === ',' && !quoted) {
      row.push(field)
      field = ''
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1
      row.push(field)
      if (row.some(cell => String(cell).trim())) rows.push(row)
      row = []
      field = ''
    } else {
      field += char
    }
  }
  if (field || row.length) {
    row.push(field)
    if (row.some(cell => String(cell).trim())) rows.push(row)
  }
  if (rows[0]?.[0]) rows[0][0] = String(rows[0][0]).replace(/^\uFEFF/, '')
  return rows
}

function parseErpCsv(rows) {
  const headers = (rows[0] || []).map(normalize)
  const indexes = Object.fromEntries(ERP_HEADERS.map(header => [header, headers.indexOf(header)]))
  if (indexes.master_sku_name < 0 || indexes.master_sku_product_code < 0 || indexes.qty < 0) return null

  const grouped = new Map()
  const dates = new Set()
  const documents = new Set()
  let merRows = 0
  let invalidSkuCount = 0
  for (const row of rows.slice(1)) {
    const team = indexes.assign_name >= 0 ? String(row[indexes.assign_name] ?? '').trim().toUpperCase() : ''
    if (team !== 'MER') continue

    const name = String(row[indexes.master_sku_name] ?? '').trim()
    const rawErpSku = row[indexes.master_sku_product_code]
    const erpSku = String(rawErpSku ?? '').trim()
    const qty = numberValue(row[indexes.qty])
    if ((!name && !erpSku) || qty <= 0) continue
    merRows += 1

    if (typeof rawErpSku === 'number' || /e[+-]\d+/i.test(erpSku)) {
      invalidSkuCount += 1
      continue
    }

    const documentNo = indexes.document_no >= 0 ? String(row[indexes.document_no] ?? '').trim() : ''
    const docDate = indexes.doc_date >= 0 ? String(row[indexes.doc_date] ?? '').trim() : ''
    const customer = indexes.customer_name >= 0 ? String(row[indexes.customer_name] ?? '').trim() : ''
    const key = erpSku || normalize(name)
    const current = grouped.get(key) || {
      name, erpSku, qty: 0, documents: new Set(), customers: new Set(),
    }
    current.qty += qty
    if (documentNo) {
      current.documents.add(documentNo)
      documents.add(documentNo)
    }
    if (customer) current.customers.add(customer)
    if (docDate) dates.add(docDate)
    grouped.set(key, current)
  }

  if (invalidSkuCount > 0) {
    throw new Error(`พบ SKU คอลัมน์ E จำนวน ${invalidSkuCount} รายการเป็นเลขแบบย่อ เช่น 3.00234E+15 กรุณาใช้ไฟล์ CSV ต้นฉบับจาก ERP โดยไม่เปิดแล้วบันทึกซ้ำใน Excel`)
  }

  return {
    orderItems: Array.from(grouped.values()).map(item => ({
      ...item,
      documents: Array.from(item.documents),
      customers: Array.from(item.customers),
    })),
    importDate: Array.from(dates).join(' ถึง '),
    sourceRows: merRows,
    totalSourceRows: Math.max(rows.length - 1, 0),
    documentCount: documents.size,
  }
}

function parseMasterSkuRows(rows) {
  const headers = (rows[0] || []).map(normalize)
  const indexes = Object.fromEntries(MASTER_SKU_HEADERS.map(header => [header, headers.indexOf(header)]))
  if (indexes.master_sku_product_code < 0) {
    throw new Error('ไม่พบคอลัมน์ A: master_sku_product_code ในไฟล์ Master SKU')
  }

  const records = new Map()
  let invalidSkuCount = 0
  let nonBlankRows = 0

  for (const row of rows.slice(1)) {
    const rawCode = row[indexes.master_sku_product_code]
    const erpSku = String(rawCode ?? '').trim()
    if (!erpSku) continue
    nonBlankRows += 1

    if (typeof rawCode === 'number' || /e[+-]\d+/i.test(erpSku) || !/^\d+$/.test(erpSku)) {
      invalidSkuCount += 1
      continue
    }

    const value = key => indexes[key] >= 0 ? String(row[indexes[key]] ?? '').trim() : ''
    const incoming = {
      erp_sku: erpSku,
      name: value('master_sku_name'),
      group_name: value('group'),
      category: value('category'),
      item_type: value('type'),
      pack_size: value('pack_size'),
      spec_1: value('spec_1'),
      spec_2: value('spec_2'),
      unit: value('unit'),
      supplier_name: value('supplier_name'),
      updated_at: new Date().toISOString(),
    }

    const current = records.get(erpSku)
    if (!current) {
      records.set(erpSku, incoming)
    } else {
      for (const [key, fieldValue] of Object.entries(incoming)) {
        if (!current[key] && fieldValue) current[key] = fieldValue
      }
    }
  }

  if (invalidSkuCount > 0) {
    throw new Error(`พบ Product Code ที่ไม่สมบูรณ์ ${invalidSkuCount.toLocaleString('th-TH')} รายการ กรุณาใช้ไฟล์ CSV ต้นฉบับจาก ERP`)
  }

  return {
    records: Array.from(records.values()),
    totalRows: nonBlankRows,
    duplicateRows: Math.max(nonBlankRows - records.size, 0),
  }
}

async function fetchAllMasterMappings() {
  const allRows = []
  const pageSize = 1000
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('erp_master_skus')
      .select('erp_sku, product_id')
      .range(from, from + pageSize - 1)
    if (error) throw error
    allRows.push(...(data || []))
    if (!data || data.length < pageSize) break
  }
  return allRows
}

async function fetchMappingsForSkus(skus) {
  const rows = []
  const uniqueSkus = Array.from(new Set(skus.filter(Boolean)))
  const chunkSize = 100
  for (let index = 0; index < uniqueSkus.length; index += chunkSize) {
    const chunk = uniqueSkus.slice(index, index + chunkSize)
    const { data, error } = await supabase
      .from('erp_master_skus')
      .select('erp_sku, product_id')
      .in('erp_sku', chunk)
    if (error) throw error
    rows.push(...(data || []))
  }
  return rows
}

export default function OrderImport() {
  const [masterFile, setMasterFile] = useState(null)
  const [masterImporting, setMasterImporting] = useState(false)
  const [masterImportError, setMasterImportError] = useState('')
  const [masterImportResult, setMasterImportResult] = useState(null)
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState(null)
  const [importDate, setImportDate] = useState('')
  const [activeTab, setActiveTab] = useState('buy')
  const [errorMessage, setErrorMessage] = useState('')
  const [stockProducts, setStockProducts] = useState([])
  const [mappingItem, setMappingItem] = useState(null)
  const [mappingProductId, setMappingProductId] = useState('')
  const [mappingError, setMappingError] = useState('')
  const [savingMapping, setSavingMapping] = useState(false)
  const masterFileInputRef = useRef(null)
  const fileInputRef = useRef(null)

  function handleMasterFileChange(event) {
    const selectedFile = event.target.files[0]
    if (!selectedFile) return
    setMasterFile(selectedFile)
    setMasterImportError('')
    setMasterImportResult(null)
  }

  function clearMasterFile() {
    setMasterFile(null)
    setMasterImportError('')
    setMasterImportResult(null)
    if (masterFileInputRef.current) masterFileInputRef.current.value = ''
  }

  async function importMasterSkus() {
    if (!masterFile) return
    setMasterImporting(true)
    setMasterImportError('')
    setMasterImportResult(null)

    try {
      if (!masterFile.name.toLowerCase().endsWith('.csv')) {
        throw new Error('กรุณาใช้ไฟล์ master-skus-export.csv ต้นฉบับ เพื่อรักษาเลข 0 ด้านหน้า Product Code')
      }
      const rows = parseCsv(await masterFile.text())

      const parsed = parseMasterSkuRows(rows)
      if (!parsed.records.length) throw new Error('ไม่พบ Product Code สำหรับนำเข้า')

      const [{ data: products, error: productError }, existingMappings] = await Promise.all([
        supabase.from('products').select('id, name, barcode, product_code, erp_sku'),
        fetchAllMasterMappings(),
      ])
      if (productError) throw productError

      const productByCode = new Map()
      const productsByName = new Map()
      for (const product of products || []) {
        for (const code of [product.erp_sku, product.barcode, product.product_code]) {
          if (normalize(code)) productByCode.set(normalize(code), product)
        }
        const nameKey = normalize(product.name)
        if (nameKey) productsByName.set(nameKey, [...(productsByName.get(nameKey) || []), product])
      }

      const existingBySku = new Map(existingMappings.map(row => [normalize(row.erp_sku), row.product_id]))
      let autoMatched = 0
      let alreadyMatched = 0
      const productPrimarySkuUpdates = new Map()

      const payload = parsed.records.map(record => {
        const existingProductId = existingBySku.get(normalize(record.erp_sku)) || null
        let matchedProduct = productByCode.get(normalize(record.erp_sku)) || null
        if (!matchedProduct && record.name) {
          const sameNameProducts = productsByName.get(normalize(record.name)) || []
          if (sameNameProducts.length === 1) matchedProduct = sameNameProducts[0]
        }

        const productId = existingProductId || matchedProduct?.id || null
        if (existingProductId) alreadyMatched += 1
        else if (matchedProduct) {
          autoMatched += 1
          if (!matchedProduct.erp_sku && !productPrimarySkuUpdates.has(matchedProduct.id)) {
            productPrimarySkuUpdates.set(matchedProduct.id, record.erp_sku)
          }
        }
        return { ...record, product_id: productId }
      })

      const batchSize = 300
      for (let index = 0; index < payload.length; index += batchSize) {
        const { error } = await supabase
          .from('erp_master_skus')
          .upsert(payload.slice(index, index + batchSize), { onConflict: 'erp_sku' })
        if (error) throw error
      }

      for (const [productId, erpSku] of productPrimarySkuUpdates) {
        const { error } = await supabase
          .from('products')
          .update({ erp_sku: erpSku })
          .eq('id', productId)
          .is('erp_sku', null)
        if (error && !error.message.toLowerCase().includes('duplicate')) throw error
      }

      setMasterImportResult({
        imported: payload.length,
        duplicateRows: parsed.duplicateRows,
        autoMatched,
        alreadyMatched,
        waiting: payload.length - autoMatched - alreadyMatched,
      })
    } catch (error) {
      const missingTable = error.code === '42P01' || /erp_master_skus|schema cache/i.test(error.message || '')
      setMasterImportError(missingTable
        ? 'ยังไม่มีตารางทะเบียน ERP ในฐานข้อมูล กรุณารันไฟล์ SQL ที่เตรียมไว้ใน Supabase ก่อน'
        : (error.message || 'นำเข้า Master SKU ไม่สำเร็จ'))
    } finally {
      setMasterImporting(false)
    }
  }

  function handleFileChange(e) {
    const f = e.target.files[0]
    if (!f) return
    setFile(f)
    setResults(null)
    setErrorMessage('')
  }

  function clearFile() {
    setFile(null)
    setResults(null)
    setImportDate('')
    setErrorMessage('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function readOrderFile() {
    if (file.name.toLowerCase().endsWith('.csv')) {
      const text = await file.text()
      const parsed = parseErpCsv(parseCsv(text))
      if (!parsed) throw new Error('ไม่พบคอลัมน์ SKU และจำนวนที่ต้องใช้ในไฟล์ CSV')
      return parsed
    }

    const buffer = await file.arrayBuffer()
    const wb = XLSX.read(buffer, { type: 'array' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true })
    const erpFile = parseErpCsv(rows)
    if (erpFile) return erpFile

    const orderItems = []
    for (let index = 4; index < rows.length; index += 1) {
      const row = rows[index]
      const name = String(row[0] || '').trim()
      const qty = numberValue(row[1])
      if (name && qty > 0 && (typeof row[1] === 'number' || /^\d+(\.\d+)?$/.test(String(row[1]).trim()))) {
        orderItems.push({ name, erpSku: '', qty, documents: [], customers: [] })
      }
    }
    return {
      orderItems,
      importDate: rows[0]?.[1] ? String(rows[0][1]) : '',
      sourceRows: rows.length,
      documentCount: 0,
    }
  }

  async function handleAnalyze() {
    if (!file) return
    setLoading(true)
    setErrorMessage('')

    try {
      const parsed = await readOrderFile()
      if (!parsed.orderItems.length) throw new Error('ไม่พบรายการสินค้าในไฟล์นี้')
      setImportDate(parsed.importDate)

      const { data: products, error } = await supabase
        .from('products')
        .select('id, name, unit, barcode, product_code, erp_sku, min_stock, stock_lots(quantity)')
        .order('name')
      if (error) throw new Error(`อ่านข้อมูลสต็อกไม่ได้: ${error.message}`)
      setStockProducts(products || [])

      let masterMappings = []
      try {
        masterMappings = await fetchMappingsForSkus(parsed.orderItems.map(item => item.erpSku))
      } catch (mappingError) {
        const missingTable = mappingError.code === '42P01' || /erp_master_skus|schema cache/i.test(mappingError.message || '')
        if (!missingTable) throw mappingError
      }

      const byErpSku = new Map()
      const byBarcode = new Map()
      const byProductCode = new Map()
      const byName = new Map()
      const byProductId = new Map()
      for (const product of products || []) {
        byProductId.set(product.id, product)
        if (normalize(product.erp_sku)) byErpSku.set(normalize(product.erp_sku), product)
        if (normalize(product.barcode)) byBarcode.set(normalize(product.barcode), product)
        if (normalize(product.product_code)) byProductCode.set(normalize(product.product_code), product)
        if (normalize(product.name)) byName.set(normalize(product.name), product)
      }
      const mappedProductByErpSku = new Map(
        masterMappings
          .filter(mapping => mapping.product_id && byProductId.has(mapping.product_id))
          .map(mapping => [normalize(mapping.erp_sku), byProductId.get(mapping.product_id)]),
      )

      const toBuy = []
      const fromStock = []
      const notFound = []

      for (const item of parsed.orderItems) {
        const match =
          (item.erpSku && mappedProductByErpSku.get(normalize(item.erpSku))) ||
          (item.erpSku && byErpSku.get(normalize(item.erpSku))) ||
          (item.erpSku && byBarcode.get(normalize(item.erpSku))) ||
          (item.erpSku && byProductCode.get(normalize(item.erpSku))) ||
          byName.get(normalize(item.name))

        if (!match) {
          notFound.push(item)
          continue
        }

        const currentStock = (match.stock_lots || []).reduce(
          (sum, lot) => sum + numberValue(lot.quantity),
          0,
        )
        const pickQty = Math.min(currentStock, item.qty)
        const buyQty = Math.max(item.qty - currentStock, 0)
        const common = {
          ...item,
          orderedQty: item.qty,
          currentStock,
          unit: match.unit || 'ชิ้น',
          product_code: match.product_code || '',
          barcode: match.barcode || '',
        }

        if (pickQty > 0) fromStock.push({ ...common, pickQty })
        if (buyQty > 0) toBuy.push({ ...common, needToBuy: buyQty })
      }

      setResults({
        toBuy,
        fromStock,
        notFound,
        sourceRows: parsed.sourceRows,
        totalSourceRows: parsed.totalSourceRows ?? parsed.sourceRows,
        documentCount: parsed.documentCount,
        skuCount: parsed.orderItems.length,
      })
      setActiveTab(toBuy.length > 0 ? 'buy' : fromStock.length > 0 ? 'stock' : 'notfound')
    } catch (error) {
      setResults(null)
      setErrorMessage(error.message || 'อ่านไฟล์ไม่สำเร็จ กรุณาตรวจรูปแบบไฟล์แล้วลองใหม่')
    } finally {
      setLoading(false)
    }
  }

  function openMapping(item) {
    setMappingItem(item)
    setMappingProductId('')
    setMappingError('')
  }

  async function saveMapping() {
    if (!mappingItem || !mappingProductId) return
    setSavingMapping(true)
    setMappingError('')
    const selectedProduct = stockProducts.find(product => product.id === mappingProductId)
    const { error: catalogError } = await supabase
      .from('erp_master_skus')
      .upsert({
        erp_sku: mappingItem.erpSku,
        name: mappingItem.name || '',
        product_id: mappingProductId,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'erp_sku' })

    if (catalogError) {
      setMappingError(`บันทึกการจับคู่ไม่ได้: ${catalogError.message}`)
      setSavingMapping(false)
      return
    }

    if (!selectedProduct?.erp_sku) {
      const { error: productError } = await supabase
        .from('products')
        .update({ erp_sku: mappingItem.erpSku })
        .eq('id', mappingProductId)
        .is('erp_sku', null)
      if (productError && !productError.message.toLowerCase().includes('duplicate')) {
        setMappingError(`บันทึก ERP SKU ที่สินค้าไม่ได้: ${productError.message}`)
        setSavingMapping(false)
        return
      }
    }

    setMappingItem(null)
    setMappingProductId('')
    setSavingMapping(false)
    await handleAnalyze()
  }

  function createWorkbook(rows, sheetName, fileName) {
    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = [
      { wch: 20 }, { wch: 20 }, { wch: 45 }, { wch: 12 },
      { wch: 16 }, { wch: 18 }, { wch: 10 }, { wch: 14 }, { wch: 35 },
    ]
    const wbOut = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wbOut, ws, sheetName)
    XLSX.writeFile(wbOut, fileName)
  }

  function exportToBuy() {
    if (!results?.toBuy.length) return
    createWorkbook(results.toBuy.map(item => ({
      'SKU จาก ERP': item.erpSku,
      'รหัสสินค้าใน Stock': item.product_code,
      'ชื่อสินค้า': item.name,
      'ยอดสั่งรวม': item.orderedQty,
      'สต็อกปัจจุบัน': item.currentStock,
      'จำนวนที่ต้องซื้อเพิ่ม': item.needToBuy,
      'หน่วย': item.unit,
      'จำนวน Order': item.documents?.length || '',
      'ลูกค้า': item.customers?.join(', ') || '',
    })), 'MER ซื้อเพิ่ม', `MER_รายการซื้อเพิ่ม_${importDate || 'export'}.xlsx`)
  }

  function exportFromStock() {
    if (!results?.fromStock.length) return
    createWorkbook(results.fromStock.map(item => ({
      'SKU จาก ERP': item.erpSku,
      'รหัสสินค้าใน Stock': item.product_code,
      'ชื่อสินค้า': item.name,
      'ยอดสั่งรวม': item.orderedQty,
      'สต็อกปัจจุบัน': item.currentStock,
      'จำนวนที่ให้หยิบ': item.pickQty,
      'หน่วย': item.unit,
      'จำนวน Order': item.documents?.length || '',
      'ลูกค้า': item.customers?.join(', ') || '',
    })), 'MER หยิบจาก Stock', `MER_หยิบจากStock_${importDate || 'export'}.xlsx`)
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
        <p className="text-sm text-slate-500 mt-0.5">วิเคราะห์คำสั่งซื้อของทีม MER แล้วแยกว่าควรซื้อเพิ่มหรือหยิบจาก Stock</p>
      </div>

      {/* Master SKU registry */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Database size={20} />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800">ขั้นตอนที่ 1: นำเข้าทะเบียน Master SKU จาก ERP</p>
            <p className="text-xs text-slate-500 mt-0.5">ระบบจะเก็บคอลัมน์ A: master_sku_product_code เป็น ERP SKU โดยรักษาเลข 0 ด้านหน้าไว้ครบ</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            {masterFile ? (
              <div className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg bg-slate-50">
                <FileSpreadsheet size={16} className="text-blue-600 shrink-0" />
                <span className="text-sm text-slate-700 truncate flex-1">{masterFile.name}</span>
                <button onClick={clearMasterFile} className="text-slate-400 hover:text-slate-600 transition-colors" aria-label="ล้างไฟล์ Master SKU">
                  <X size={15} />
                </button>
              </div>
            ) : (
              <label className="flex items-center gap-2 px-3 py-2 border-2 border-dashed border-slate-300 rounded-lg cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors">
                <Upload size={16} className="text-slate-400" />
                <span className="text-sm text-slate-500">เลือกไฟล์ master-skus-export.csv</span>
                <input
                  ref={masterFileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleMasterFileChange}
                  className="hidden"
                />
              </label>
            )}
          </div>
          <button
            type="button"
            onClick={importMasterSkus}
            disabled={!masterFile || masterImporting}
            className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {masterImporting ? 'กำลังนำเข้า...' : 'นำเข้า Master SKU'}
          </button>
        </div>

        <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
          ใช้ไฟล์ CSV ต้นฉบับจาก ERP ระบบจะใช้ชื่อสินค้าในคอลัมน์ B ช่วยจับคู่กับสินค้า Stock ที่ชื่อเหมือนกันโดยอัตโนมัติ
        </div>

        {masterImportError && (
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>{masterImportError}</span>
          </div>
        )}

        {masterImportResult && (
          <div className="mt-3 rounded-xl border border-green-200 bg-green-50 p-3">
            <div className="flex items-center gap-2 text-green-700 font-semibold text-sm">
              <CheckCircle size={17} /> นำเข้าทะเบียน ERP สำเร็จ
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 text-center">
              <div><p className="text-lg font-bold text-slate-800">{masterImportResult.imported.toLocaleString('th-TH')}</p><p className="text-[11px] text-slate-500">ERP SKU ไม่ซ้ำ</p></div>
              <div><p className="text-lg font-bold text-green-600">{masterImportResult.autoMatched.toLocaleString('th-TH')}</p><p className="text-[11px] text-slate-500">จับคู่อัตโนมัติใหม่</p></div>
              <div><p className="text-lg font-bold text-blue-600">{masterImportResult.alreadyMatched.toLocaleString('th-TH')}</p><p className="text-[11px] text-slate-500">เคยจับคู่แล้ว</p></div>
              <div><p className="text-lg font-bold text-amber-600">{masterImportResult.waiting.toLocaleString('th-TH')}</p><p className="text-[11px] text-slate-500">รอจับคู่</p></div>
            </div>
            {masterImportResult.duplicateRows > 0 && (
              <p className="text-xs text-slate-500 mt-2 text-center">รวมรายการซ้ำในไฟล์แล้ว {masterImportResult.duplicateRows.toLocaleString('th-TH')} แถว</p>
            )}
          </div>
        )}
      </div>

      {/* Upload card */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
        <p className="text-sm font-medium text-slate-700 mb-1">ขั้นตอนที่ 2: อัปโหลดไฟล์ Export by Buyer จาก ERP</p>
        <p className="text-xs text-slate-500 mb-3">อ่านคอลัมน์ E: master_sku_product_code และเลือกเฉพาะ assign_name = MER</p>
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
                <span className="text-sm text-slate-500">เลือกไฟล์ต้นฉบับ .csv, .xlsx หรือ .xls</span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
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
            {loading ? 'กำลังวิเคราะห์...' : 'วิเคราะห์ไฟล์'}
          </button>
        </div>
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          แนะนำไฟล์ CSV ต้นฉบับจาก ERP เพื่อรักษา SKU ให้ครบทุกหลัก ห้ามเปิดแล้วบันทึกซ้ำใน Excel หากคอลัมน์ E แสดงเป็น 3.00234E+15
        </div>
        {errorMessage && (
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}
        {importDate && results && (
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
            <span>วันที่ในไฟล์: {importDate}</span>
            <span>ทีม MER {results.sourceRows.toLocaleString('th-TH')} จาก {results.totalSourceRows.toLocaleString('th-TH')} บรรทัด</span>
            <span>{results.documentCount.toLocaleString('th-TH')} Order</span>
            <span>{results.skuCount.toLocaleString('th-TH')} SKU หลังรวมยอด</span>
          </div>
        )}
      </div>

      {/* Matching guide */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div>
            <h2 className="text-base font-bold text-slate-800">วิธีจับคู่สินค้า ERP กับ Stock</h2>
            <p className="text-xs text-slate-500 mt-0.5">นำเข้าทะเบียน Master SKU ก่อน ระบบจะจับคู่จากรหัสและชื่อสินค้าให้อัตโนมัติ</p>
          </div>
          <span className="px-2.5 py-1 rounded-full bg-green-50 text-green-700 text-xs font-medium">ทำครั้งแรกครั้งเดียว</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { number: 1, title: 'นำเข้า Master SKU', text: 'เลือก master-skus-export.csv แล้วกด “นำเข้า Master SKU”' },
            { number: 2, title: 'วิเคราะห์คำสั่งซื้อ', text: 'อัปโหลด Export by Buyer ระบบจะจับคู่ให้อัตโนมัติ' },
            { number: 3, title: 'ตรวจรายการไม่พบ', text: 'เปิดแท็บ “ไม่พบในระบบ” เฉพาะรายการที่ยังไม่ตรง' },
            { number: 4, title: 'จับคู่ส่วนที่เหลือ', text: 'เลือกสินค้า Stock แล้วบันทึกครั้งเดียว ระบบจะจำไว้' },
          ].map(step => (
            <div key={step.number} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="w-7 h-7 rounded-full bg-red-600 text-white text-sm font-bold flex items-center justify-center mb-2">
                {step.number}
              </div>
              <p className="text-sm font-semibold text-slate-800">{step.title}</p>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">{step.text}</p>
            </div>
          ))}
        </div>

        <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
          <AlertCircle size={15} className="shrink-0 mt-0.5" />
          <span>
            หากยังไม่มีสินค้าที่ต้องการเลือก ให้เพิ่มสินค้าในหน้า{' '}
            <Link to="/products" className="font-semibold underline underline-offset-2">จัดการสินค้า</Link>
            {' '}ก่อน แล้วกลับมาวิเคราะห์ไฟล์อีกครั้ง
          </span>
        </div>
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
          <div className="flex overflow-x-auto border-b border-slate-100">
            {tabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
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
                              <p className="text-xs text-slate-500 font-mono mt-0.5">ERP SKU: {item.erpSku || '-'}</p>
                              {item.product_code && (
                                <p className="text-xs text-slate-400 font-mono">Stock: {item.product_code}</p>
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
                  <p className="text-sm text-slate-500">หยิบจาก Stock เท่าที่มี หากไม่พอ ระบบจะแยกส่วนที่ขาดไปอยู่รายการซื้อเพิ่ม</p>
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
                          <th className="text-right pb-2 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">สต็อกปัจจุบัน</th>
                          <th className="text-right pb-2 pl-3 text-xs font-semibold text-green-600 uppercase tracking-wide whitespace-nowrap">ให้หยิบ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {results.fromStock.map((item, i) => (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="py-2.5 pr-3">
                              <p className="text-slate-800 font-medium leading-snug">{item.name}</p>
                              <p className="text-xs text-slate-500 font-mono mt-0.5">ERP SKU: {item.erpSku || '-'}</p>
                              {item.product_code && (
                                <p className="text-xs text-slate-400 font-mono">Stock: {item.product_code}</p>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right text-slate-600 whitespace-nowrap">{item.orderedQty} {item.unit}</td>
                            <td className="py-2.5 px-3 text-right text-slate-500 whitespace-nowrap">{item.currentStock} {item.unit}</td>
                            <td className="py-2.5 pl-3 text-right font-bold text-green-600 whitespace-nowrap">{item.pickQty} {item.unit}</td>
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
                <div className="mb-3">
                  <p className="text-sm text-slate-600 font-medium">SKU ที่ยังจับคู่กับสินค้าในระบบ Stock ไม่ได้</p>
                  <p className="text-xs text-slate-400 mt-0.5">กด “จับคู่สินค้า” แล้วเลือกสินค้าที่ตรงกัน ระบบจะจำ ERP SKU ไว้ใช้ครั้งต่อไป</p>
                </div>
                {results.notFound.length === 0 ? (
                  <div className="text-center py-10 text-slate-400">
                    <CheckCircle size={32} className="mx-auto mb-2 text-green-400" />
                    <p className="text-sm">พบสินค้าทั้งหมดในระบบ</p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {results.notFound.map((item, i) => (
                      <div key={i} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-3 py-2 bg-slate-50 rounded-lg">
                        <div className="flex items-start gap-2 min-w-0">
                          <AlertCircle size={14} className="text-slate-400 shrink-0 mt-1" />
                          <div className="min-w-0">
                            <p className="text-sm text-slate-700">{item.name}</p>
                            <p className="text-xs text-slate-500 font-mono break-all">ERP SKU: {item.erpSku || '-'}</p>
                          </div>
                        </div>
                        <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pl-6 sm:pl-0">
                          <span className="text-sm text-slate-500 whitespace-nowrap">ยอดรวม {item.qty}</span>
                          <button
                            type="button"
                            onClick={() => openMapping(item)}
                            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 text-slate-700 text-xs font-medium rounded-lg hover:border-red-300 hover:text-red-600 transition-colors"
                          >
                            <Link2 size={14} /> จับคู่สินค้า
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {mappingItem && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-800">จับคู่กับสินค้าใน Stock</h2>
                <p className="text-xs text-slate-500 mt-1">บันทึกครั้งเดียว ระบบจะจำ ERP SKU นี้ตลอดไป</p>
              </div>
              <button type="button" onClick={() => setMappingItem(null)} aria-label="ปิด">
                <X size={20} className="text-slate-400" />
              </button>
            </div>

            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-sm font-medium text-slate-800">{mappingItem.name}</p>
              <p className="text-xs text-slate-500 font-mono mt-1">ERP SKU: {mappingItem.erpSku}</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">เลือกสินค้าที่ตรงกันใน Stock</label>
              <select
                value={mappingProductId}
                onChange={event => setMappingProductId(event.target.value)}
                className="w-full px-3 py-3 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                <option value="">-- เลือกสินค้า --</option>
                {stockProducts.map(product => (
                  <option key={product.id} value={product.id}>
                    {product.name} — {product.product_code || product.barcode}{product.erp_sku ? ` — ERP ${product.erp_sku}` : ''}
                  </option>
                ))}
              </select>
              {stockProducts.length === 0 && (
                <p className="text-xs text-amber-700 mt-2">ยังไม่มีสินค้าใน Stock กรุณาเพิ่มสินค้าในหน้า “จัดการสินค้า” ก่อน</p>
              )}
            </div>

            {mappingError && (
              <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{mappingError}</div>
            )}

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => setMappingItem(null)}
                className="flex-1 py-3 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={saveMapping}
                disabled={!mappingProductId || savingMapping}
                className="flex-1 py-3 bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white rounded-xl text-sm font-semibold transition-colors"
              >
                {savingMapping ? 'กำลังบันทึก...' : 'บันทึกการจับคู่'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
