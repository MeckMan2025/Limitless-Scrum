// Who may use the account tools (admin-create-user, admin-reset-password,
// admin-delete-user), and on whom. One copy, imported by all three, so the
// three can't drift apart again.
//
// Everything here is read with the service role and keyed on the verified
// caller id: a caller does not get to report their own permissions.
//
//   * A Radical lead (a lead-level tag, or the legacy role 'lead') runs
//     accounts across the app. Radical only: a sister team's login can carry
//     a Coach tag too, and must not get Radical's reach from it.
//   * Of those, only the senior ones (Co-Founder, Mentor, Coach, role 'lead')
//     may act on another lead's account or a team login, or create a 'lead'.
//     A student lead resets a teammate's password; they don't get to reset a
//     mentor's and sign in as them.
//   * A sister team's controller (team_accounts, full_access) acts on their
//     own team's members and nobody else.

// Must match ACCOUNT_ADMIN_TAGS in src/hooks/usePermissions.js.
export const ADMIN_TAGS = [
  "Co-Founder", "Mentor", "Coach", "Team Lead", "Business Lead", "Technical Lead",
  // Co-leads do the same job as the lead they share it with.
  "Co-Project Manager", "Co-Business Lead", "Co-Technical Lead", "Co-Programming Lead",
];
const SENIOR_TAGS = ["Co-Founder", "Mentor", "Coach"];

// NULL, '' and '7196' all mean Radical.
export const teamKey = (t: unknown): string | null => {
  const s = String(t ?? "").trim();
  return s === "" || s === "7196" ? null : s;
};

const isTeamLogin = (tags: string[], email: string | undefined) =>
  tags.includes("Team") || /^team\d+@teams\.radical$/i.test(email || "");

export type AdminCaller = {
  id: string;
  isLead: boolean; // Radical lead: any account
  isSenior: boolean; // may also act on leads and team logins
  team: string | null; // sister-team controller: this team's members only
};

// null: not allowed to use the account tools at all.
export async function authorizeAdmin(
  admin: any,
  caller: { id: string; email?: string },
): Promise<AdminCaller | null> {
  const { data: profile } = await admin
    .from("profiles")
    .select("function_tags, team_number, role")
    .eq("id", caller.id)
    .maybeSingle();
  const tags: string[] = profile?.function_tags || [];
  const onRadical = !!profile && teamKey(profile.team_number) === null && !isTeamLogin(tags, caller.email);
  const legacyLead = profile?.role === "lead";
  const isLead = onRadical && (legacyLead || tags.some((t) => ADMIN_TAGS.includes(t)));
  const isSenior = onRadical && (legacyLead || tags.some((t) => SENIOR_TAGS.includes(t)));
  if (isLead) return { id: caller.id, isLead, isSenior, team: null };

  const { data: controlled } = await admin
    .from("team_accounts")
    .select("team_number, full_access")
    .eq("user_id", caller.id)
    .limit(1);
  const row = controlled?.[0];
  const team = row?.full_access ? teamKey(row.team_number) : null;
  if (team) return { id: caller.id, isLead: false, isSenior: false, team };
  return null;
}

// Why this caller may not act on this account, or null if they may.
export async function refuseTarget(
  admin: any,
  who: AdminCaller,
  userId: string,
  verb: string,
): Promise<string | null> {
  const { data: target } = await admin
    .from("profiles")
    .select("team_number, function_tags, role")
    .eq("id", userId)
    .maybeSingle();
  if (who.team) {
    // Checked before anything is done: without it one team's coach could
    // act on any account in the app, ours included.
    if (!target || teamKey(target.team_number) !== who.team) {
      return `You can only ${verb} your own team's members`;
    }
    return null;
  }
  if (who.isSenior) return null;
  const tags: string[] = target?.function_tags || [];
  const { data: controls } = await admin
    .from("team_accounts").select("user_id").eq("user_id", userId).limit(1);
  const isProtected = target?.role === "lead" || tags.includes("Team")
    || tags.some((t) => ADMIN_TAGS.includes(t)) || (controls?.length ?? 0) > 0;
  return isProtected
    ? `Only a mentor, coach or co-founder can ${verb} a lead's or a team's account`
    : null;
}
