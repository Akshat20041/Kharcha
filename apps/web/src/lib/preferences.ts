export type Profile = { id: string; display_name: string; time_zone: string; currency: "INR" };
let profile: Profile | null = null;
export function setPreferences(value: Profile | null) { profile = value; }
export function preferredTimeZone() { return profile?.time_zone ?? Intl.DateTimeFormat().resolvedOptions().timeZone; }
