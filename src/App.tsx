import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import {
  Archive, ArrowDownToLine, BookOpen, Camera, Check, ChevronDown, CircleAlert, Coins, Download, FilePlus2,
  FileSpreadsheet, Gem, HandCoins, LockKeyhole, LogOut, Printer, RotateCcw, Search,
  ShieldCheck, Trash2, Upload, UserRound, Wallet, Weight, X,
} from 'lucide-react'
import type { User } from '@supabase/supabase-js'
import {
  adminEmail, listPawnRecords, removePawnRecord, savePawnRecords, supabase, supabaseConfigured,
} from './lib/supabase'
import type { PawnDraft, PawnRecord } from './types'
import './App.css'

const today = (): string => {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') {
    const code = 'code' in error && typeof error.code === 'string' ? ` (${error.code})` : ''
    return `${error.message}${code}`
  }
  return 'Unknown error'
}

function hasErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code
}

const formatDate = (date: string): string => {
  if (!date) return '—'
  const [year, month, day] = date.split('-')
  return `${day}-${month}-${year}`
}

const formatMoney = (value: number | string): string =>
  Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })

function readImageAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error('Could not read image file'))
    }
    reader.onerror = () => reject(reader.error ?? new Error('Could not read image file'))
    reader.readAsDataURL(file)
  })
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob)
      else reject(new Error('Could not encode captured photo'))
    }, 'image/jpeg', quality)
  })
}

async function captureVideoFrame(video: HTMLVideoElement): Promise<string> {
  const maxDimension = Math.max(video.videoWidth, video.videoHeight)
  if (!maxDimension) throw new Error('Camera preview is not ready')
  const canvas = document.createElement('canvas')
  for (const scale of [1, 0.8, 0.65, 0.5, 0.4, 0.3]) {
    const width = Math.round(video.videoWidth * scale)
    const height = Math.round(video.videoHeight * scale)
    canvas.width = width
    canvas.height = height
    canvas.getContext('2d')?.drawImage(video, 0, 0, width, height)
    for (const quality of [0.75, 0.6, 0.45, 0.3]) {
      const blob = await canvasToBlob(canvas, quality)
      if (blob.size < 20 * 1024) {
        return readImageAsDataUrl(new File([blob], 'camera-photo.jpg', { type: 'image/jpeg' }))
      }
    }
  }
  throw new Error('Captured photo could not be reduced below 20 KB')
}

const initialDraft = (records: PawnRecord[] = []): PawnDraft => {
  const nextNumber = records.reduce((max, record) => {
    const match = record.receiptNo.match(/(\d+)$/)
    return match ? Math.max(max, Number(match[1])) : max
  }, 1000) + 1
  const pawnDate = today()
  const due = new Date(`${pawnDate}T00:00:00`)
  due.setFullYear(due.getFullYear() + 1)
  return {
    receiptNo: `SV-${nextNumber}`,
    pawnDate,
    principal: '',
    rate: '16',
    customer: '',
    aadhaarNumber: '',
    phone: '',
    income: '',
    items: '',
    customerPhoto: '',
    productImage: '',
    wtKg: '0',
    wtGm: '0',
    wtMg: '000',
    approxVal: '',
    dueDate: `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}-${String(due.getDate()).padStart(2, '0')}`,
  }
}

const toDraft = (record: PawnRecord): PawnDraft => ({
  receiptNo: record.receiptNo,
  pawnDate: record.pawnDate,
  principal: String(record.principal),
  rate: String(record.rate),
  customer: record.customer,
  aadhaarNumber: record.aadhaarNumber ?? '',
  phone: record.phone,
  income: record.income,
  items: record.items,
  customerPhoto: record.customerPhoto ?? '',
  productImage: record.productImage ?? '',
  wtKg: record.wtKg,
  wtGm: record.wtGm,
  wtMg: record.wtMg,
  approxVal: record.approxVal,
  dueDate: record.dueDate,
})

const numberToTamilWords = (input: number): string => {
  const ones = ['', 'ஒன்று', 'இரண்டு', 'மூன்று', 'நான்கு', 'ஐந்து', 'ஆறு', 'ஏழு', 'எட்டு', 'ஒன்பது', 'பத்து', 'பதினொன்று', 'பன்னிரண்டு', 'பதின்மூன்று', 'பதினான்கு', 'பதினைந்து', 'பதினாறு', 'பதினேழு', 'பதினெட்டு', 'பத்தொன்பது']
  const tens = ['', '', 'இருபது', 'முப்பது', 'நாற்பது', 'ஐம்பது', 'அறுபது', 'எழுபது', 'எண்பது', 'தொண்ணூறு']
  const tensPrefix = ['', '', 'இருபத்து', 'முப்பத்து', 'நாற்பத்து', 'ஐம்பத்து', 'அறுபத்து', 'எழுபத்து', 'எண்பத்து', 'தொண்ணூற்று']
  const twoDigits = (number: number): string => {
    if (!number) return ''
    if (number < 20) return ones[number]
    return number % 10 ? `${tensPrefix[Math.floor(number / 10)]} ${ones[number % 10]}` : tens[Math.floor(number / 10)]
  }
  const threeDigits = (number: number): string => {
    const hundreds = Math.floor(number / 100)
    const rest = number % 100
    const hundredNames = ['', 'நூறு', 'இருநூறு', 'முன்னூறு', 'நானூறு', 'ஐந்நூறு', 'அறுநூறு', 'எழுநூறு', 'எண்ணூறு', 'தொள்ளாயிரம்']
    const hundredPrefixes = ['', 'நூற்று', 'இருநூற்று', 'முன்னூற்று', 'நானூற்று', 'ஐந்நூற்று', 'அறுநூற்று', 'எழுநூற்று', 'எண்ணூற்று', 'தொள்ளாயிரத்து']
    if (!hundreds) return twoDigits(rest)
    return rest ? `${hundredPrefixes[hundreds]} ${twoDigits(rest)}` : hundredNames[hundreds]
  }
  let number = Math.floor(input)
  if (number <= 0 || number > 999999999) return ''
  const groups = [
    { value: Math.floor(number / 10000000), suffix: ' கோடி' },
    { value: Math.floor((number % 10000000) / 100000), suffix: ' லட்சத்து' },
    { value: Math.floor((number % 100000) / 1000), suffix: ' ஆயிரத்து' },
  ]
  const words = groups.flatMap(group => group.value ? [`${twoDigits(group.value)}${group.suffix}`] : [])
  number %= 1000
  if (number) words.push(threeDigits(number))
  const result = words.join(' ').replace(/லட்சத்து$/, 'லட்சம்').replace(/ஆயிரத்து$/, 'ஆயிரம்')
  return `(ரூபாய் ${result} மட்டும்)`
}

