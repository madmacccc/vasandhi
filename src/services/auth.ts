import type { Session } from "@supabase/supabase-js";
import { requireSupabase } from "./supabase";

export async function getSession(): Promise<Session | null> {
  const { data, error } = await requireSupabase().auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await requireSupabase().auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signUp(email: string, password: string): Promise<boolean> {
  const { data, error } = await requireSupabase().auth.signUp({ email, password });
  if (error) throw error;
  return Boolean(data.session);
}

export async function signOut(): Promise<void> {
  const { error } = await requireSupabase().auth.signOut();
  if (error) throw error;
}

export function subscribeToAuthChanges(onChange: (session: Session | null) => void) {
  const { data } = requireSupabase().auth.onAuthStateChange((_event, session) => onChange(session));
  return () => data.subscription.unsubscribe();
}

export async function resolveShop(userId: string): Promise<string> {
  const client = requireSupabase();
  const { data: membership, error } = await client
    .from("shop_memberships")
    .select("shop_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (membership) return membership.shop_id;

  const { data: shopId, error: bootstrapError } = await client.rpc("bootstrap_shop", {
    shop_name: "Sri Vasanthi Jewellery Pawn Broker",
  });
  if (bootstrapError) throw bootstrapError;
  if (typeof shopId !== "string") throw new Error("Supabase did not return a shop ID.");
  return shopId;
}
