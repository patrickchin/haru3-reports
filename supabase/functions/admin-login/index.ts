import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  corsHeaders,
  errorResponse,
  jsonResponse,
  signInInternalAdmin,
} from "../_shared/admin.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse(405, "Method not allowed");

  const body = await req.json().catch(() => null);
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!username || !password) {
    return errorResponse(400, "Username and password are required");
  }

  const result = await signInInternalAdmin(username, password);
  if (!result) {
    return errorResponse(401, "Invalid admin credentials");
  }

  return jsonResponse({ data: result });
});
