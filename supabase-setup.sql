create table if not exists public.pawn_records (
    id text primary key,
    receipt_no text not null,
    record_data jsonb not null,
    pawn_date date,
    principal numeric,
    rate numeric,
    customer text,
    aadhaar_number text,
    phone text,
    income text,
    items text,
    customer_photo text,
    product_image text,
    wt_kg text,
    wt_gm text,
    wt_mg text,
    approx_val text,
    due_date date,
    status text,
    redeemed_date date,
    redeemed_interest numeric,
    updated_at timestamptz,
    created_at timestamptz not null default now()
);

alter table public.pawn_records
    add column if not exists pawn_date date,
    add column if not exists principal numeric,
    add column if not exists rate numeric,
    add column if not exists customer text,
    add column if not exists aadhaar_number text,
    add column if not exists phone text,
    add column if not exists income text,
    add column if not exists items text,
    add column if not exists customer_photo text,
    add column if not exists product_image text,
    add column if not exists wt_kg text,
    add column if not exists wt_gm text,
    add column if not exists wt_mg text,
    add column if not exists approx_val text,
    add column if not exists due_date date,
    add column if not exists status text,
    add column if not exists redeemed_date date,
    add column if not exists redeemed_interest numeric,
    add column if not exists updated_at timestamptz;

update public.pawn_records
set pawn_date = nullif(record_data ->> 'pawnDate', '')::date,
    principal = nullif(record_data ->> 'principal', '')::numeric,
    rate = nullif(record_data ->> 'rate', '')::numeric,
    customer = record_data ->> 'customer',
    aadhaar_number = nullif(record_data ->> 'aadhaarNumber', ''),
    phone = record_data ->> 'phone',
    income = record_data ->> 'income',
    items = record_data ->> 'items',
    customer_photo = nullif(record_data ->> 'customerPhoto', ''),
    product_image = nullif(record_data ->> 'productImage', ''),
    wt_kg = record_data ->> 'wtKg',
    wt_gm = record_data ->> 'wtGm',
    wt_mg = record_data ->> 'wtMg',
    approx_val = record_data ->> 'approxVal',
    due_date = nullif(record_data ->> 'dueDate', '')::date,
    status = record_data ->> 'status',
    redeemed_date = nullif(record_data ->> 'redeemedDate', '')::date,
    redeemed_interest = nullif(record_data ->> 'redeemedInterest', '')::numeric,
    updated_at = nullif(record_data ->> 'updatedAt', '')::timestamptz
where record_data is not null;

create unique index if not exists pawn_records_receipt_no_unique
    on public.pawn_records (lower(receipt_no));

alter table public.pawn_records enable row level security;

revoke all on public.pawn_records from anon;
grant select, insert, update, delete on public.pawn_records to authenticated;

drop policy if exists "Admin can read pawn records" on public.pawn_records;
create policy "Admin can read pawn records"
    on public.pawn_records for select to authenticated
    using (
        lower(coalesce(auth.jwt() ->> 'email', '')) = lower('madmac3214@gmail.com')
    );

drop policy if exists "Admin can insert pawn records" on public.pawn_records;
create policy "Admin can insert pawn records"
    on public.pawn_records for insert to authenticated
    with check (
        lower(coalesce(auth.jwt() ->> 'email', '')) = lower('madmac3214@gmail.com')
    );

drop policy if exists "Admin can update pawn records" on public.pawn_records;
create policy "Admin can update pawn records"
    on public.pawn_records for update to authenticated
    using (
        lower(coalesce(auth.jwt() ->> 'email', '')) = lower('madmac3214@gmail.com')
    )
    with check (
        lower(coalesce(auth.jwt() ->> 'email', '')) = lower('madmac3214@gmail.com')
    );

drop policy if exists "Admin can delete pawn records" on public.pawn_records;
create policy "Admin can delete pawn records"
    on public.pawn_records for delete to authenticated
    using (
        lower(coalesce(auth.jwt() ->> 'email', '')) = lower('madmac3214@gmail.com')
    );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'pawn-photos',
    'pawn-photos',
    false,
    5242880,
    array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Admin can read pawn photos" on storage.objects;
create policy "Admin can read pawn photos"
    on storage.objects for select to authenticated
    using (
        bucket_id = 'pawn-photos'
        and lower(coalesce(auth.jwt() ->> 'email', '')) = lower('madmac3214@gmail.com')
    );

drop policy if exists "Admin can upload pawn photos" on storage.objects;
create policy "Admin can upload pawn photos"
    on storage.objects for insert to authenticated
    with check (
        bucket_id = 'pawn-photos'
        and lower(coalesce(auth.jwt() ->> 'email', '')) = lower('madmac3214@gmail.com')
    );

drop policy if exists "Admin can delete pawn photos" on storage.objects;
create policy "Admin can delete pawn photos"
    on storage.objects for delete to authenticated
    using (
        bucket_id = 'pawn-photos'
        and lower(coalesce(auth.jwt() ->> 'email', '')) = lower('madmac3214@gmail.com')
    );
