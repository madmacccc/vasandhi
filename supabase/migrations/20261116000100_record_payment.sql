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

GRANT EXECUTE ON FUNCTION public.record_payment(
  UUID, UUID, TEXT, UUID, BIGINT, BIGINT, BIGINT,
  public.payment_method, TIMESTAMPTZ, UUID, BOOLEAN
) TO authenticated;

REVOKE INSERT ON public.payments FROM authenticated;
