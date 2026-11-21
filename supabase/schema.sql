CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE public.shop_role AS ENUM ('admin', 'cashier');
CREATE TYPE public.ticket_status AS ENUM ('active', 'redeemed');
CREATE TYPE public.payment_method AS ENUM ('Cash', 'UPI', 'Other');
CREATE TYPE public.interest_method AS ENUM ('daily', 'monthly', 'annual');

CREATE TABLE public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.shops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.shop_memberships (
  shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role public.shop_role NOT NULL DEFAULT 'cashier',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (shop_id, user_id)
);

CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  customer_no TEXT NOT NULL,
  name TEXT NOT NULL,
  mobile TEXT NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  id_reference TEXT NOT NULL DEFAULT '',
  photo_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (shop_id, customer_no),
  UNIQUE (shop_id, id)
);

CREATE TABLE public.pawn_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  receipt_no TEXT NOT NULL,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  jewellery_type TEXT NOT NULL,
  purity TEXT NOT NULL CHECK (purity IN ('24K', '22K', '20K', '18K')),
  gross_weight NUMERIC(12, 3) NOT NULL CHECK (gross_weight > 0),
  stone_weight NUMERIC(12, 3) NOT NULL DEFAULT 0 CHECK (stone_weight >= 0 AND stone_weight <= gross_weight),
  loan_paise BIGINT NOT NULL CHECK (loan_paise > 0),
  annual_rate_bps INTEGER NOT NULL CHECK (annual_rate_bps >= 0),
  approximate_value_paise BIGINT NOT NULL DEFAULT 0 CHECK (approximate_value_paise >= 0),
  declared_monthly_income_paise BIGINT NOT NULL DEFAULT 0 CHECK (declared_monthly_income_paise >= 0),
  signature_ciphertext TEXT,
  pawn_date DATE NOT NULL,
  maturity_date DATE NOT NULL CHECK (maturity_date > pawn_date),
  notes TEXT NOT NULL DEFAULT '',
  status public.ticket_status NOT NULL DEFAULT 'active',
  created_by UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (shop_id, receipt_no),
  UNIQUE (shop_id, id),
  FOREIGN KEY (shop_id, customer_id) REFERENCES public.customers(shop_id, id) ON DELETE RESTRICT
);

CREATE TABLE public.pawn_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  ticket_id UUID NOT NULL REFERENCES public.pawn_tickets(id) ON DELETE RESTRICT,
  description TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  gross_weight NUMERIC(12, 3) NOT NULL CHECK (gross_weight >= 0),
  stone_weight NUMERIC(12, 3) NOT NULL DEFAULT 0 CHECK (stone_weight >= 0 AND stone_weight <= gross_weight),
  purity TEXT NOT NULL CHECK (purity IN ('24K', '22K', '20K', '18K')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (shop_id, id),
  FOREIGN KEY (shop_id, ticket_id) REFERENCES public.pawn_tickets(shop_id, id) ON DELETE RESTRICT
);

CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  transaction_no TEXT NOT NULL,
  ticket_id UUID NOT NULL REFERENCES public.pawn_tickets(id) ON DELETE RESTRICT,
  amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
  interest_paise BIGINT NOT NULL DEFAULT 0 CHECK (interest_paise >= 0),
  principal_paise BIGINT NOT NULL DEFAULT 0 CHECK (principal_paise >= 0),
  method public.payment_method NOT NULL,
  paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  received_by UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (shop_id, transaction_no),
  CHECK (interest_paise + principal_paise = amount_paise),
  UNIQUE (shop_id, id)
);

CREATE TABLE public.interest_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  ticket_id UUID NOT NULL REFERENCES public.pawn_tickets(id) ON DELETE RESTRICT,
  payment_id UUID REFERENCES public.payments(id) ON DELETE RESTRICT,
  principal_paise BIGINT NOT NULL CHECK (principal_paise >= 0),
  interest_paise BIGINT NOT NULL CHECK (interest_paise >= 0),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL CHECK (period_end >= period_start),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (shop_id, ticket_id) REFERENCES public.pawn_tickets(shop_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (shop_id, payment_id) REFERENCES public.payments(shop_id, id) ON DELETE RESTRICT
);

