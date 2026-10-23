"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useAuth } from "@/providers/AppProviders";
import { getApiBaseUrl } from "@/lib/api-url";

type AdminUser = {
  user_id: string;
  display_name: string | null;
  email: string;
  is_active: boolean;
  is_admin: boolean;
  created_at: string;
  temporary_password?: string | null;
};

async function adminRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const apiBaseUrl = await getApiBaseUrl();
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init.headers },
  });

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = await response.json();
      if (typeof body.detail === "string") message = body.detail;
      else if (Array.isArray(body.detail)) message = body.detail.map((item: { msg?: string }) => item.msg).filter(Boolean).join("; ") || message;
    } catch {
      // Keep the HTTP status message when the response isn't JSON.
    }
    throw new Error(message);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function initials(name: string | null, email: string) {
  const source = name?.trim() || email;
  return source.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join("");
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export default function AdminUsersPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [newRole, setNewRole] = useState<"user" | "admin">("user");
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [creating, setCreating] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [roleTarget, setRoleTarget] = useState<AdminUser | null>(null);
  const [roleValue, setRoleValue] = useState<"user" | "admin">("user");
  const [savingRole, setSavingRole] = useState(false);
  const [resetTarget, setResetTarget] = useState<AdminUser | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resettingPassword, setResettingPassword] = useState(false);
  const [createError, setCreateError] = useState("");
  const [notice, setNotice] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setPageError("");
    try {
      const result = await adminRequest<AdminUser[]>("/api/v1/admin/users");
      setUsers(result);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Couldn't load users.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && user?.is_admin) void loadUsers();
    else if (!authLoading) setLoading(false);
  }, [authLoading, user?.is_admin, loadUsers]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setCreateError("");
    setNotice("");
    try {
      const created = await adminRequest<AdminUser>("/api/v1/admin/users", {
        method: "POST",
        body: JSON.stringify({
          display_name: displayName.trim(),
          email: email.trim(),
          is_admin: newRole === "admin",
          ...(newPassword.trim() ? { password: newPassword } : {}),
        }),
      });
      setDisplayName("");
      setEmail("");
      setNewRole("user");
      setNewPassword("");
      setShowPassword(false);
      setShowCreate(false);
      setNotice(created.temporary_password ? `User created. Temporary password: ${created.temporary_password}` : "User created successfully.");
      await loadUsers();
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Couldn't create user.");
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(target: AdminUser) {
    const nextActive = !target.is_active;
    const action = nextActive ? "activate" : "deactivate";
    if (!nextActive && !window.confirm(`Deactivate ${target.display_name || target.email}? Their active sessions will be revoked.`)) return;
    setUpdatingId(target.user_id);
    setPageError("");
    setNotice("");
    try {
      const updated = await adminRequest<AdminUser>(`/api/v1/admin/users/${target.user_id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: nextActive }),
      });
      setUsers((current) => current.map((item) => item.user_id === updated.user_id ? updated : item));
      setNotice(`${updated.display_name || updated.email} ${action}d successfully.`);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : `Couldn't ${action} user.`);
    } finally {
      setUpdatingId(null);
    }
  }


  function generatePassword() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%*-_";
    const values = new Uint32Array(20);
    window.crypto.getRandomValues(values);
    setNewPassword(Array.from(values, (value) => alphabet[value % alphabet.length]).join(""));
    setShowPassword(true);
  }

  async function saveRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!roleTarget) return;
    setSavingRole(true);
    setPageError("");
    setNotice("");
    try {
      const updated = await adminRequest<AdminUser>(`/api/v1/admin/users/${roleTarget.user_id}/role`, {
        method: "PATCH",
        body: JSON.stringify({ is_admin: roleValue === "admin" }),
      });
      setUsers((current) => current.map((item) => item.user_id === updated.user_id ? updated : item));
      setNotice(`${updated.display_name || updated.email} role updated to ${updated.is_admin ? "Admin" : "User"}.`);
      setRoleTarget(null);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Couldn't update user role.");
    } finally {
      setSavingRole(false);
    }
  }

  async function resetUserPassword(target: AdminUser) {
    if (!window.confirm(`Generate a new password for ${target.display_name || target.email}? Their existing sessions will be revoked.`)) return;
    setOpenMenuId(null);
    setResetTarget(target);
    setResetPassword("");
    setResettingPassword(true);
    setPageError("");
    setNotice("");
    try {
      const result = await adminRequest<{ user_id: string; email: string; temporary_password: string }>(`/api/v1/admin/users/${target.user_id}/reset-password`, { method: "POST" });
      setResetPassword(result.temporary_password);
    } catch (error) {
      setResetTarget(null);
      setPageError(error instanceof Error ? error.message : "Couldn't reset password.");
    } finally {
      setResettingPassword(false);
    }
  }

  if (authLoading) {
    return <main className="admin-users-shell"><div className="admin-users-loading"><span className="admin-spinner" />Checking your access…</div><AdminUsersStyles /></main>;
  }

  if (!user?.is_admin) {
    return <main className="admin-users-shell"><div className="admin-users-denied"><div className="admin-lock">⌁</div><h1>Admin access required</h1><p>This page is only available to LISA administrators.</p><a href="/app">Return to LISA</a></div><AdminUsersStyles /></main>;
  }

  const filteredUsers = users.filter((item) => `${item.display_name ?? ""} ${item.email}`.toLowerCase().includes(search.toLowerCase().trim()));
  const activeCount = users.filter((item) => item.is_active).length;
  const adminCount = users.filter((item) => item.is_admin).length;

  return (
    <main className="admin-users-shell">
      <aside className="admin-rail">
        <a className="admin-brand" href="/app" aria-label="Back to LISA"><span className="admin-brand-mark">L</span><span>LISA</span></a>
        <div className="admin-rail-label">WORKSPACE</div>
        <a className="admin-rail-link" href="/app"><span className="admin-nav-icon">⌂</span>Chat</a>
        <div className="admin-rail-label admin-rail-label-spaced">ADMINISTRATION</div>
        <a className="admin-rail-link admin-rail-link-active" href="/app/admin/users"><span className="admin-nav-icon">♙</span>Manage users</a>
        <div className="admin-rail-bottom"><div className="admin-avatar">{initials(user.display_name, user.email)}</div><div className="admin-rail-user"><strong>{user.display_name || "LISA Admin"}</strong><span>{user.email}</span></div></div>
      </aside>

      <section className="admin-users-main">
        <header className="admin-topbar"><div><span className="admin-breadcrumb">LISA <span>/</span> Administration <span>/</span></span><strong>Manage users</strong></div><a className="admin-back-link" href="/app">← Back to chat</a></header>
        <div className="admin-content">
          <div className="admin-page-heading"><div><div className="admin-eyebrow">ACCESS MANAGEMENT</div><h1>Manage users</h1><p>Create accounts and manage access to the LISA workspace.</p></div><button className="admin-primary-button" onClick={() => { setShowCreate(true); setCreateError(""); }}><span>＋</span> Create user</button></div>

          <div className="admin-stat-grid">
            <div className="admin-stat-card"><span className="admin-stat-icon">♙</span><div><span>Total users</span><strong>{users.length}</strong></div></div>
            <div className="admin-stat-card"><span className="admin-stat-icon admin-stat-green">✓</span><div><span>Active accounts</span><strong>{activeCount}</strong></div></div>
            <div className="admin-stat-card"><span className="admin-stat-icon admin-stat-purple">◇</span><div><span>Administrators</span><strong>{adminCount}</strong></div></div>
          </div>

          {notice && <div className="admin-alert admin-alert-success" role="status"><span>✓</span><p>{notice}</p><button aria-label="Dismiss notification" onClick={() => setNotice("")}>×</button></div>}
          {pageError && <div className="admin-alert admin-alert-error" role="alert"><span>!</span><p>{pageError}</p><button onClick={() => void loadUsers()}>Retry</button></div>}

          <section className="admin-table-card">
            <div className="admin-table-heading"><div><h2>Workspace accounts</h2><p>View account details and control sign-in access.</p></div><label className="admin-search"><span>⌕</span><input aria-label="Search users" placeholder="Search name or email…" value={search} onChange={(event) => setSearch(event.target.value)} /><kbd>⌘ K</kbd></label></div>
            <div className="admin-table-wrap"><table className="admin-users-table"><thead><tr><th>USER</th><th>ROLE</th><th>STATUS</th><th>CREATED</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>
              {loading ? <tr><td colSpan={5}><div className="admin-table-state"><span className="admin-spinner" />Loading workspace users…</div></td></tr> : filteredUsers.length === 0 ? <tr><td colSpan={5}><div className="admin-empty"><div>♙</div><strong>{search ? "No matching users" : "No users yet"}</strong><span>{search ? "Try another name or email address." : "Create the first workspace account to get started."}</span>{!search && <button className="admin-secondary-button" onClick={() => setShowCreate(true)}>Create user</button>}</div></td></tr> : filteredUsers.map((item) => <tr key={item.user_id}>
                <td><div className="admin-user-cell"><div className={`admin-avatar ${item.is_admin ? "admin-avatar-admin" : ""}`}>{initials(item.display_name, item.email)}</div><div className="admin-user-copy"><strong>{item.display_name || "Unnamed user"}{item.user_id === user.id && <span className="admin-you-tag">YOU</span>}</strong><span>{item.email}</span></div></div></td>
                <td><span className={`admin-role-pill ${item.is_admin ? "admin-role-admin" : ""}`}><span />{item.is_admin ? "Administrator" : "Member"}</span></td>
                <td><span className={`admin-status-pill ${item.is_active ? "admin-status-active" : "admin-status-inactive"}`}><span />{item.is_active ? "Active" : "Inactive"}</span></td>
                <td className="admin-date-cell">{formatDate(item.created_at)}</td>
                <td className="admin-actions-cell"><div className="admin-row-actions"><button className={`admin-action-button ${item.is_active ? "admin-action-deactivate" : "admin-action-activate"}`} disabled={updatingId === item.user_id || item.user_id === user.id} title={item.user_id === user.id ? "You cannot deactivate your own account" : item.is_active ? "Deactivate account" : "Activate account"} onClick={() => void toggleActive(item)}>{updatingId === item.user_id ? <span className="admin-mini-spinner" /> : item.is_active ? "Deactivate" : "Activate"}</button><div className="admin-user-menu-wrap"><button className="admin-pencil-button" aria-label={`Manage ${item.display_name || item.email}`} aria-expanded={openMenuId === item.user_id} onClick={() => setOpenMenuId((current) => current === item.user_id ? null : item.user_id)} title="More user actions">✎</button>{openMenuId === item.user_id && <div className="admin-user-menu"><button onClick={() => { setRoleTarget(item); setRoleValue(item.is_admin ? "admin" : "user"); setOpenMenuId(null); }}>Edit role</button><button className="admin-menu-danger" onClick={() => void resetUserPassword(item)}>Reset password</button></div>}</div></div></td>
              </tr>)}
            </tbody></table></div>
            <div className="admin-table-footer"><span>{loading ? "Loading…" : `Showing ${filteredUsers.length} of ${users.length} ${users.length === 1 ? "user" : "users"}`}</span><button onClick={() => void loadUsers()} disabled={loading}>↻ Refresh</button></div>
          </section>
          <p className="admin-security-note"><span>♧</span> Deactivating an account revokes its active sessions. Only an administrator can access this page.</p>
        </div>
      </section>

      {showCreate && <div className="admin-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !creating) setShowCreate(false); }}><section className="admin-create-modal" role="dialog" aria-modal="true" aria-labelledby="create-user-title"><button className="admin-modal-close" aria-label="Close dialog" disabled={creating} onClick={() => setShowCreate(false)}>×</button><div className="admin-modal-icon">＋</div><div className="admin-modal-eyebrow">NEW ACCOUNT</div><h2 id="create-user-title">Create a user</h2><p className="admin-modal-description">Add someone to the LISA workspace and choose their access level.</p><form onSubmit={handleCreate}><label className="admin-form-label" htmlFor="new-user-name">Display name</label><input id="new-user-name" autoFocus required minLength={1} maxLength={255} placeholder="e.g. Alex Morgan" value={displayName} onChange={(event) => setDisplayName(event.target.value)} /><label className="admin-form-label" htmlFor="new-user-email">Email address</label><input id="new-user-email" type="email" required placeholder="alex@company.com" value={email} onChange={(event) => setEmail(event.target.value)} /><label className="admin-form-label" htmlFor="new-user-role">Role</label><select id="new-user-role" className="admin-form-select" value={newRole} onChange={(event) => setNewRole(event.target.value as "user" | "admin")}><option value="user">User</option><option value="admin">Admin</option></select><label className="admin-form-label" htmlFor="new-user-password">Password <span className="admin-optional-label">(optional)</span></label><div className="admin-password-row"><input id="new-user-password" type={showPassword ? "text" : "password"} minLength={12} maxLength={128} placeholder="Generate a temporary password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /><button type="button" className="admin-generate-button" onClick={generatePassword}>Generate password</button></div>{createError && <div className="admin-form-error" role="alert">{createError}</div>}<div className="admin-modal-note"><span>ⓘ</span><p>The generated password is shown after creation. Share it securely with the new user.</p></div><div className="admin-modal-actions"><button type="button" className="admin-secondary-button" disabled={creating} onClick={() => setShowCreate(false)}>Cancel</button><button type="submit" className="admin-primary-button" disabled={creating || !displayName.trim() || !email.trim()}>{creating ? <><span className="admin-mini-spinner" /> Creating…</> : "Create user"}</button></div></form></section></div>}

      {roleTarget && <div className="admin-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !savingRole) setRoleTarget(null); }}><section className="admin-create-modal" role="dialog" aria-modal="true" aria-labelledby="edit-role-title"><button className="admin-modal-close" aria-label="Close dialog" disabled={savingRole} onClick={() => setRoleTarget(null)}>×</button><div className="admin-modal-icon">✎</div><div className="admin-modal-eyebrow">ACCESS CONTROL</div><h2 id="edit-role-title">Edit role</h2><p className="admin-modal-description">Change the workspace role for <strong>{roleTarget.display_name || roleTarget.email}</strong>.</p><form onSubmit={saveRole}><label className="admin-form-label" htmlFor="edit-user-role">Role</label><select id="edit-user-role" className="admin-form-select" value={roleValue} onChange={(event) => setRoleValue(event.target.value as "user" | "admin")}><option value="user">User</option><option value="admin">Admin</option></select>{roleTarget.user_id === user.id && roleValue === "user" && <div className="admin-form-error" role="alert">You cannot remove your own admin role.</div>}<div className="admin-modal-actions"><button type="button" className="admin-secondary-button" disabled={savingRole} onClick={() => setRoleTarget(null)}>Cancel</button><button type="submit" className="admin-primary-button" disabled={savingRole || (roleTarget.user_id === user.id && roleValue === "user")}>{savingRole ? "Saving…" : "Save role"}</button></div></form></section></div>}

      {resetTarget && <div className="admin-modal-backdrop" role="presentation"><section className="admin-create-modal" role="dialog" aria-modal="true" aria-labelledby="reset-password-title"><button className="admin-modal-close" aria-label="Close dialog" disabled={resettingPassword} onClick={() => { setResetTarget(null); setResetPassword(""); }}>×</button><div className="admin-modal-icon">⌁</div><div className="admin-modal-eyebrow">ACCOUNT SECURITY</div><h2 id="reset-password-title">Reset password</h2><p className="admin-modal-description">{resettingPassword ? `Generating a new password for ${resetTarget.display_name || resetTarget.email}…` : `New temporary password for ${resetTarget.display_name || resetTarget.email}. Copy it now; it will not be shown again.`}</p>{resettingPassword ? <div className="admin-table-state"><span className="admin-spinner" />Generating password…</div> : <><label className="admin-form-label" htmlFor="reset-generated-password">Temporary password</label><div className="admin-password-row"><input id="reset-generated-password" readOnly value={resetPassword} /><button type="button" className="admin-generate-button" onClick={() => { void navigator.clipboard.writeText(resetPassword); setNotice("Temporary password copied to clipboard."); }}>Copy password</button></div><div className="admin-modal-note"><span>ⓘ</span><p>Existing sessions have been revoked. Share this password securely with the user.</p></div></>}<div className="admin-modal-actions"><button type="button" className="admin-primary-button" disabled={resettingPassword} onClick={() => { setResetTarget(null); setResetPassword(""); }}>Done</button></div></section></div>}
      <AdminUsersStyles />
    </main>
  );
}