function isPawnRecord(value: unknown): value is PawnRecord {
  if (!value || typeof value !== 'object') return false
  const record = value as Partial<PawnRecord>
  return typeof record.id === 'string' &&
    typeof record.receiptNo === 'string' &&
    typeof record.pawnDate === 'string' &&
    typeof record.principal === 'number' &&
    typeof record.customer === 'string' &&
    typeof record.phone === 'string' &&
    typeof record.items === 'string' &&
    (record.status === 'ACTIVE' || record.status === 'REDEEMED')
}

type Pane = 'new' | 'records'
type Toast = { text: string; tone: 'success' | 'error' | 'info' }
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [authError, setAuthError] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [records, setRecords] = useState<PawnRecord[]>([])
  const [dataLoading, setDataLoading] = useState(false)
  const [dataError, setDataError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [pane, setPane] = useState<Pane>('new')
  const [draft, setDraft] = useState<PawnDraft>(() => initialDraft())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<Toast | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [showDualCopy, setShowDualCopy] = useState(false)
  const [redeemRecord, setRedeemRecord] = useState<PawnRecord | null>(null)
  const [redeemInterest, setRedeemInterest] = useState('')
  const [restoreBusy, setRestoreBusy] = useState(false)
  const restoreInput = useRef<HTMLInputElement>(null)
  const saveAction = useRef<'save' | 'print'>('save')

  useEffect(() => {
    const handleInstallAvailable = (event: Event): void => {
      event.preventDefault()
      setInstallPrompt(event as BeforeInstallPromptEvent)
    }
    const handleInstalled = (): void => setInstallPrompt(null)
    window.addEventListener('beforeinstallprompt', handleInstallAvailable)
    window.addEventListener('appinstalled', handleInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', handleInstallAvailable)
      window.removeEventListener('appinstalled', handleInstalled)
    }
  }, [])

  useEffect(() => {
    const client = supabase
    if (!client) {
      setAuthReady(true)
      return
    }
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user ?? null
      if (!nextUser) {
        setUser(null)
        setRecords([])
        setDataError('')
        setDataLoading(false)
        setAuthReady(true)
        return
      }
      if ((nextUser.email ?? '').trim().toLowerCase() !== adminEmail.toLowerCase()) {
        setUser(null)
        setRecords([])
        setDataLoading(false)
        setAuthError('இந்த மின்னஞ்சலுக்கு நிர்வாகி அணுகல் இல்லை.')
        setAuthReady(true)
        window.setTimeout(() => {
          void client.auth.signOut().then(({ error }) => {
            if (error) throw error
          }).catch(error => console.error('Non-admin sign out failed:', error))
        }, 0)
        return
      }
      setAuthError('')
      setRecords([])
      setDataLoading(true)
      setUser(nextUser)
      setAuthReady(true)
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!user) return
    let active = true
    setDataLoading(true)
    setDataError('')
    listPawnRecords()
      .then(items => {
        if (active) setRecords(items)
      })
      .catch(error => {
        console.error('Supabase ledger load failed:', error)
        if (active) {
          const permissionHint = hasErrorCode(error, '42501')
            ? ' authenticated role-க்கு pawn_records SELECT உரிமை உள்ளதா, admin email RLS policy-யுடன் பொருந்துகிறதா சரிபார்க்கவும். anon-க்கு அனுமதி வழங்க வேண்டாம்.'
            : ''
          setDataError(`Supabase-இல் இருந்து பதிவுகளை ஏற்ற முடியவில்லை.${permissionHint} (${describeError(error)})`)
        }
      })
      .finally(() => {
        if (active) setDataLoading(false)
      })
    return () => { active = false }
  }, [user, reloadKey])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 3600)
    return () => window.clearTimeout(timer)
  }, [toast])

  const filteredRecords = useMemo(() => {
    const term = search.trim().toLocaleLowerCase()
    const dateToday = today()
    return records.filter(record => {
      const overdue = record.status === 'ACTIVE' && Boolean(record.dueDate) && record.dueDate < dateToday
      const statusMatches = statusFilter === 'ALL' ||
        (statusFilter === 'OVERDUE' ? overdue : record.status === statusFilter)
      const searchMatches = !term || [
        record.receiptNo, record.customer, record.phone, record.items,
      ].some(value => value.toLocaleLowerCase().includes(term))
      return statusMatches && searchMatches
    })
  }, [records, search, statusFilter])

  const activeRecords = records.filter(record => record.status === 'ACTIVE')
  const redeemedRecords = records.filter(record => record.status === 'REDEEMED')
  const activePrincipal = activeRecords.reduce((sum, record) => sum + record.principal, 0)
  const redeemedPrincipal = redeemedRecords.reduce((sum, record) => sum + record.principal, 0)
  const totalInterest = redeemedRecords.reduce((sum, record) => sum + record.redeemedInterest, 0)
  const monthlyInterest = (Number(draft.principal) * Number(draft.rate)) / 1200

  const showToast = (text: string, tone: Toast['tone'] = 'info'): void => setToast({ text, tone })
  const updateDraft = (key: keyof PawnDraft, value: string): void =>
    setDraft(current => ({ ...current, [key]: value }))

  async function installApp(): Promise<void> {
    if (!installPrompt) {
      showToast('Browser menu-ஐத் திறந்து Install app / Add to Home Screen என்பதைத் தேர்வு செய்யவும்.', 'info')
      return
    }
    try {
      const prompt = installPrompt
      await prompt.prompt()
      const choice = await prompt.userChoice
      setInstallPrompt(null)
      if (choice.outcome === 'accepted') showToast('App நிறுவப்பட்டது.', 'success')
    } catch (error) {
      console.error('PWA installation prompt failed:', error)
      showToast('App நிறுவ முடியவில்லை. Browser menu-ல் முயற்சிக்கவும்.', 'error')
    }
  }

  async function handleImageUpload(key: 'customerPhoto' | 'productImage', event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const input = event.currentTarget
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    if (file.size >= 20 * 1024) {
      showToast('படத்தின் அளவு 20 KB-க்கு குறைவாக இருக்க வேண்டும்.', 'error')
      return
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      showToast('JPG, PNG அல்லது WebP படங்களை மட்டும் தேர்வு செய்யவும்.', 'error')
      return
    }
    try {
      updateDraft(key, await readImageAsDataUrl(file))
    } catch (error) {
      console.error('Image file read failed:', error)
      showToast('படத்தைப் படிக்க முடியவில்லை.', 'error')
    }
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setAuthError('')
    if (!supabase || !supabaseConfigured) {
      setAuthError('Supabase அமைப்புகள் இல்லை. .env.local-ஐ நிரப்பவும்.')
      return
    }
    if (email.trim().toLowerCase() !== adminEmail.toLowerCase()) {
      setAuthError('இந்த மின்னஞ்சலுக்கு நிர்வாகி அணுகல் இல்லை.')
      return
    }
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (error) throw error
    } catch (error) {
      console.error('Admin login failed:', error)
      setAuthError('உள்நுழைவு தோல்வியடைந்தது. மின்னஞ்சல் / கடவுச்சொல்லைச் சரிபார்க்கவும்.')
    }
  }

  async function handleSignOut(): Promise<void> {
    if (!supabase) return
    try {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
      setRecords([])
      setDraft(initialDraft())
      setPane('new')
    } catch (error) {
      console.error('Admin sign out failed:', error)
      showToast('வெளியேற முடியவில்லை. மீண்டும் முயற்சிக்கவும்.', 'error')
    }
  }

  async function saveReceipt(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    const aadhaarNumber = draft.aadhaarNumber.replace(/\s/g, '')
    if (aadhaarNumber && !/^\d{12}$/.test(aadhaarNumber)) {
      showToast('ஆதார் எண் 12 இலக்கங்களாக இருக்க வேண்டும்.', 'error')
      return
    }
    const receiptNo = draft.receiptNo.trim()
    const duplicate = records.some(record =>
      record.receiptNo.toLowerCase() === receiptNo.toLowerCase() && record.id !== editingId,
    )
    if (duplicate) {
      showToast(`ரசீது எண் ${receiptNo} ஏற்கனவே உள்ளது.`, 'error')
      return
    }
    const existing = records.find(record => record.id === editingId)
    const record: PawnRecord = {
      id: existing?.id ?? crypto.randomUUID(),
      receiptNo,
      pawnDate: draft.pawnDate,
      principal: Number(draft.principal),
      rate: Number(draft.rate),
      customer: draft.customer.trim(),
      aadhaarNumber,
      phone: draft.phone.trim(),
      income: draft.income,
      items: draft.items.trim(),
      customerPhoto: draft.customerPhoto || null,
      productImage: draft.productImage || null,
      wtKg: draft.wtKg || '0',
      wtGm: draft.wtGm || '0',
      wtMg: draft.wtMg || '000',
      approxVal: draft.approxVal,
      dueDate: draft.dueDate,
      status: existing?.status ?? 'ACTIVE',
      redeemedDate: existing?.redeemedDate ?? null,
      redeemedInterest: existing?.redeemedInterest ?? 0,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    setSaving(true)
    try {
      await savePawnRecords(record)
      const nextRecords = existing
        ? records.map(item => item.id === record.id ? record : item)
        : [record, ...records]
      setRecords(nextRecords)
      setEditingId(null)
      showToast(`ரசீது ${receiptNo} சேமிக்கப்பட்டது.`, 'success')
      if (saveAction.current === 'print') {
        window.setTimeout(() => window.print(), 180)
      } else {
        setDraft(initialDraft(nextRecords))
      }
    } catch (error) {
      console.error('Pawn receipt save failed:', error)
      showToast('சேமிக்க முடியவில்லை. இணைப்பு / Supabase அமைப்பைச் சரிபார்க்கவும்.', 'error')
    } finally {
      setSaving(false)
    }
  }

  function editRecord(record: PawnRecord): void {
    setDraft(toDraft(record))
    setEditingId(record.id)
    setPane('new')
  }

  function openRedeem(record: PawnRecord): void {
    const dayCount = Math.max(1, Math.ceil(
      (new Date(`${today()}T00:00:00`).getTime() - new Date(`${record.pawnDate}T00:00:00`).getTime()) / 86400000,
    ))
    const interest = Math.round((record.principal * record.rate * dayCount) / (100 * 365))
    setRedeemInterest(String(interest))
    setRedeemRecord(record)
  }

  async function confirmRedeem(): Promise<void> {
    if (!redeemRecord) return
    const updated: PawnRecord = {
      ...redeemRecord,
      status: 'REDEEMED',
      redeemedDate: today(),
      redeemedInterest: Math.max(0, Number(redeemInterest) || 0),
      updatedAt: new Date().toISOString(),
    }
    try {
      await savePawnRecords(updated)
      setRecords(current => current.map(record => record.id === updated.id ? updated : record))
      setRedeemRecord(null)
      showToast(`ரசீது ${updated.receiptNo} மீட்கப்பட்டது.`, 'success')
    } catch (error) {
      console.error('Pawn redemption save failed:', error)
      showToast('மீட்பைச் சேமிக்க முடியவில்லை.', 'error')
    }
  }

  async function deleteRecord(record: PawnRecord): Promise<void> {
    if (!window.confirm(`ரசீது ${record.receiptNo} பதிவை நிரந்தரமாக நீக்கவா?`)) return
    try {
      await removePawnRecord(record.id)
      setRecords(current => current.filter(item => item.id !== record.id))
      showToast(`ரசீது ${record.receiptNo} நீக்கப்பட்டது.`, 'info')
    } catch (error) {
      console.error('Pawn receipt delete failed:', error)
      showToast('நீக்க முடியவில்லை. மீண்டும் முயற்சிக்கவும்.', 'error')
    }
  }

  function printSavedRecord(record: PawnRecord): void {
    setDraft(toDraft(record))
    setEditingId(null)
    setShowDualCopy(false)
    setPane('new')
    window.setTimeout(() => window.print(), 180)
  }

  function shareWhatsApp(): void {
    const phone = draft.phone.replace(/\D/g, '')
    if (!phone || !draft.principal) {
      showToast('WhatsApp பகிர செல்போன் எண், அசல் தொகையை நிரப்பவும்.', 'error')
      return
    }
    const message = [
      '*ஸ்ரீ வசந்தி நகை அடகு கடை, கும்பகோணம்*',
      `ரசீது எண்: *${draft.receiptNo}*`,
      `தேதி: ${formatDate(draft.pawnDate)}`,
      `பெயர்: ${draft.customer.split('\n')[0]}`,
      `பொருள்: ${draft.items.replace(/\n/g, ', ')}`,
      `அசல் தொகை: *₹ ${formatMoney(draft.principal)}*`,
      `மீட்க வேண்டிய தேதி: ${formatDate(draft.dueDate)}`,
      'செல்: 9566660051',
    ].join('\n')
    const internationalPhone = phone.length === 10 ? `91${phone}` : phone
    window.open(`https://wa.me/${internationalPhone}?text=${encodeURIComponent(message)}`, '_blank')
  }

  function exportCsv(): void {
    if (!records.length) {
      showToast('ஏற்றுமதி செய்ய பதிவுகள் இல்லை.', 'error')
      return
    }
    const csvCell = (value: unknown): string => `"${String(value ?? '').replace(/"/g, '""')}"`
    const headers = ['ரசீது எண்', 'அடகு தேதி', 'மீட்பு தேதி', 'பெயர் / முகவரி', 'செல்', 'பொருள்', 'எடை', 'அசல்', 'வட்டி %', 'நிலை', 'மீட்ட தேதி', 'வசூலான வட்டி']
    const lines = records.map(record => [
      record.receiptNo, formatDate(record.pawnDate), formatDate(record.dueDate), record.customer,
      record.phone, record.items.replace(/\n/g, ' | '), `${record.wtKg} kg ${record.wtGm} g ${record.wtMg} mg`,
      record.principal, record.rate, record.status, formatDate(record.redeemedDate ?? ''), record.redeemedInterest,
    ].map(csvCell).join(','))
    downloadFile(`Sri_Vasanthi_Ledger_${today()}.csv`, `\uFEFF${[headers.map(csvCell).join(','), ...lines].join('\n')}`, 'text/csv;charset=utf-8')
  }

  function exportBackup(): void {
    if (!records.length) {
      showToast('Backup செய்ய பதிவுகள் இல்லை.', 'error')
      return
    }
    downloadFile(`Sri_Vasanthi_Backup_${today()}.json`, JSON.stringify(records, null, 2), 'application/json')
  }

  async function restoreBackup(event: FormEvent<HTMLInputElement>): Promise<void> {
    const input = event.currentTarget
    const file = input.files?.[0]
    if (!file) return
    setRestoreBusy(true)
    try {
      const parsed: unknown = JSON.parse(await file.text())
      if (!Array.isArray(parsed)) throw new Error('Backup must contain an array')
      const ids = new Set(records.map(record => record.id))
      const receiptNumbers = new Set(records.map(record => record.receiptNo.toLowerCase()))
      const additions = parsed.filter(isPawnRecord).filter(record => {
        if (ids.has(record.id) || receiptNumbers.has(record.receiptNo.toLowerCase())) return false
        ids.add(record.id)
        receiptNumbers.add(record.receiptNo.toLowerCase())
        return true
      })
      await savePawnRecords(additions)
      setRecords(current => [...additions, ...current])
      showToast(`${additions.length} புதிய பதிவுகள் மீட்டெடுக்கப்பட்டன.`, 'success')
    } catch (error) {
      console.error('Backup restore failed:', error)
      showToast('Backup கோப்பை படிக்க / சேமிக்க முடியவில்லை.', 'error')
    } finally {
      setRestoreBusy(false)
      input.value = ''
    }
  }

  if (!authReady) return <LoadingScreen label="நிர்வாகி அணுகலைச் சரிபார்க்கிறது..." />
  if (!user) {
    return (
      <LoginScreen
        email={email}
        password={password}
        error={authError}
        configured={supabaseConfigured}
        onEmail={setEmail}
        onPassword={setPassword}
        onSubmit={handleLogin}
      />
    )
  }
  if (dataLoading) return <LoadingScreen label="அடகு பதிவேட்டை ஏற்றுகிறது..." />
  if (dataError) {
    return (
      <div className="fatal-screen">
        <div className="fatal-card">
          <CircleAlert size={36} />
          <h1>பதிவேட்டைத் திறக்க முடியவில்லை</h1>
          <p>{dataError}</p>
          <div className="button-row">
            <button className="button button-primary" onClick={() => setReloadKey(value => value + 1)}>மீண்டும் முயற்சி</button>
            <button className="button button-quiet" onClick={() => void handleSignOut()}>வெளியேறு</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <header className="topbar no-print">
        <div className="brand-lockup">
          <div className="brand-mark"><Gem size={23} /></div>
          <div>
            <div className="brand-title">ஸ்ரீ வசந்தி நகை அடகு கடை</div>
            <div className="brand-subtitle">கும்பகோணம் <span>•</span> லைசென்ஸ் எண்: 20, 2026-27 <span>•</span> 9566660051</div>
          </div>
        </div>
        <div className="top-actions">
          <button className="button button-soft" onClick={() => void installApp()}><Download size={16} /> Install App</button>
          <button className="button button-soft" onClick={exportCsv}><FileSpreadsheet size={16} /> CSV</button>
          <button className="button button-soft" onClick={exportBackup}><ArrowDownToLine size={16} /> Backup</button>
          <button className="button button-soft" disabled={restoreBusy} onClick={() => restoreInput.current?.click()}>
            <Upload size={16} /> Restore
          </button>
          <input ref={restoreInput} className="visually-hidden" type="file" accept=".json,application/json" onChange={event => void restoreBackup(event)} />
          <span className="admin-chip"><ShieldCheck size={15} /> {user.email}</span>
          <button className="icon-button signout-button" title="வெளியேறு" onClick={() => void handleSignOut()}><LogOut size={18} /></button>
        </div>
      </header>

      <main className="workspace">
        <section className="dashboard-grid no-print">
          <StatCard label="மொத்த அடகு சீட்டுகள்" value={String(records.length)} icon={<Archive />} color="gold" />
          <StatCard label="செயலில் உள்ள அசல்" value={`₹ ${formatMoney(activePrincipal)}`} hint={`${activeRecords.length} சீட்டுகள் நிலுவையில்`} icon={<Wallet />} color="green" />
          <StatCard label="மீட்கப்பட்டவை" value={String(redeemedRecords.length)} hint={`மொத்த அசல்: ₹ ${formatMoney(redeemedPrincipal)}`} icon={<Check />} color="blue" />
          <StatCard label="வசூலான மொத்த வட்டி" value={`₹ ${formatMoney(totalInterest)}`} hint="மீட்பு கணக்குகளின்படி" icon={<Coins />} color="purple" />
        </section>

        <div className="page-heading no-print">
          <div>
            <div className="eyebrow">SHOP MANAGEMENT</div>
            <h1>{pane === 'new' ? 'அடகு சீட்டு' : 'அடகு பதிவேடு'}</h1>
            <p>அடகு விவரம், வாடிக்கையாளர் சீட்டு மற்றும் மீட்பு கணக்குகள்</p>
          </div>
          <nav className="segmented-nav" aria-label="பக்கங்கள்">
            <button className={pane === 'new' ? 'selected' : ''} onClick={() => setPane('new')}><FilePlus2 size={17} /> புதிய சீட்டு</button>
            <button className={pane === 'records' ? 'selected' : ''} onClick={() => setPane('records')}><BookOpen size={17} /> பதிவேடு <span className="nav-count">{records.length}</span></button>
          </nav>
        </div>

        {pane === 'new' ? (
          <section className="receipt-layout">
            <form className="panel receipt-form no-print" onSubmit={event => void saveReceipt(event)}>
              <div className="panel-heading">
                <div>
                  <h2>{editingId ? 'அடகு விவரம் திருத்தம்' : 'புதிய அடகு விவரம்'}</h2>
                  <p>{editingId ? `ரசீது ${draft.receiptNo}` : 'வாடிக்கையாளர் மற்றும் நகை விவரங்களை உள்ளிடவும்'}</p>
                </div>
                <button className="icon-button light" type="button" title="புதிய படிவம்" onClick={() => { setDraft(initialDraft(records)); setEditingId(null) }}><RotateCcw size={17} /></button>
              </div>
              <div className="form-grid two-columns">
                <Field label="ரசீது எண்" required><input required value={draft.receiptNo} onChange={event => updateDraft('receiptNo', event.target.value)} /></Field>
                <Field label="அடகு தேதி" required><input required type="date" value={draft.pawnDate} onChange={event => {
                  const newDate = event.target.value
                  const due = new Date(`${newDate}T00:00:00`)
                  due.setFullYear(due.getFullYear() + 1)
                  updateDraft('pawnDate', newDate)
                  updateDraft('dueDate', `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}-${String(due.getDate()).padStart(2, '0')}`)
                }} /></Field>
                <Field label="அசல் தொகை (₹)" required><input required type="number" min="1" step="0.01" value={draft.principal} onChange={event => updateDraft('principal', event.target.value)} placeholder="0.00" /></Field>
                <Field label="வட்டி விகிதம் (% வருடத்திற்கு)"><input type="number" min="0" step="0.1" value={draft.rate} onChange={event => updateDraft('rate', event.target.value)} /></Field>
              </div>
              <div className="interest-preview">
                <div className="interest-title"><Coins size={16} /> வட்டி முன்னோட்டம் <span>மாத வட்டி: ₹ {formatMoney(Math.round(monthlyInterest))}</span></div>
                <div className="interest-options">
                  {[1, 3, 6, 12].map(month => <div key={month}><small>{month === 12 ? '1 வருடம்' : `${month} மாதம்`}</small><strong>₹ {formatMoney(Math.round(monthlyInterest * month))}</strong></div>)}
                </div>
              </div>
              <Field label="அடகு வைப்பவரின் பெயர், முகவரி" required><textarea required rows={2} value={draft.customer} onChange={event => updateDraft('customer', event.target.value)} placeholder="பெயர், த/பெ அல்லது க/பெ, தெரு, ஊர்..." /></Field>
              <div className="form-grid two-columns">
                <Field label="செல் எண்" required><input required type="tel" maxLength={15} value={draft.phone} onChange={event => updateDraft('phone', event.target.value)} placeholder="9876543210" /></Field>
                <Field label="சராசரி மாத வருமானம் (₹)"><input type="number" min="0" value={draft.income} onChange={event => updateDraft('income', event.target.value)} placeholder="25000" /></Field>
              </div>
              <Field label="ஆதார் எண் (12 இலக்கம்)">
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={12}
                  value={draft.aadhaarNumber}
                  onChange={event => updateDraft('aadhaarNumber', event.target.value.replace(/\D/g, '').slice(0, 12))}
                  placeholder="12 இலக்க ஆதார் எண்"
                />
              </Field>
              <div className="form-grid two-columns">
                <ImageUploadField
                  label="வாடிக்கையாளர் புகைப்படம்"
                  image={draft.customerPhoto}
                  capture="environment"
                  onChange={event => void handleImageUpload('customerPhoto', event)}
                  onCaptured={image => updateDraft('customerPhoto', image)}
                  onRemove={() => updateDraft('customerPhoto', '')}
                />
                <ImageUploadField
                  label="அடகு பொருள் படம்"
                  image={draft.productImage}
                  capture="environment"
                  onChange={event => void handleImageUpload('productImage', event)}
                  onCaptured={image => updateDraft('productImage', image)}
                  onRemove={() => updateDraft('productImage', '')}
                />
              </div>
              <Field label="அடகு பொருள் விவரம்" required>
                <div className="quick-items">
                  {['தங்க செயின் - 1', 'தங்க மோதிரம் - 1', 'கம்மல் ஜோடி - 1', 'தங்க வளையல் - 2'].map(item => (
                    <button type="button" key={item} onClick={() => updateDraft('items', draft.items ? `${draft.items}\n${draft.items.split('\n').length + 1}. ${item}` : `1. ${item}`)}>+ {item.split(' - ')[0]}</button>
                  ))}
                </div>
                <textarea required rows={3} value={draft.items} onChange={event => updateDraft('items', event.target.value)} placeholder={'1. தங்க செயின் - 1 (கல் பதித்தது)\n2. தங்க மோதிரம் - 1'} />
              </Field>
              <div className="weight-fields">
                <div className="field-label"><Weight size={15} /> எடை விவரம்</div>
                <div className="form-grid three-columns">
                  <Field label="கிலோ"><input type="number" min="0" value={draft.wtKg} onChange={event => updateDraft('wtKg', event.target.value)} /></Field>
                  <Field label="கிராம்"><input type="number" min="0" value={draft.wtGm} onChange={event => updateDraft('wtGm', event.target.value)} /></Field>
                  <Field label="மி.கி."><input type="number" min="0" max="999" value={draft.wtMg} onChange={event => updateDraft('wtMg', event.target.value)} /></Field>
                </div>
              </div>
              <div className="form-grid two-columns">
                <Field label="பொருளின் சுமார் மதிப்பு (₹)"><input type="number" min="0" value={draft.approxVal} onChange={event => updateDraft('approxVal', event.target.value)} /></Field>
                <Field label="மீட்க ஒப்புக்கொண்ட தேதி"><input type="date" value={draft.dueDate} onChange={event => updateDraft('dueDate', event.target.value)} /></Field>
              </div>
              <div className="form-footer">
                <button className="button button-primary" type="submit" disabled={saving} onClick={() => { saveAction.current = 'print' }}><Printer size={17} /> {saving ? 'சேமிக்கிறது...' : 'சேமி & அச்சிடு'}</button>
                <button className="button button-secondary" type="submit" disabled={saving} onClick={() => { saveAction.current = 'save' }}><Check size={17} /> சேமி மட்டும்</button>
              </div>
            </form>

            <div className="preview-column">
              <div className="preview-toolbar no-print">
                <div><Printer size={16} /> ரசீது முன்னோட்டம்</div>
                <label className="toggle-label"><input type="checkbox" checked={showDualCopy} onChange={event => setShowDualCopy(event.target.checked)} /> இரட்டை நகல்</label>
                <button className="button button-soft" onClick={shareWhatsApp}><span className="whatsapp-mark">◉</span> WhatsApp</button>
                <button className="button button-soft" onClick={() => window.print()}><Printer size={16} /> அச்சிடு</button>
              </div>
              <ReceiptCard draft={draft} dual={showDualCopy} />
            </div>
          </section>
        ) : (
          <section className="panel ledger-panel no-print">
            <div className="ledger-heading">
              <div>
                <h2>சேமிக்கப்பட்ட அடகு சீட்டுகள்</h2>
                <p>ரசீது எண், பெயர், பொருள் அல்லது செல்போன் மூலம் தேடலாம்</p>
              </div>
              <div className="ledger-tools">
                <label className="search-box"><Search size={17} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="தேடுக..." /></label>
                <label className="select-box"><select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}>
                  <option value="ALL">அனைத்து நிலைகள்</option>
                  <option value="ACTIVE">செயலில் உள்ளவை</option>
                  <option value="OVERDUE">கெடு முடிந்தவை</option>
                  <option value="REDEEMED">மீட்கப்பட்டவை</option>
                </select><ChevronDown size={16} /></label>
              </div>
            </div>
            <div className="table-scroll">
              <table className="ledger-table">
                <thead><tr><th>ரசீது / தேதி</th><th>வாடிக்கையாளர்</th><th>பொருள் / எடை</th><th className="align-right">அசல் தொகை</th><th>நிலை</th><th className="align-right">செயல்கள்</th></tr></thead>
                <tbody>
                  {filteredRecords.map(record => {
                    const overdue = record.status === 'ACTIVE' && record.dueDate < today()
                    return (
                      <tr key={record.id}>
                        <td><strong className="receipt-no">{record.receiptNo}</strong><small>{formatDate(record.pawnDate)} · கெடு {formatDate(record.dueDate)}</small></td>
                        <td><strong>{record.customer.split('\n')[0]}</strong><small>{record.phone}</small></td>
                        <td><strong className="items-cell">{record.items}</strong><small>{record.wtKg} கி.கி · {record.wtGm} கிராம் · {record.wtMg} மி.கி</small></td>
                        <td className="align-right amount-cell">₹ {formatMoney(record.principal)}</td>
                        <td>{record.status === 'REDEEMED'
                          ? <span className="status-pill redeemed">மீட்கப்பட்டது</span>
                          : <span className={`status-pill ${overdue ? 'overdue' : 'active'}`}>{overdue ? 'கெடு முடிந்தது' : 'செயலில்'}</span>}</td>
                        <td><div className="row-actions">
                          <button className="icon-button light" title="அச்சிடு" onClick={() => printSavedRecord(record)}><Printer size={16} /></button>
                          <button className="icon-button light edit-action" title="திருத்து" onClick={() => editRecord(record)}><UserRound size={16} /></button>
                          {record.status === 'ACTIVE' && <button className="button button-redeem" onClick={() => openRedeem(record)}><HandCoins size={15} /> மீட்பு</button>}
                          <button className="icon-button danger" title="நீக்கு" onClick={() => void deleteRecord(record)}><Trash2 size={16} /></button>
                        </div></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {filteredRecords.length === 0 && <div className="empty-state"><BookOpen size={30} /><strong>பதிவுகள் இல்லை</strong><span>தேடல் அல்லது filter-ஐ மாற்றிப் பார்க்கவும்.</span><button className="button button-primary" onClick={() => setPane('new')}>புதிய சீட்டு உருவாக்கு</button></div>}
            </div>
          </section>
        )}
      </main>

      {redeemRecord && (
        <div className="modal-backdrop no-print" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setRedeemRecord(null) }}>
          <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="redeem-title">
            <div className="modal-heading"><div className="modal-icon"><HandCoins /></div><div><h2 id="redeem-title">நகை மீட்பு</h2><p>{redeemRecord.receiptNo} · {redeemRecord.customer.split('\n')[0]}</p></div><button className="icon-button light" onClick={() => setRedeemRecord(null)}><X size={18} /></button></div>
            <div className="redeem-summary"><span>அடகு தேதி<strong>{formatDate(redeemRecord.pawnDate)}</strong></span><span>அசல் தொகை<strong>₹ {formatMoney(redeemRecord.principal)}</strong></span></div>
            <Field label={`வட்டி தொகை (${redeemRecord.rate}% வருடத்திற்கு)`}><input type="number" min="0" value={redeemInterest} onChange={event => setRedeemInterest(event.target.value)} /></Field>
            <div className="redeem-total"><span>மொத்த மீட்புத் தொகை</span><strong>₹ {formatMoney(redeemRecord.principal + (Number(redeemInterest) || 0))}</strong></div>
            <div className="form-footer"><button className="button button-quiet" onClick={() => setRedeemRecord(null)}>ரத்து செய்</button><button className="button button-primary" onClick={() => void confirmRedeem()}><Check size={17} /> மீட்கப்பட்டது என பதிவு செய்</button></div>
          </section>
        </div>
      )}

      {toast && <div className={`toast toast-${toast.tone}`} role="status">{toast.tone === 'error' ? <CircleAlert size={17} /> : <Check size={17} />}{toast.text}</div>}
    </div>
  )
}

function LoginScreen(props: {
  email: string
  password: string
  error: string
  configured: boolean
  onEmail: (value: string) => void
  onPassword: (value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}) {
  return (
    <main className="login-screen">
      <div className="login-card">
        <div className="login-brand"><div className="brand-mark"><Gem size={25} /></div><span>நிர்வாகி அணுகல்</span></div>
        <h1>ஸ்ரீ வசந்தி<br />நகை அடகு கடை</h1>
        <p className="login-description">அடகு ரசீது மற்றும் பதிவேட்டைத் தொடர உள்நுழையவும்.</p>
        {!props.configured && <div className="setup-notice"><CircleAlert size={18} /><span>.env.local-ல் Supabase விவரங்களை அமைத்து app-ஐ மீண்டும் தொடங்கவும்.</span></div>}
        {props.error && <div className="login-error" role="alert"><CircleAlert size={17} />{props.error}</div>}
        <form onSubmit={props.onSubmit}>
          <Field label="நிர்வாகி மின்னஞ்சல்"><input required type="email" autoComplete="username" value={props.email} onChange={event => props.onEmail(event.target.value)} /></Field>
          <Field label="கடவுச்சொல்"><input required type="password" autoComplete="current-password" value={props.password} onChange={event => props.onPassword(event.target.value)} /></Field>
          <button className="button button-primary login-submit" disabled={!props.configured}><LockKeyhole size={17} /> பாதுகாப்பாக உள்நுழைக</button>
        </form>
        <div className="login-security"><ShieldCheck size={15} /> Supabase Authentication · Admin only</div>
      </div>
    </main>
  )
}

function LoadingScreen({ label }: { label: string }) {
  return <div className="loading-screen"><div className="loading-spinner" /><p>{label}</p></div>
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return <label className="field"><span>{label}{required && <b> *</b>}</span>{children}</label>
}

function ImageUploadField({
  label,
  image,
  capture,
  onChange,
  onCaptured,
  onRemove,
}: {
  label: string
  image: string
  capture: 'user' | 'environment'
  onChange: (event: ChangeEvent<HTMLInputElement>) => void
  onCaptured: (image: string) => void
  onRemove: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [cameraReady, setCameraReady] = useState(false)
  const [cameraError, setCameraError] = useState('')

  useEffect(() => {
    if (!cameraOpen) return
    let active = true
    setCameraReady(false)
    setCameraError('')
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('இந்த browser-ல் camera ஆதரவு இல்லை. HTTPS இணைப்பில் திறக்கவும்.')
      return
    }
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false,
    }).then(stream => {
      if (!active) {
        stream.getTracks().forEach(track => track.stop())
        return
      }
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        void videoRef.current.play().then(() => setCameraReady(true)).catch(error => {
          console.error('Camera preview failed:', error)
          setCameraError('Camera preview-ஐ திறக்க முடியவில்லை.')
        })
      }
    }).catch(error => {
      if (!active) return
      console.error('Camera access failed:', error)
      setCameraError('Camera-ஐ திறக்க முடியவில்லை. Browser camera permission-ஐ அனுமதிக்கவும்.')
    })
    return () => {
      active = false
      streamRef.current?.getTracks().forEach(track => track.stop())
      streamRef.current = null
      if (videoRef.current) videoRef.current.srcObject = null
    }
  }, [cameraOpen])

  async function takePhoto(): Promise<void> {
    if (!videoRef.current) return
    try {
      onCaptured(await captureVideoFrame(videoRef.current))
      setCameraOpen(false)
    } catch (error) {
      console.error('Camera capture failed:', error)
      setCameraError('படத்தை 20 KB-க்கு குறைவாக சுருக்க முடியவில்லை. மீண்டும் முயற்சிக்கவும்.')
    }
  }

  return (
    <>
      <Field label={label}>
        <button type="button" className="button button-camera" onClick={() => setCameraOpen(true)}>
          <Camera size={16} /> படம் எடுக்க
        </button>
        <small className="image-help">பின்பக்க camera · JPG, PNG அல்லது WebP · 20 KB-க்கு குறைவு</small>
        <input type="file" accept="image/jpeg,image/png,image/webp" capture={capture} onChange={onChange} />
        {image && (
          <div className="image-preview">
            <img src={image} alt={label} />
            <button type="button" className="button button-quiet" onClick={onRemove}>படத்தை நீக்கு</button>
          </div>
        )}
      </Field>
      {cameraOpen && (
        <div className="camera-backdrop">
          <section className="camera-dialog" role="dialog" aria-modal="true" aria-label={`${label} — படம் எடுக்க`}>
            <div className="camera-heading">
              <strong>{label}</strong>
              <button type="button" className="icon-button light" onClick={() => setCameraOpen(false)} aria-label="மூடு"><X size={18} /></button>
            </div>
            <video ref={videoRef} autoPlay playsInline muted />
            {cameraError && <p className="camera-error">{cameraError}</p>}
            <div className="camera-actions">
              <button type="button" className="button button-quiet" onClick={() => setCameraOpen(false)}>ரத்து</button>
              <button type="button" className="button button-primary" disabled={!cameraReady} onClick={() => void takePhoto()}>
                <Camera size={16} /> படம் எடுக்க
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  )
}

function StatCard({ label, value, hint, icon, color }: { label: string; value: string; hint?: string; icon: React.ReactNode; color: string }) {
  return <article className={`stat-card stat-${color}`}><div className="stat-copy"><span>{label}</span><strong>{value}</strong>{hint && <small>{hint}</small>}</div><div className="stat-icon">{icon}</div></article>
}

function ReceiptCard({ draft, dual }: { draft: PawnDraft; dual: boolean }) {
  const copy = (label: string) => (
    <article className="receipt-sheet" key={label}>
      <div className="receipt-frame">
        <div className="receipt-overline"><span>உ</span><strong>ஸ்ரீ ராமஜெயம்</strong><span className="copy-badge">{label}</span><b>ரசீது: {draft.receiptNo || 'SV-1001'}</b></div>
        <header className="receipt-header">
          <h2>ஸ்ரீ வசந்தி நகை அடகு கடை</h2>
          <p>முகவரி: காசிராமன் தெரு, மாநகராட்சி புதிய வணிக வளாகம், கடை எண் – 2, கும்பகோணம்.</p>
          <p>செல்: 9566660051</p>
          <div className="receipt-meta"><span>லைசென்ஸ் எண்: <b>20, 2026-27</b></span><strong>அடகு சீட்டு</strong><span>அடகு தேதி: <b>{formatDate(draft.pawnDate)}</b></span></div>
        </header>
        <div className="receipt-money">
          <strong>அசல் ரூ.: ₹ {draft.principal ? formatMoney(draft.principal) : '__________________'} /-</strong>
          <span>வட்டி விகிதம்: <b>{draft.rate || '16'}%</b> வருடத்திற்கு</span>
          {draft.principal && <small>{numberToTamilWords(Number(draft.principal))}</small>}
        </div>
        <p className="receipt-preamble">அடியில் கண்ட பொருள்கள் எங்களிடம் அடகு வைக்கப்பட்டுள்ளது.</p>
        <div className="receipt-box"><small>அடகு வைப்பவரின் பெயர், முகவரி</small><p>{draft.customer || '________________________________________________________________'}</p></div>
        <div className="receipt-items"><div><small>அடகு பொருள் விவரம்</small><p>{draft.items || '—'}</p></div><table><tbody><tr><th>கிலோ</th><th>கிராம்</th><th>மி.கி.</th></tr><tr><td>{draft.wtKg || '0'}</td><td>{draft.wtGm || '0'}</td><td>{draft.wtMg || '000'}</td></tr></tbody></table></div>
        <div className="receipt-bottom"><span>சுமார் மதிப்பு: <b>{draft.approxVal ? `₹ ${formatMoney(draft.approxVal)}` : '________________'}</b></span><span>மீட்க ஒப்புக்கொண்ட தேதி: <b>{formatDate(draft.dueDate)}</b></span></div>
        <div className="receipt-contact"><span>மாத வருமானம்: <b>{draft.income ? `₹ ${formatMoney(draft.income)}` : '__________'}</b></span><span>செல் எண்: <b>{draft.phone || '________________'}</b></span></div>
        <div className="receipt-signatures"><span>அடகு வைத்தவர் கையெழுத்து</span><span>அடகு பிடிப்பவர் கையெழுத்து</span></div>
        <footer>குறிப்பு: இந்த சீட்டை பத்திரமாக பாதுகாப்பாக வைத்துக் கொள்ளவும்.</footer>
      </div>
    </article>
  )
  return <div className="receipt-print-area">{copy(dual ? 'வாடிக்கையாளர் நகல்' : 'வாடிக்கையாளர் நகல்')}{dual && copy('அலுவலக நகல்')}</div>
}

function downloadFile(filename: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default App