CREATE TABLE public.redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  ticket_id UUID NOT NULL REFERENCES public.pawn_tickets(id) ON DELETE RESTRICT,
  payment_id UUID NOT NULL REFERENCES public.payments(id) ON DELETE RESTRICT,
  redemption_no TEXT NOT NULL,
  redeemed_by UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (shop_id, redemption_no),
  UNIQUE (ticket_id),
  FOREIGN KEY (shop_id, ticket_id) REFERENCES public.pawn_tickets(shop_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (shop_id, payment_id) REFERENCES public.payments(shop_id, id) ON DELETE RESTRICT
);

CREATE TABLE public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  expense_no TEXT NOT NULL,
  description TEXT NOT NULL,
  amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
  method public.payment_method NOT NULL,
  spent_on DATE NOT NULL,
  created_by UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (shop_id, expense_no)
);

CREATE TABLE public.shop_settings (
  shop_id UUID PRIMARY KEY REFERENCES public.shops(id) ON DELETE CASCADE,
  default_rate_bps INTEGER NOT NULL DEFAULT 1600 CHECK (default_rate_bps >= 0),
  interest_method public.interest_method NOT NULL DEFAULT 'daily',
  day_count_basis INTEGER NOT NULL DEFAULT 365 CHECK (day_count_basis IN (360, 365)),
  currency TEXT NOT NULL DEFAULT 'INR',
  receipt_terms TEXT NOT NULL DEFAULT '',
  updated_by UUID REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.sync_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('upsert', 'delete')),
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'synced', 'conflict', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (shop_id, entity_type, entity_id, operation)
);

CREATE INDEX idx_memberships_user ON public.shop_memberships(user_id);
CREATE INDEX idx_customers_shop_mobile ON public.customers(shop_id, mobile);
CREATE INDEX idx_customers_shop_name ON public.customers(shop_id, name);
CREATE INDEX idx_tickets_shop_status ON public.pawn_tickets(shop_id, status);
CREATE INDEX idx_tickets_customer ON public.pawn_tickets(customer_id);
CREATE INDEX idx_payments_shop_paid_at ON public.payments(shop_id, paid_at);
CREATE INDEX idx_payments_ticket_paid_at ON public.payments(ticket_id, paid_at);
CREATE INDEX idx_interest_ticket_period ON public.interest_transactions(ticket_id, period_end);
CREATE INDEX idx_expenses_shop_date ON public.expenses(shop_id, spent_on);
CREATE INDEX idx_audit_shop_created ON public.audit_logs(shop_id, created_at DESC);
CREATE INDEX idx_sync_shop_status ON public.sync_queue(shop_id, status, created_at);

CREATE OR REPLACE FUNCTION public.current_shop_role(target_shop UUID)
RETURNS public.shop_role
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT m.role
  FROM public.shop_memberships AS m
  WHERE m.shop_id = target_shop AND m.user_id = (SELECT auth.uid())
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.is_shop_member(target_shop UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.shop_memberships AS m
    WHERE m.shop_id = target_shop AND m.user_id = (SELECT auth.uid())
  )
$$;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION public.create_user_profile()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.users (id, email, display_name)
  VALUES (NEW.id, COALESCE(NEW.email, ''), COALESCE(NEW.raw_user_meta_data ->> 'display_name', ''));
  RETURN NEW;
END
$$;

CREATE TRIGGER auth_user_profile_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.create_user_profile();

CREATE OR REPLACE FUNCTION public.bootstrap_shop(shop_name TEXT)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  new_shop_id UUID;
BEGIN
  IF auth.uid() IS NULL OR length(trim(shop_name)) = 0 THEN
    RAISE EXCEPTION 'Authentication and a shop name are required';
  END IF;

  INSERT INTO public.users (id, email, display_name)
  SELECT
    auth_user.id,
    COALESCE(auth_user.email, ''),
    COALESCE(auth_user.raw_user_meta_data ->> 'display_name', '')
  FROM auth.users AS auth_user
  WHERE auth_user.id = auth.uid()
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      updated_at = now();

  SELECT shop_id INTO new_shop_id
  FROM public.shop_memberships
  WHERE user_id = auth.uid()
  ORDER BY created_at
  LIMIT 1;
  IF new_shop_id IS NOT NULL THEN
    RETURN new_shop_id;
  END IF;

  SELECT id INTO new_shop_id
  FROM public.shops
  WHERE owner_id = auth.uid()
  ORDER BY created_at
  LIMIT 1;
  IF new_shop_id IS NOT NULL THEN
    INSERT INTO public.shop_memberships (shop_id, user_id, role)
    VALUES (new_shop_id, auth.uid(), 'admin');
    RETURN new_shop_id;
  END IF;

  INSERT INTO public.shops (name, owner_id) VALUES (trim(shop_name), auth.uid()) RETURNING id INTO new_shop_id;
  INSERT INTO public.shop_memberships (shop_id, user_id, role) VALUES (new_shop_id, auth.uid(), 'admin');
  INSERT INTO public.shop_settings (shop_id, updated_by) VALUES (new_shop_id, auth.uid());
  RETURN new_shop_id;
