// Import the existing Supabase client
import { supabase } from "./supabase"; 

// The environment variables for Codestral are no longer needed on the frontend
// and can be removed, as the Edge Function will use its own secrets.

export async function verifyCode(code: string, problem: string, language: string): Promise<boolean> {
    // Invoke the deployed Edge Function named 'verify-code'
    const { data, error } = await supabase.functions.invoke('verify-code', {
        method: 'POST',
        body: { code, problem, language },
    });

    if (error) {
      // Re-throw the error from the Edge Function
        throw new Error(`Code verification failed: ${error.message}`);
    }
    
    // The Edge Function returns a body with { is_correct: boolean }
    const result = data as { is_correct: boolean };
    return result.is_correct;
}