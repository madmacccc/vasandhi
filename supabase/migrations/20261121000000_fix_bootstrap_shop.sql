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

  INSERT INTO public.shops (name, owner_id)
  VALUES (trim(shop_name), auth.uid())
  RETURNING id INTO new_shop_id;
  INSERT INTO public.shop_memberships (shop_id, user_id, role)
  VALUES (new_shop_id, auth.uid(), 'admin');
  INSERT INTO public.shop_settings (shop_id, updated_by)
  VALUES (new_shop_id, auth.uid());
  RETURN new_shop_id;
END
$$;