END
$$;

CREATE OR REPLACE FUNCTION public.set_ticket_redeemed_on_redemption()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  ticket_shop UUID;
  ticket_state public.ticket_status;
  outstanding_principal BIGINT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.payments AS p
    WHERE p.id = NEW.payment_id AND p.ticket_id = NEW.ticket_id AND p.shop_id = NEW.shop_id
  ) THEN
    RAISE EXCEPTION 'Redemption requires a successful payment for this ticket';
  END IF;
  SELECT shop_id, status INTO ticket_shop, ticket_state
  FROM public.pawn_tickets WHERE id = NEW.ticket_id FOR UPDATE;
  IF ticket_shop IS DISTINCT FROM NEW.shop_id OR ticket_state <> 'active' THEN
    RAISE EXCEPTION 'Ticket is unavailable for redemption';
  END IF;
  SELECT loan_paise - COALESCE(sum(p.principal_paise), 0)
  INTO outstanding_principal FROM public.pawn_tickets t
  LEFT JOIN public.payments p ON p.ticket_id = t.id
  WHERE t.id = NEW.ticket_id GROUP BY t.loan_paise;
  IF outstanding_principal > 0 THEN
    RAISE EXCEPTION 'Principal balance must be settled before redemption';
  END IF;
  UPDATE public.pawn_tickets SET status = 'redeemed', updated_at = now() WHERE id = NEW.ticket_id;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION public.record_payment(
  p_id UUID,
  p_shop_id UUID,
  p_transaction_no TEXT,
  p_ticket_id UUID,
  p_amount_paise BIGINT,
  p_interest_paise BIGINT,
  p_principal_paise BIGINT,
  p_method public.payment_method,
  p_paid_at TIMESTAMPTZ,
  p_received_by UUID,
  p_redeem BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  ticket_loan BIGINT;
  principal_paid BIGINT;
BEGIN
  IF auth.uid() IS NULL
     OR p_received_by IS DISTINCT FROM auth.uid()
     OR COALESCE(public.current_shop_role(p_shop_id)::TEXT, '') NOT IN ('admin', 'cashier') THEN
    RAISE EXCEPTION 'You are not allowed to record payments for this shop';
  END IF;

  IF EXISTS (SELECT 1 FROM public.payments WHERE id = p_id) THEN
    IF EXISTS (
      SELECT 1 FROM public.payments
      WHERE id = p_id AND shop_id = p_shop_id AND ticket_id = p_ticket_id
        AND amount_paise = p_amount_paise AND interest_paise = p_interest_paise
        AND principal_paise = p_principal_paise AND method = p_method
        AND paid_at = p_paid_at AND received_by = p_received_by
    ) THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'Payment ID is already in use';
  END IF;

  SELECT loan_paise INTO ticket_loan
  FROM public.pawn_tickets
  WHERE id = p_ticket_id AND shop_id = p_shop_id AND status = 'active'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket is unavailable for payment';
  END IF;
  SELECT COALESCE(sum(principal_paise), 0) INTO principal_paid
  FROM public.payments WHERE ticket_id = p_ticket_id;
  IF p_principal_paise > ticket_loan - principal_paid THEN
    RAISE EXCEPTION 'Payment exceeds the outstanding principal balance';
  END IF;

  INSERT INTO public.payments (
    id, shop_id, transaction_no, ticket_id, amount_paise, interest_paise,
    principal_paise, method, paid_at, received_by
  ) VALUES (
    p_id, p_shop_id, p_transaction_no, p_ticket_id, p_amount_paise, p_interest_paise,
    p_principal_paise, p_method, p_paid_at, p_received_by
  );

  IF p_redeem THEN
    INSERT INTO public.redemptions (
      shop_id, ticket_id, payment_id, redemption_no, redeemed_by
    ) VALUES (
      p_shop_id, p_ticket_id, p_id, 'RED-' || p_transaction_no, p_received_by
    );
  END IF;
END
$$;

CREATE TRIGGER redemption_closes_ticket
BEFORE INSERT ON public.redemptions
FOR EACH ROW EXECUTE FUNCTION public.set_ticket_redeemed_on_redemption();

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'users', 'shops', 'customers', 'pawn_tickets', 'pawn_items', 'payments',
    'expenses', 'shop_settings', 'sync_queue'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at()',
      table_name || '_touch_updated_at', table_name
    );
  END LOOP;
