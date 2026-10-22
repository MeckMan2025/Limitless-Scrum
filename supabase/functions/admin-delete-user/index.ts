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
        JSON.stringify({ error: "Only leads can delete accounts" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
    const callerTeam = who.team;

    // Parse request body
    const { userId } = await req.json();

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "userId is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Prevent leads from deleting themselves
    if (userId === caller.id) {
      return new Response(
        JSON.stringify({ error: "You cannot delete your own account" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }


    // The reach, enforced before anything is destroyed: a team's controller
    // deletes only their own team's members, and only a senior lead deletes
    // another lead's or a team's login.
    const refusal = await refuseTarget(supabaseAdmin, who, userId, "delete");
    if (refusal) {
      return new Response(JSON.stringify({ error: refusal }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Look up the email before anything is destroyed: the caller uses it to
    // clear the person off the signup whitelist.
    let deletedEmail = null;
    try {
      const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId);
      deletedEmail = authUser?.user?.email ?? null;
    } catch (_) { /* not fatal */ }

    // Delete the AUTH USER first. Doing the profile first meant a failed auth
    // delete left a login with no profile, an account nobody could see but
    // that still blocked re-registration. Order it so the irreversible,
    // failure-prone step happens while the profile is still there to retry.
    const { error: deleteError } =
      await supabaseAdmin.auth.admin.deleteUser(userId);

    if (deleteError) {
      return new Response(JSON.stringify({ error: deleteError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: profileDeleteError } = await supabaseAdmin
      .from("profiles")
      .delete()
      .eq("id", userId);

    if (profileDeleteError) {
      return new Response(
        JSON.stringify({ error: profileDeleteError.message }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(JSON.stringify({ success: true, email: deletedEmail }), {
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
