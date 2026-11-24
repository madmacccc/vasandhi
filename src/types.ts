export type RecordStatus = 'ACTIVE' | 'REDEEMED'

export interface PawnRecord {
  id: string
  receiptNo: string
  pawnDate: string
  principal: number
  rate: number
  customer: string
  aadhaarNumber: string
  phone: string
  income: string
  items: string
  customerPhoto: string | null
  productImage: string | null
  wtKg: string
  wtGm: string
  wtMg: string
  approxVal: string
  dueDate: string
  status: RecordStatus
  redeemedDate: string | null
  redeemedInterest: number
  createdAt: string
  updatedAt?: string
}

export type PawnDraft = Omit<
  PawnRecord,
  | 'id'
  | 'principal'
  | 'rate'
  | 'status'
  | 'redeemedDate'
  | 'redeemedInterest'
  | 'createdAt'
  | 'updatedAt'
  | 'aadhaarNumber'
  | 'customerPhoto'
  | 'productImage'
> & {
  aadhaarNumber: string
  customerPhoto: string
  productImage: string
  principal: string
  rate: string
  approxVal: string
}
