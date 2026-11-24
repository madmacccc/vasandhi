import { createClient } from '@supabase/supabase-js'
import type { PawnRecord } from '../types'

interface Database {
  public: {
    Tables: {
      pawn_records: {
        Row: {
          id: string
          receipt_no: string
          record_data: PawnRecord
          pawn_date: string | null
          principal: number | null
          rate: number | null
          customer: string | null
          aadhaar_number: string | null
          phone: string | null
          income: string | null
          items: string | null
          customer_photo: string | null
          product_image: string | null
          wt_kg: string | null
          wt_gm: string | null
          wt_mg: string | null
          approx_val: string | null
          due_date: string | null
          status: string | null
          redeemed_date: string | null
          redeemed_interest: number | null
          updated_at: string | null
          created_at: string
        }
        Insert: {
          id: string
          receipt_no: string
          record_data: PawnRecord
          pawn_date?: string | null
          principal?: number | null
          rate?: number | null
          customer?: string | null
          aadhaar_number?: string | null
          phone?: string | null
          income?: string | null
          items?: string | null
          customer_photo?: string | null
          product_image?: string | null
          wt_kg?: string | null
          wt_gm?: string | null
          wt_mg?: string | null
          approx_val?: string | null
          due_date?: string | null
          status?: string | null
          redeemed_date?: string | null
          redeemed_interest?: number | null
          updated_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          receipt_no?: string
          record_data?: PawnRecord
          pawn_date?: string | null
          principal?: number | null
          rate?: number | null
          customer?: string | null
          aadhaar_number?: string | null
          phone?: string | null
          income?: string | null
          items?: string | null
          customer_photo?: string | null
          product_image?: string | null
          wt_kg?: string | null
          wt_gm?: string | null
          wt_mg?: string | null
          approx_val?: string | null
          due_date?: string | null
          status?: string | null
          redeemed_date?: string | null
          redeemed_interest?: number | null
          updated_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

const projectUrl = import.meta.env.VITE_SUPABASE_URL ?? ''
const publicKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''
const photoBucket = 'pawn-photos'
export const adminEmail = (import.meta.env.VITE_ADMIN_EMAIL ?? '').trim().toLowerCase()
export const supabaseConfigured = Boolean(
  projectUrl.startsWith('https://') &&
    publicKey &&
    !publicKey.startsWith('REPLACE_') &&
    adminEmail &&
    !adminEmail.startsWith('REPLACE_'),
)

export const supabase = supabaseConfigured
  ? createClient<Database>(projectUrl, publicKey)
  : null

function getClient() {
  if (!supabase) throw new Error('Supabase environment configuration is missing')
  return supabase
}

export async function listPawnRecords(): Promise<PawnRecord[]> {
  const { data, error } = await getClient()
    .from('pawn_records')
    .select('record_data')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data.map(row => row.record_data)
}

export async function savePawnRecords(records: PawnRecord | PawnRecord[]): Promise<void> {
  const rows = (Array.isArray(records) ? records : [records]).map(record => ({
    id: record.id,
    receipt_no: record.receiptNo,
    record_data: record,
    pawn_date: record.pawnDate || null,
    principal: record.principal,
    rate: record.rate,
    customer: record.customer,
    aadhaar_number: record.aadhaarNumber ?? null,
    phone: record.phone,
    income: record.income,
    items: record.items,
    customer_photo: record.customerPhoto ?? null,
    product_image: record.productImage ?? null,
    wt_kg: record.wtKg,
    wt_gm: record.wtGm,
    wt_mg: record.wtMg,
    approx_val: record.approxVal,
    due_date: record.dueDate || null,
    status: record.status,
    redeemed_date: record.redeemedDate,
    redeemed_interest: record.redeemedInterest,
    updated_at: record.updatedAt ?? null,
  }))
  if (!rows.length) return
  const { error } = await getClient().from('pawn_records').upsert(rows, { onConflict: 'id' })
  if (error) throw error
}

export async function removePawnRecord(id: string): Promise<void> {
  const { error } = await getClient().from('pawn_records').delete().eq('id', id)
  if (error) throw error
}

export async function uploadPawnPhoto(
  recordId: string,
  receiptNo: string,
  kind: 'customer' | 'product',
  dataUrl: string,
): Promise<string> {
  const mimeType = /^data:(image\/(?:jpeg|png|webp));base64,/i.exec(dataUrl)?.[1]?.toLowerCase()
  if (!mimeType) throw new Error('Unsupported photo data')
  const blob = await (await fetch(dataUrl)).blob()
  const extension = mimeType === 'image/jpeg' ? 'jpg' : mimeType.slice('image/'.length)
  const safeReceiptNo = receiptNo.trim().replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40)
  const path = `${recordId}/${safeReceiptNo}-${kind}-${crypto.randomUUID()}.${extension}`
  const { data, error } = await getClient().storage.from(photoBucket).upload(path, blob, {
    contentType: mimeType,
    upsert: false,
  })
  if (error) throw error
  return data.path
}

export async function getPawnPhotoUrl(path: string): Promise<string> {
  const { data, error } = await getClient().storage.from(photoBucket).createSignedUrl(path, 60 * 60)
  if (error) throw error
  return data.signedUrl
}

export async function removePawnPhotos(paths: string[]): Promise<void> {
  if (!paths.length) return
  const { error } = await getClient().storage.from(photoBucket).remove(paths)
  if (error) throw error
}

export async function getPawnPhotoDataUrl(path: string): Promise<string> {
  const signedUrl = await getPawnPhotoUrl(path)
  const response = await fetch(signedUrl)
  if (!response.ok) throw new Error(`Could not download photo (${response.status})`)
  const blob = await response.blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error('Could not encode photo for backup'))
    }
    reader.onerror = () => reject(reader.error ?? new Error('Could not encode photo for backup'))
    reader.readAsDataURL(blob)
  })
}
