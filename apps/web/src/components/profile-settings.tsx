"use client";
import { useEffect, useState, type FormEvent } from "react";
import { request } from "../lib/api";
import { type Profile } from "../lib/preferences";
import { useAuth } from "./auth-provider";
import { SiteHeader } from "./site-header";

export function ProfileSettings() {
  const { updateProfile } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState(""); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => { let active = true; void request<Profile>("/me").then((value) => { if (active) setProfile(value); }).catch((failure: Error) => { if (active) setError(failure.message); }); return () => { active = false; }; }, []);
  async function save(event: FormEvent) {
    event.preventDefault(); if (!profile || busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const value = await request<Profile>("/me", "PATCH", { display_name: profile.display_name, time_zone: profile.time_zone, currency: "INR" });
      setProfile(value); updateProfile(value); setMessage("Your settings are saved.");
    } catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  }
  return <><SiteHeader current="settings" /><main className="auth-card" id="main-content"><h1>Your settings</h1>
    {profile ? <form onSubmit={save}>
      <div className="field"><label htmlFor="display-name">Display name</label><input id="display-name" value={profile.display_name} maxLength={100} onChange={(event) => setProfile({ ...profile, display_name: event.target.value })} disabled={busy} /></div>
      <div className="field"><label htmlFor="profile-zone">Timezone</label><input id="profile-zone" list="time-zones" required value={profile.time_zone} onChange={(event) => setProfile({ ...profile, time_zone: event.target.value })} disabled={busy} /><datalist id="time-zones">{["Asia/Kolkata", "UTC", "America/New_York", "America/Los_Angeles", "Europe/London", "Asia/Singapore"].map((zone) => <option key={zone} value={zone} />)}</datalist><p className="field-hint">Use an IANA timezone, such as Asia/Kolkata. Applies to new entries and reports; saved expense dates and recurring schedules stay unchanged.</p></div>
      <div className="field"><label htmlFor="profile-currency">Default currency</label><select id="profile-currency" value="INR" disabled><option value="INR">INR — Indian rupee</option></select><p className="field-hint">KharCha currently supports INR.</p></div>
      <button className="button primary" disabled={busy}>{busy ? "Saving…" : "Save settings"}</button><p className="field-hint">Account ID: {profile.id}</p>
    </form> : !error && <p role="status">Loading settings…</p>}
    {error && <p role="alert" className="error-box">{error}</p>}{message && <p role="status" className="saved-notice">{message}</p>}
  </main></>;
}
