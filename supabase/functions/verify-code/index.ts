// supabase/functions/verify-code/index.ts

const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // Keep this for now, or 'http://localhost:8080'
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
};

const codestralApiUrl = Deno.env.get("CODESTRAL_API_URL");
const codestralApiKey = Deno.env.get("CODESTRAL_API_KEY");

Deno.serve(async (req: Request) => {
  // 1. Handle OPTIONS preflight request FIRST
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const requestBody = await req.json();
    const { code, problem, language } = requestBody;

    if (!codestralApiUrl || !codestralApiKey) {
      throw new Error("Codestral environment variables are not set for the Edge Function");
    }

    // --- CRITICAL CHANGE: Mistral Chat API Payload ---
    const prompt = `You are a code verification engine. Your task is to evaluate the provided code against a problem statement and return ONLY 'CORRECT' or 'INCORRECT'. Do not add any explanation, markdown, or commentary.

Problem Statement: "${problem}"
Language: ${language}
Code to evaluate:
\`\`\`${language}
${code}
\`\`\`
Answer:`;

    const codestralPayload = {
      model: "codestral-latest", // Use the latest model
      messages: [{
        role: "user",
        content: prompt,
      }],
      // Ensure the model output is concise
      max_tokens: 10, 
      temperature: 0.0, // Set to 0.0 for deterministic code verification
    };
    // ------------------------------------------------

    const response = await fetch(codestralApiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${codestralApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(codestralPayload),
    });

    if (!response.ok) {
        // Log the error for debugging
        const errorText = await response.text();
        console.error("Codestral API Error Response:", errorText);
        throw new Error(`Codestral API failed with status ${response.status}`);
    }

    const result = await response.json();
    
    // --- CRITICAL CHANGE: Extract and Parse Result ---
    const modelResponseText = result.choices[0]?.message?.content?.trim().toUpperCase() || "";
    
    console.log("Model Raw Response Text:", modelResponseText); // Check this in your logs!

    // Assume verification is correct only if the model's final output is "CORRECT"
    const isCorrect = modelResponseText === 'CORRECT';

    // ------------------------------------------------

    return new Response(JSON.stringify({ is_correct: isCorrect }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});