function AdminUsersStyles() {
  return <style jsx global>{`
    .admin-users-shell{--au-bg:#0b0d10;--au-panel:#101318;--au-panel-2:#14181f;--au-border:rgba(255,255,255,.085);--au-muted:#8c95a4;--au-text:#e9edf4;--au-cyan:#65dce8;min-height:100vh;background:var(--au-bg);color:var(--au-text);font-family:inherit;display:flex;font-size:13px}
    .admin-users-shell *{box-sizing:border-box}.admin-users-shell button,.admin-users-shell input{font:inherit}.admin-users-shell button{cursor:pointer}.admin-users-shell button:disabled{cursor:not-allowed;opacity:.55}.admin-rail{width:246px;flex:0 0 246px;min-height:100vh;border-right:1px solid var(--au-border);padding:25px 15px 16px;display:flex;flex-direction:column;background:#0d0f13}.admin-brand{height:35px;display:flex;align-items:center;gap:10px;padding:0 9px;color:#f3f6fb;text-decoration:none;font-size:17px;font-weight:700;letter-spacing:.04em}.admin-brand-mark{width:27px;height:27px;border-radius:9px;display:grid;place-items:center;background:linear-gradient(140deg,#54dce7,#4e9cf5);color:#081014;font-size:16px;font-weight:800}.admin-rail-label{margin:39px 10px 12px;color:#687181;font-size:10px;letter-spacing:.13em;font-weight:700}.admin-rail-label-spaced{margin-top:29px}.admin-rail-link{display:flex;align-items:center;gap:11px;height:39px;padding:0 11px;border-radius:8px;text-decoration:none;color:#9ca5b3;font-size:12px;transition:background .15s,color .15s}.admin-rail-link:hover{background:rgba(255,255,255,.045);color:#f2f5fa}.admin-rail-link-active{background:rgba(78,190,212,.105);color:#85e4ed;border:1px solid rgba(92,213,227,.12)}.admin-nav-icon{width:17px;text-align:center;font-size:17px}.admin-rail-bottom{display:flex;align-items:center;gap:10px;margin-top:auto;padding:14px 7px 0;border-top:1px solid var(--au-border);min-width:0}.admin-avatar{width:34px;height:34px;flex:0 0 34px;display:grid;place-items:center;border-radius:11px;background:linear-gradient(145deg,#263a4a,#1c2633);border:1px solid rgba(116,184,217,.2);color:#b8e5f0;font-size:11px;font-weight:700}.admin-avatar-admin{background:linear-gradient(145deg,#40335b,#29213e);color:#d9c8ff;border-color:rgba(186,151,255,.2)}.admin-rail-user{display:flex;flex-direction:column;gap:4px;min-width:0}.admin-rail-user strong{font-size:11px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.admin-rail-user span{font-size:10px;color:var(--au-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.admin-users-main{flex:1;min-width:0}.admin-topbar{height:64px;padding:0 36px;border-bottom:1px solid var(--au-border);display:flex;align-items:center;justify-content:space-between;background:rgba(13,15,19,.76)}.admin-topbar>div{display:flex;align-items:center;gap:8px}.admin-topbar strong{font-size:12px;font-weight:600}.admin-breadcrumb{color:#778191;font-size:11px}.admin-breadcrumb span{padding:0 5px;color:#4c5562}.admin-back-link{color:#a6afbd;text-decoration:none;font-size:11px}.admin-back-link:hover{color:white}.admin-content{max-width:1190px;margin:0 auto;padding:42px 38px 36px}.admin-page-heading{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-bottom:29px}.admin-eyebrow,.admin-modal-eyebrow{color:#63d2df;font-size:9px;letter-spacing:.16em;font-weight:700;margin-bottom:9px}.admin-page-heading h1{margin:0;font-size:26px;line-height:1.2;letter-spacing:-.045em;font-weight:650}.admin-page-heading p{margin:10px 0 0;color:#939cab;font-size:12px}.admin-primary-button{height:37px;display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:0 15px;border:1px solid rgba(107,225,235,.32);border-radius:8px;background:linear-gradient(135deg,#67dbe5,#54b9d8);color:#071115;font-weight:700;font-size:11px;white-space:nowrap;box-shadow:0 3px 14px rgba(46,180,207,.08);transition:filter .15s,transform .15s}.admin-primary-button:hover:not(:disabled){filter:brightness(1.08);transform:translateY(-1px)}.admin-primary-button>span{font-size:17px;font-weight:400}.admin-stat-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:13px;margin-bottom:25px}.admin-stat-card{min-height:91px;display:flex;align-items:center;gap:14px;padding:18px 20px;border:1px solid var(--au-border);border-radius:11px;background:linear-gradient(145deg,rgba(22,26,33,.94),rgba(15,18,23,.94))}.admin-stat-icon{width:37px;height:37px;border-radius:10px;display:grid;place-items:center;background:rgba(91,201,220,.1);color:#7bdde7;font-size:18px}.admin-stat-green{background:rgba(66,206,151,.1);color:#62dba9}.admin-stat-purple{background:rgba(175,130,255,.11);color:#c6a4ff}.admin-stat-card>div{display:flex;flex-direction:column;gap:7px}.admin-stat-card>div span{color:#929baa;font-size:11px}.admin-stat-card>div strong{font-size:23px;line-height:1;font-weight:650;letter-spacing:-.04em;font-variant-numeric:tabular-nums}.admin-alert{display:flex;align-items:center;gap:10px;margin:0 0 15px;padding:12px 14px;border:1px solid;border-radius:9px;font-size:11px}.admin-alert>span{font-weight:800}.admin-alert p{flex:1;margin:0;line-height:1.55}.admin-alert button{background:transparent;border:0;color:inherit;font-size:12px}.admin-alert-success{border-color:rgba(69,206,153,.2);background:rgba(48,165,119,.08);color:#a4ebce}.admin-alert-error{border-color:rgba(255,112,126,.2);background:rgba(200,60,75,.08);color:#ffb1b9}.admin-table-card{border:1px solid var(--au-border);border-radius:12px;overflow:hidden;background:rgba(15,18,23,.86)}.admin-table-heading{min-height:83px;padding:18px 21px;display:flex;align-items:center;justify-content:space-between;gap:18px;border-bottom:1px solid var(--au-border)}.admin-table-heading h2{margin:0;color:#e8edf4;font-size:13px;font-weight:650}.admin-table-heading p{margin:6px 0 0;color:#858f9e;font-size:10px}.admin-search{height:34px;width:min(270px,45%);display:flex;align-items:center;gap:8px;padding:0 10px;border:1px solid rgba(255,255,255,.1);border-radius:7px;background:#0d1014;color:#7d8796}.admin-search>span{font-size:19px}.admin-search input{width:100%;min-width:0;background:transparent;border:0;outline:0;color:#e8edf4;font-size:10px}.admin-search input::placeholder{color:#626c7a}.admin-search kbd{white-space:nowrap;padding:3px 5px;border:1px solid rgba(255,255,255,.09);border-radius:4px;color:#697383;font-size:9px}.admin-table-wrap{overflow-x:auto}.admin-users-table{width:100%;border-collapse:collapse;text-align:left;white-space:nowrap}.admin-users-table thead{background:rgba(255,255,255,.018)}.admin-users-table th{height:39px;padding:0 19px;color:#727d8c;font-size:9px;font-weight:700;letter-spacing:.08em}.admin-users-table td{height:67px;padding:10px 19px;border-top:1px solid rgba(255,255,255,.055);font-size:11px}.admin-users-table tbody tr{transition:background .12s}.admin-users-table tbody tr:hover{background:rgba(255,255,255,.018)}.admin-user-cell{display:flex;align-items:center;gap:11px;min-width:220px}.admin-user-cell .admin-avatar{width:33px;height:33px;flex-basis:33px;border-radius:10px}.admin-user-copy{display:flex;flex-direction:column;gap:5px;min-width:0}.admin-user-copy strong{display:flex;align-items:center;gap:7px;color:#e5eaf1;font-size:11px;font-weight:600}.admin-user-copy>span{color:#818b9a;font-size:10px}.admin-you-tag{padding:2px 4px;border-radius:3px;background:rgba(97,206,220,.1);color:#79d8e4;font-size:8px;letter-spacing:.05em}.admin-role-pill,.admin-status-pill{display:inline-flex;align-items:center;gap:6px;height:23px;padding:0 8px;border:1px solid rgba(255,255,255,.08);border-radius:6px;color:#a9b2c0;font-size:10px}.admin-role-pill>span,.admin-status-pill>span{width:5px;height:5px;border-radius:50%;background:#7c8796}.admin-role-admin{border-color:rgba(181,145,255,.17);background:rgba(155,112,231,.07);color:#c9b0ff}.admin-role-admin>span{background:#b99aff}.admin-status-active{border-color:rgba(64,207,151,.17);background:rgba(64,207,151,.055);color:#83dfb6}.admin-status-active>span{background:#55d9a1;box-shadow:0 0 7px rgba(85,217,161,.25)}.admin-status-inactive{border-color:rgba(255,255,255,.08);background:rgba(255,255,255,.025);color:#8e97a5}.admin-status-inactive>span{background:#77818e}.admin-date-cell{color:#929baa;font-size:10px!important}.admin-actions-cell{text-align:right}.admin-action-button{height:27px;padding:0 9px;border:1px solid rgba(255,255,255,.1);border-radius:6px;background:rgba(255,255,255,.025);color:#b2bbc8;font-size:10px!important}.admin-action-button:hover:not(:disabled){background:rgba(255,255,255,.07);color:white}.admin-action-deactivate{color:#d2a2a7;border-color:rgba(231,105,119,.14)}.admin-action-activate{color:#84ddb7;border-color:rgba(64,207,151,.17)}.admin-row-actions{display:flex;align-items:center;justify-content:flex-end;gap:7px}.admin-user-menu-wrap{position:relative}.admin-pencil-button{width:28px;height:27px;display:grid;place-items:center;border:1px solid rgba(255,255,255,.1);border-radius:6px;background:rgba(255,255,255,.025);color:#b5bfcc;font-size:15px}.admin-pencil-button:hover{background:rgba(255,255,255,.08);color:white}.admin-user-menu{position:absolute;z-index:20;right:0;top:33px;min-width:150px;padding:5px;border:1px solid rgba(255,255,255,.12);border-radius:8px;background:#171b22;box-shadow:0 12px 30px rgba(0,0,0,.4)}.admin-user-menu button{display:block;width:100%;padding:9px 10px;border:0;border-radius:5px;text-align:left;background:transparent;color:#d9e0e9;font-size:11px}.admin-user-menu button:hover{background:rgba(255,255,255,.06)}.admin-user-menu .admin-menu-danger{color:#e8a5ad}.admin-form-select{width:100%;height:39px;padding:0 11px;border:1px solid rgba(255,255,255,.11);border-radius:7px;outline:0;background:#0c0f13;color:#edf1f7;font-size:11px}.admin-form-select:focus{border-color:rgba(94,207,223,.55);box-shadow:0 0 0 3px rgba(94,207,223,.07)}.admin-password-row{display:flex;align-items:stretch;gap:7px}.admin-password-row input{flex:1;min-width:0;height:39px;padding:0 11px;border:1px solid rgba(255,255,255,.11);border-radius:7px;outline:0;background:#0c0f13;color:#edf1f7;font-size:11px}.admin-password-row input:focus{border-color:rgba(94,207,223,.55)}.admin-generate-button{padding:0 10px;border:1px solid rgba(93,212,226,.22);border-radius:7px;background:rgba(73,184,204,.08);color:#8be1e8;font-size:10px;white-space:nowrap}.admin-generate-button:hover{background:rgba(73,184,204,.16)}.admin-optional-label{color:#737e8d;font-weight:400}.admin-table-footer{height:44px;display:flex;align-items:center;justify-content:space-between;padding:0 20px;border-top:1px solid var(--au-border);color:#778190;font-size:10px}.admin-table-footer button{border:0;background:transparent;color:#a5afbd;font-size:10px}.admin-table-footer button:hover:not(:disabled){color:white}.admin-empty,.admin-table-state{min-height:205px;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:9px;color:#8b95a4}.admin-empty>div{width:42px;height:42px;margin-bottom:2px;border:1px solid rgba(255,255,255,.08);border-radius:12px;display:grid;place-items:center;background:rgba(255,255,255,.025);font-size:21px}.admin-empty strong{color:#dce2ea;font-size:12px;font-weight:600}.admin-empty>span{font-size:10px}.admin-empty .admin-secondary-button{margin-top:7px}.admin-table-state{flex-direction:row;font-size:11px}.admin-secondary-button{height:34px;padding:0 13px;border:1px solid rgba(255,255,255,.12);border-radius:7px;background:rgba(255,255,255,.035);color:#d4dbe5;font-size:11px}.admin-secondary-button:hover:not(:disabled){background:rgba(255,255,255,.075)}.admin-security-note{display:flex;align-items:center;gap:8px;margin:17px 1px;color:#707b8a;font-size:10px}.admin-security-note span{color:#7e8998;font-size:13px}.admin-modal-backdrop{position:fixed;z-index:100;inset:0;display:grid;place-items:center;padding:20px;background:rgba(2,4,7,.76);backdrop-filter:blur(8px)}.admin-create-modal{position:relative;width:min(100%,430px);padding:29px;border:1px solid rgba(255,255,255,.12);border-radius:15px;background:linear-gradient(150deg,#171b22,#101318 70%);box-shadow:0 24px 90px rgba(0,0,0,.45)}.admin-modal-close{position:absolute;top:14px;right:15px;width:29px;height:29px;border:1px solid transparent;border-radius:7px;background:transparent;color:#8b95a4;font-size:21px}.admin-modal-close:hover{background:rgba(255,255,255,.06);color:white}.admin-modal-icon{width:40px;height:40px;margin-bottom:19px;border:1px solid rgba(93,212,226,.18);border-radius:12px;display:grid;place-items:center;background:rgba(73,184,204,.09);color:#80e1e9;font-size:23px}.admin-create-modal h2{margin:0;font-size:21px;letter-spacing:-.035em}.admin-modal-description{margin:9px 0 23px;color:#919baa;font-size:11px;line-height:1.7}.admin-form-label{display:block;margin:15px 0 7px;color:#c8d0db;font-size:10px;font-weight:600}.admin-create-modal form>input{width:100%;height:39px;padding:0 11px;border:1px solid rgba(255,255,255,.11);border-radius:7px;outline:0;background:#0c0f13;color:#edf1f7;font-size:11px}.admin-create-modal form>input:focus{border-color:rgba(94,207,223,.55);box-shadow:0 0 0 3px rgba(94,207,223,.07)}.admin-create-modal form>input::placeholder{color:#606a78}.admin-form-error{margin-top:12px;padding:9px 10px;border:1px solid rgba(255,112,126,.2);border-radius:6px;background:rgba(200,60,75,.08);color:#ffb1b9;font-size:10px}.admin-modal-note{display:flex;gap:9px;margin-top:17px;padding:11px;border:1px solid rgba(255,255,255,.07);border-radius:7px;background:rgba(255,255,255,.025);color:#8994a3}.admin-modal-note>span{font-size:13px;color:#86cbd6}.admin-modal-note p{margin:0;font-size:10px;line-height:1.65}.admin-modal-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:23px}.admin-modal-actions .admin-primary-button{min-width:112px}.admin-users-loading,.admin-users-denied{min-height:100vh;flex:1;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px;color:#9ca5b3}.admin-users-denied h1{margin:0;color:#e8edf4;font-size:24px}.admin-users-denied p{margin:0;font-size:12px}.admin-users-denied a{margin-top:8px;color:#78dce6;text-decoration:none}.admin-lock{width:50px;height:50px;border:1px solid var(--au-border);border-radius:14px;display:grid;place-items:center;color:#85dce6;font-size:25px}.admin-spinner,.admin-mini-spinner{display:inline-block;width:15px;height:15px;border:2px solid rgba(140,208,219,.18);border-top-color:#76dce6;border-radius:50%;animation:admin-spin .75s linear infinite}.admin-mini-spinner{width:11px;height:11px;border-width:1.5px;vertical-align:middle}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}@keyframes admin-spin{to{transform:rotate(360deg)}}
    @media(max-width:900px){.admin-rail{width:205px;flex-basis:205px}.admin-content{padding:32px 23px}.admin-topbar{padding:0 23px}.admin-stat-card{padding:14px;gap:10px}.admin-stat-icon{width:32px;height:32px;flex-basis:32px}}
    @media(max-width:650px){.admin-users-shell{display:block}.admin-rail{width:100%;min-height:0;height:auto;padding:12px 15px;flex-direction:row;align-items:center;border-right:0;border-bottom:1px solid var(--au-border)}.admin-brand{padding:0}.admin-rail-label,.admin-rail-link:not(.admin-rail-link-active),.admin-rail-bottom{display:none}.admin-rail-link-active{margin-left:auto;height:32px;padding:0 9px;font-size:10px}.admin-topbar{height:53px;padding:0 17px}.admin-breadcrumb{display:none}.admin-content{padding:27px 15px}.admin-page-heading{align-items:flex-start}.admin-page-heading h1{font-size:23px}.admin-page-heading p{max-width:240px;line-height:1.6}.admin-page-heading>.admin-primary-button{height:34px;padding:0 10px;font-size:10px}.admin-stat-grid{gap:7px}.admin-stat-card{min-height:80px;display:block;padding:12px 10px}.admin-stat-icon{width:27px;height:27px;margin-bottom:8px;font-size:14px}.admin-stat-card>div{gap:5px}.admin-stat-card>div span{font-size:9px}.admin-stat-card>div strong{font-size:20px}.admin-table-heading{align-items:flex-start;flex-direction:column;padding:16px}.admin-search{width:100%}.admin-users-table th,.admin-users-table td{padding-right:12px;padding-left:12px}.admin-users-table th{font-size:8px}.admin-user-cell{min-width:185px}.admin-date-cell{display:none}.admin-users-table th:nth-child(4){display:none}.admin-users-table td:nth-child(4){display:none}.admin-security-note{line-height:1.6}.admin-create-modal{padding:24px 20px}}
  `}</style>;
}
