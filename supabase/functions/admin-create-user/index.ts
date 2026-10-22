import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authorizeAdmin, refuseTarget } from "../_shared/adminAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify caller is authenticated
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create a client with the caller's JWT to verify identity
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Service role. Used for the authorisation check below as well as the work
    // itself, because a caller cannot be trusted to report their own
    // permissions and RLS would hide the rows that settle it.
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const {
      data: { user: caller },
      error: authError,
    } = await supabaseUser.auth.getUser();

    if (authError || !caller) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Who may, and with what reach (_shared/adminAuth.ts).
    const who = await authorizeAdmin(supabaseAdmin, caller);
    if (!who) {
      return new Response(
        JSON.stringify({ error: "Only leads can create accounts" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
    const callerTeam = who.team;

    // Parse request body
    const { email, password, displayName, role } = await req.json();

    if (!email || !password || !displayName) {
      return new Response(
        JSON.stringify({
          error: "email, password, and displayName are required",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (password.length < 6) {
      return new Response(
        JSON.stringify({ error: "Password must be at least 6 characters" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }


    // Create the user account (email_confirm: true skips email verification)
    const { data: newUser, error: createError } =
      await supabaseAdmin.auth.admin.createUser({
        email: email.toLowerCase().trim(),
        password,
        email_confirm: true,
      });

    if (createError) {
      return new Response(JSON.stringify({ error: createError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create profile row with must_change_password flag
    const authorityTier = role === 'guest' ? 'guest' : 'teammate';
    const functionTags = role === 'guest' ? ['Guest'] : [];
    const { error: profileInsertError } = await supabaseAdmin
      .from("profiles")
      .insert({
        id: newUser.user.id,
        display_name: displayName.trim(),
        // 'lead' makes a full lead (the database reads it), so only a senior
        // lead may hand it out. Anything else is an ordinary label.
        role: role === "lead" && !who.isSenior ? "member" : (role || "member"),
        authority_tier: authorityTier,
        function_tags: functionTags,
        must_change_password: true,
        // Created by a team's own coach, so it is their member, not ours.
        // A lead creating from our side leaves this null, which means us.
        ...(callerTeam ? { team_number: callerTeam } : {}),
      });

    if (profileInsertError) {
      return new Response(
        JSON.stringify({ error: profileInsertError.message }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        userId: newUser.user.id,
        displayName: displayName.trim(),
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
