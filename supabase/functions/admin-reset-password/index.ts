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

    // Service role. Used for the authorisation check below as well as the
    // reset itself, because a caller cannot be trusted to report their own
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
        JSON.stringify({ error: "Only leads can reset passwords" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
    const callerTeam = who.team;

    // Parse request body. newEmail is optional and is how a team gets a new
    // coach: the address IS the login, so it has to move with the person or
    // the new coach cannot get in and the old one still can.
    const { userId, newPassword, newEmail } = await req.json();

    if (!userId || (!newPassword && !newEmail)) {
      return new Response(
        JSON.stringify({ error: "userId and one of newPassword or newEmail are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // The reach, enforced: a team's controller resets only their own team's
    // members, and only a senior lead resets another lead's or a team's login.
    const refusal = await refuseTarget(supabaseAdmin, who, userId, "reset passwords for");
    if (refusal) {
      return new Response(JSON.stringify({ error: refusal }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (callerTeam) {
      // Moving a login to a new address is how a team changes coach. That
      // stays with our leads: a coach must not be able to reassign the
      // account they are signed in as.
      if (newEmail) {
        return new Response(
          JSON.stringify({ error: "Only leads can change a login email" }),
          {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    if (newPassword && newPassword.length < 6) {
      return new Response(
        JSON.stringify({
          error: "Password must be at least 6 characters",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Whichever was asked for. Both go through the same call, so changing a
    // team's coach and resetting their password are one round trip when both
    // are needed.
    const changes: Record<string, unknown> = {};
    if (newPassword) changes.password = newPassword;
    if (newEmail) {
      changes.email = String(newEmail).trim().toLowerCase();
      // Admin-set, so there is nobody to click a confirmation link.
      changes.email_confirm = true;
    }

    const { error: resetError } =
      await supabaseAdmin.auth.admin.updateUserById(userId, changes);

    if (resetError) {
      return new Response(JSON.stringify({ error: resetError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Force password change on next login
    await supabaseAdmin
      .from("profiles")
      .update({ must_change_password: !!newPassword })
      .eq("id", userId);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