END
$$;

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'users', 'shops', 'shop_memberships', 'customers', 'pawn_tickets', 'pawn_items', 'payments',
    'interest_transactions', 'redemptions', 'expenses', 'shop_settings', 'audit_logs', 'sync_queue'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
  END LOOP;
END
$$;

CREATE POLICY users_select_self ON public.users FOR SELECT TO authenticated USING (id = (SELECT auth.uid()));
CREATE POLICY users_update_self ON public.users FOR UPDATE TO authenticated USING (id = (SELECT auth.uid())) WITH CHECK (id = (SELECT auth.uid()));
CREATE POLICY shops_select_member ON public.shops FOR SELECT TO authenticated USING (public.is_shop_member(id));
CREATE POLICY shops_update_admin ON public.shops FOR UPDATE TO authenticated USING (public.current_shop_role(id) = 'admin') WITH CHECK (public.current_shop_role(id) = 'admin');
CREATE POLICY memberships_select_member ON public.shop_memberships FOR SELECT TO authenticated USING (public.is_shop_member(shop_id));
CREATE POLICY memberships_admin_manage ON public.shop_memberships FOR ALL TO authenticated USING (public.current_shop_role(shop_id) = 'admin') WITH CHECK (public.current_shop_role(shop_id) = 'admin');

CREATE POLICY customers_select_member ON public.customers FOR SELECT TO authenticated USING (public.is_shop_member(shop_id));
CREATE POLICY customers_insert_member ON public.customers FOR INSERT TO authenticated WITH CHECK (public.current_shop_role(shop_id) IN ('admin', 'cashier'));
CREATE POLICY customers_update_member ON public.customers FOR UPDATE TO authenticated USING (public.current_shop_role(shop_id) IN ('admin', 'cashier')) WITH CHECK (public.current_shop_role(shop_id) IN ('admin', 'cashier'));
CREATE POLICY customers_delete_admin ON public.customers FOR DELETE TO authenticated USING (public.current_shop_role(shop_id) = 'admin');

CREATE POLICY tickets_select_member ON public.pawn_tickets FOR SELECT TO authenticated USING (public.is_shop_member(shop_id));
CREATE POLICY tickets_insert_member ON public.pawn_tickets FOR INSERT TO authenticated WITH CHECK (public.current_shop_role(shop_id) IN ('admin', 'cashier') AND created_by = (SELECT auth.uid()));
CREATE POLICY tickets_update_admin ON public.pawn_tickets FOR UPDATE TO authenticated USING (public.current_shop_role(shop_id) = 'admin') WITH CHECK (public.current_shop_role(shop_id) = 'admin');
CREATE POLICY tickets_delete_admin ON public.pawn_tickets FOR DELETE TO authenticated USING (public.current_shop_role(shop_id) = 'admin');

CREATE POLICY pawn_items_select_member ON public.pawn_items FOR SELECT TO authenticated USING (public.is_shop_member(shop_id));
CREATE POLICY pawn_items_write_member ON public.pawn_items FOR INSERT TO authenticated WITH CHECK (public.current_shop_role(shop_id) IN ('admin', 'cashier'));
CREATE POLICY pawn_items_update_admin ON public.pawn_items FOR UPDATE TO authenticated USING (public.current_shop_role(shop_id) = 'admin') WITH CHECK (public.current_shop_role(shop_id) = 'admin');
CREATE POLICY pawn_items_delete_admin ON public.pawn_items FOR DELETE TO authenticated USING (public.current_shop_role(shop_id) = 'admin');

