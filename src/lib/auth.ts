import { supabase } from "./supabase";

export interface LoginRequest {
  email: string;
  password: string;
  username: string; // stored in profiles
}

export async function login(request: LoginRequest): Promise<{ id: string; name: string }> {
  if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
    throw new Error("Supabase env variables are not set");
  }

  // Sign in with email/password only (no automatic sign up)
  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email: request.email,
    password: request.password,
  });

  if (signInError || !signInData?.user?.id) {
    throw new Error("Invalid email or password");
  }

  const userId = signInData.user.id;

  // Upsert username/email to profiles table; surface errors for visibility
  const { error: profileError } = await supabase
    .from("profiles")
    .upsert({ id: userId, username: request.username, email: request.email });
  if (profileError) {
    throw new Error(`Failed to save profile: ${profileError.message}`);
  }

  return { id: userId, name: request.username };
}

export async function logout(): Promise<void> {
  await supabase.auth.signOut();
}

export interface SignUpRequest {
  email: string;
  password: string;
  username: string;
}

export interface SignUpResult {
  userId: string | null;
  requiresEmailVerification: boolean;
}

export async function signUp(request: SignUpRequest): Promise<SignUpResult> {
  if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
    throw new Error("Supabase env variables are not set");
  }

  // Check if username already exists
  try {
    const { data: existing, error: checkError } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", request.username)
      .limit(1)
      .maybeSingle();
    if (checkError) {
      // ignore if table missing; otherwise bubble
      if (checkError.code !== 'PGRST116') {
        throw checkError;
      }
    }
    if (existing) {
      throw new Error("Username already taken");
    }
  } catch (e) {
    if (e instanceof Error && e.message === "Username already taken") {
      throw e;
    }
    // proceed if profiles table not present
  }

  const { data, error } = await supabase.auth.signUp({
    email: request.email,
    password: request.password,
    options: {
      data: { username: request.username },
      // No email verification flow; ensure project setting disables confirmations
    },
  });
  if (error) {
    throw new Error(error.message);
  }

  const userId = data.user?.id ?? null;

  // If session not present (e.g., confirmations on), attempt immediate sign-in
  if (!data.session) {
    const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
      email: request.email,
      password: request.password,
    });
    if (signInErr) {
      throw new Error("Project requires email confirmation. Disable confirmations to allow instant sign-in.");
    }
  }

  // Persist profile immediately when possible
  if (userId) {
    const { error: profileError } = await supabase
      .from("profiles")
      .upsert({ id: userId, username: request.username, email: request.email });
    if (profileError) {
      throw new Error(`Failed to save profile: ${profileError.message}`);
    }
  }

  return { userId, requiresEmailVerification: false };
}


