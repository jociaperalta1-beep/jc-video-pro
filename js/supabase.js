/* ============================================================
   JC VIDEO PRO — Conexión oficial de Supabase
   ============================================================ */

const SUPABASE_URL = "https://supabase.co";
const SUPABASE_KEY = "sb_publishable_G7QGUn6nlRPWsvuBn6rgPA_6ix3acAL";

export let supabase = null;

try {
  if (window.supabase && typeof window.supabase.createClient === "function") {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  }
} catch (err) {
  console.warn("[JCVP Supabase] Init error:", err);
}

export async function getCurrentUser() {
  if (!supabase) return null;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.user || null;
  } catch (err) {
    console.warn("[JCVP Supabase] getSession error:", err);
    return null;
  }
}

export async function signInWithEmail(email, password) {
  if (!supabase) throw new Error("Supabase no inicializado");
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  if (data?.user) await upsertProfile(data.user);
  return data;
}

export async function signUpWithEmail(email, password) {
  if (!supabase) throw new Error("Supabase no inicializado");
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  if (data?.user) await upsertProfile(data.user);
  return data;
}

export async function signInWithGoogle() {
  if (!supabase) throw new Error("Supabase no inicializado");
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.href }
  });
  if (error) throw error;
  return data;
}

export async function resetPassword(email) {
  if (!supabase) throw new Error("Supabase no inicializado");
  const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + window.location.pathname,
  });
  if (error) throw error;
  return data;
}

export async function signOutUser() {
  if (!supabase) return;
  await supabase.auth.signOut();
}

export async function upsertProfile(user) {
  if (!supabase || !user) return;
  try {
    await supabase.from("profiles").upsert({
      id: user.id,
      email: user.email,
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" });
  } catch (err) {
    console.warn("[JCVP Supabase] upsertProfile:", err);
  }
}

export async function sendSupportTicket(email, message) {
  const ticketData = {
    user_email: email || "soporte@jcads.net",
    message,
    status: "pending",
    created_at: new Date().toISOString(),
  };
  if (!supabase) {
    const local = JSON.parse(localStorage.getItem("jcvp.support_tickets") || "[]");
    local.push(ticketData);
    localStorage.setItem("jcvp.support_tickets", JSON.stringify(local));
    return true;
  }
  try {
    const { data, error } = await supabase.from("support_tickets").insert([ticketData]);
    if (error) throw error;
    return data;
  } catch (err) {
    console.warn("[JCVP Support] Table insert failed, storing locally:", err);
    const local = JSON.parse(localStorage.getItem("jcvp.support_tickets") || "[]");
    local.push(ticketData);
    localStorage.setItem("jcvp.support_tickets", JSON.stringify(local));
    return true;
  }
}

export async function getAdminData() {
  if (!supabase) {
    return { users: [], payments: [], tickets: JSON.parse(localStorage.getItem("jcvp.support_tickets") || "[]") };
  }
  try {
    const [usersRes, paymentsRes, ticketsRes] = await Promise.all([
      supabase.from("profiles").select("*"),
      supabase.from("payments").select("*"),
      supabase.from("support_tickets").select("*"),
    ]);
    return {
      users: usersRes.data || [],
      payments: paymentsRes.data || [],
      tickets: ticketsRes.data || JSON.parse(localStorage.getItem("jcvp.support_tickets") || "[]"),
    };
  } catch (err) {
    console.warn("[JCVP Admin] getAdminData error:", err);
    return { users: [], payments: [], tickets: JSON.parse(localStorage.getItem("jcvp.support_tickets") || "[]") };
  }
}