CREATE POLICY payments_select_member ON public.payments FOR SELECT TO authenticated USING (public.is_shop_member(shop_id));
CREATE POLICY payments_insert_member ON public.payments FOR INSERT TO authenticated WITH CHECK (public.current_shop_role(shop_id) IN ('admin', 'cashier') AND received_by = (SELECT auth.uid()));
CREATE POLICY payments_update_admin ON public.payments FOR UPDATE TO authenticated USING (public.current_shop_role(shop_id) = 'admin') WITH CHECK (public.current_shop_role(shop_id) = 'admin');
CREATE POLICY payments_delete_admin ON public.payments FOR DELETE TO authenticated USING (public.current_shop_role(shop_id) = 'admin');

CREATE POLICY interest_select_member ON public.interest_transactions FOR SELECT TO authenticated USING (public.is_shop_member(shop_id));
CREATE POLICY interest_insert_member ON public.interest_transactions FOR INSERT TO authenticated WITH CHECK (public.current_shop_role(shop_id) IN ('admin', 'cashier'));
CREATE POLICY interest_update_admin ON public.interest_transactions FOR UPDATE TO authenticated USING (public.current_shop_role(shop_id) = 'admin') WITH CHECK (public.current_shop_role(shop_id) = 'admin');
CREATE POLICY interest_delete_admin ON public.interest_transactions FOR DELETE TO authenticated USING (public.current_shop_role(shop_id) = 'admin');

CREATE POLICY redemptions_select_member ON public.redemptions FOR SELECT TO authenticated USING (public.is_shop_member(shop_id));
CREATE POLICY redemptions_insert_admin ON public.redemptions FOR INSERT TO authenticated WITH CHECK (public.current_shop_role(shop_id) = 'admin' AND redeemed_by = (SELECT auth.uid()));
CREATE POLICY redemptions_update_admin ON public.redemptions FOR UPDATE TO authenticated USING (public.current_shop_role(shop_id) = 'admin') WITH CHECK (public.current_shop_role(shop_id) = 'admin');
CREATE POLICY redemptions_delete_admin ON public.redemptions FOR DELETE TO authenticated USING (public.current_shop_role(shop_id) = 'admin');

CREATE POLICY expenses_select_member ON public.expenses FOR SELECT TO authenticated USING (public.is_shop_member(shop_id));
CREATE POLICY expenses_write_admin ON public.expenses FOR ALL TO authenticated USING (public.current_shop_role(shop_id) = 'admin') WITH CHECK (public.current_shop_role(shop_id) = 'admin' AND created_by = (SELECT auth.uid()));

CREATE POLICY settings_select_member ON public.shop_settings FOR SELECT TO authenticated USING (public.is_shop_member(shop_id));
CREATE POLICY settings_write_admin ON public.shop_settings FOR ALL TO authenticated USING (public.current_shop_role(shop_id) = 'admin') WITH CHECK (public.current_shop_role(shop_id) = 'admin');

CREATE POLICY audit_select_admin ON public.audit_logs FOR SELECT TO authenticated USING (public.current_shop_role(shop_id) = 'admin');
CREATE POLICY audit_insert_member ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (public.current_shop_role(shop_id) IN ('admin', 'cashier') AND actor_id = (SELECT auth.uid()));

CREATE POLICY sync_select_member ON public.sync_queue FOR SELECT TO authenticated USING (public.is_shop_member(shop_id));
CREATE POLICY sync_write_member ON public.sync_queue FOR INSERT TO authenticated WITH CHECK (public.current_shop_role(shop_id) IN ('admin', 'cashier'));
CREATE POLICY sync_update_member ON public.sync_queue FOR UPDATE TO authenticated USING (public.current_shop_role(shop_id) IN ('admin', 'cashier')) WITH CHECK (public.current_shop_role(shop_id) IN ('admin', 'cashier'));

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, UPDATE ON public.users TO authenticated;
GRANT SELECT, UPDATE ON public.shops TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shop_memberships TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pawn_tickets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pawn_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.interest_transactions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.redemptions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.shop_settings TO authenticated;
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.sync_queue TO authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_shop(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_payment(
  UUID, UUID, TEXT, UUID, BIGINT, BIGINT, BIGINT,
  public.payment_method, TIMESTAMPTZ, UUID, BOOLEAN
) TO authenticated;
REVOKE INSERT ON public.payments FROM authenticated;
