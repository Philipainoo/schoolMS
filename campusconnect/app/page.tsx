"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

type Profile = { user_id: string; display_name: string; username: string; avatar_path: string | null };
type Post = { id: string; author_id: string; body: string; channel: "campus" | "academic" | "marketplace"; created_at: string; is_pinned: boolean };
type Comment = { id: string; post_id: string; author_id: string; body: string; created_at: string };

const channels = [
  { id: "campus", label: "Campus life" },
  { id: "academic", label: "Academics" },
  { id: "marketplace", label: "Marketplace" },
] as const;

export default function Home() {
  const supabase = useMemo(() => {
    try { return getSupabase(); } catch { return null; }
  }, []);
  const [user, setUser] = useState<User | null>(null);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [posts, setPosts] = useState<Post[]>([]);
  const [comments, setComments] = useState<Record<string, Comment[]>>({});
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [commentBusy, setCommentBusy] = useState<string | null>(null);
  const [mode, setMode] = useState<"signin" | "signup">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [draft, setDraft] = useState("");
  const [channel, setChannel] = useState<Post["channel"]>("campus");
  const [filter, setFilter] = useState<"all" | Post["channel"]>("all");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadFeed() {
    if (!supabase) return;
    const { data, error } = await supabase.from("posts")
      .select("id,author_id,body,channel,created_at,is_pinned")
      .eq("is_removed", false)
      .order("is_pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(40);
    if (error) { setNotice(error.message); return; }
    const rows = (data ?? []) as Post[];
    setPosts(rows);
    const postIds = rows.map((post) => post.id);
    let commentRows: Comment[] = [];
    if (postIds.length) {
      const { data: commentData, error: commentError } = await supabase.from("comments")
        .select("id,post_id,author_id,body,created_at")
        .in("post_id", postIds)
        .order("created_at", { ascending: true });
      if (commentError) { setNotice(commentError.message); }
      commentRows = (commentData ?? []) as Comment[];
    }
    const grouped: Record<string, Comment[]> = {};
    commentRows.forEach((comment) => {
      grouped[comment.post_id] = [...(grouped[comment.post_id] ?? []), comment];
    });
    setComments(grouped);
    const ids = [...new Set([...rows.map((post) => post.author_id), ...commentRows.map((comment) => comment.author_id)])];
    if (ids.length) {
      const { data: people } = await supabase.from("profiles")
        .select("user_id,display_name,username,avatar_path")
        .in("user_id", ids);
      const index: Record<string, Profile> = {};
      (people ?? []).forEach((person) => { index[person.user_id] = person as Profile; });
      setProfiles(index);
    }
  }

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => listener.subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    if (user) void loadFeed();
  }, [user]);

  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true); setNotice("");
    try {
      if (mode === "signup") {
        const { data: institution, error: institutionError } = await supabase
          .from("institutions").select("id").eq("slug", "uew").single();
        if (institutionError || !institution) throw new Error("The UEW campus is not available yet. Please try again later.");
        const { error } = await supabase.auth.signUp({
          email, password,
          options: {
            emailRedirectTo: window.location.origin,
            data: {
              institution_id: institution.id,
              role: "student",
              display_name: displayName.trim(),
              username: username.trim().toLowerCase(),
            },
          },
        });
        if (error) throw error;
        setNotice("Account created. Check your email and confirm your address before signing in.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        setNotice("Welcome back to campus.");
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Something went wrong.");
    } finally { setBusy(false); }
  }

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !user || !draft.trim()) return;
    setBusy(true); setNotice("");
    try {
      const { data: institution, error: institutionError } = await supabase
        .from("institutions").select("id").eq("slug", "uew").single();
      if (institutionError || !institution) throw new Error("UEW campus could not be found.");
      const { error } = await supabase.from("posts").insert({
        institution_id: institution.id,
        author_id: user.id,
        channel,
        body: draft.trim(),
      });
      if (error) throw error;
      setDraft("");
      setNotice("Your post is live.");
      await loadFeed();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not publish your post.");
    } finally { setBusy(false); }
  }

  async function publishComment(event: FormEvent<HTMLFormElement>, postId: string) {
    event.preventDefault();
    if (!supabase || !user) return;
    const body = (commentDrafts[postId] ?? "").trim();
    if (!body) return;
    setCommentBusy(postId); setNotice("");
    try {
      const { data: institution, error: institutionError } = await supabase
        .from("institutions").select("id").eq("slug", "uew").single();
      if (institutionError || !institution) throw new Error("UEW campus could not be found.");
      const { error } = await supabase.from("comments").insert({
        institution_id: institution.id,
        post_id: postId,
        author_id: user.id,
        body,
      });
      if (error) throw error;
      setCommentDrafts((current) => ({ ...current, [postId]: "" }));
      await loadFeed();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not add your comment.");
    } finally { setCommentBusy(null); }
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setPosts([]);
    setNotice("You have signed out.");
  }

  const visiblePosts = posts.filter((post) => filter === "all" || post.channel === filter);
  const initials = (name: string) => name.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase();

  if (!supabase) return <main className="setup"><div className="setup-card"><span className="brand-mark">C</span><h1>CampusConnect</h1><p>Connect your Supabase project to launch the UEW campus community.</p><code>cp .env.example .env.local</code><p className="muted">Then add your Supabase public key and restart the development server.</p></div></main>;

  return (
    <main className="shell">
      <header className="topbar">
        <a className="brand" href="#"><span className="brand-mark">C</span><span>Campus<span className="brand-accent">Connect</span><small>UEW COMMUNITY</small></span></a>
        {user ? <button className="text-button" onClick={signOut}>Sign out</button> : <span className="top-note">University of Education, Winneba</span>}
      </header>

      {!user ? (
        <section className="auth-layout">
          <div className="welcome-panel">
            <div className="eyebrow">YOUR CAMPUS, CONNECTED</div>
            <h1>Find your people.<br/><span>Make campus count.</span></h1>
            <p>One place for campus conversations, academic support, student communities and opportunities at UEW.</p>
            <div className="welcome-points"><span>✳ Campus conversations</span><span>✳ Study connections</span><span>✳ Student marketplace</span></div>
            <div className="orb orb-one"/><div className="orb orb-two"/>
          </div>
          <div className="auth-card">
            <div className="auth-tabs"><button className={mode === "signup" ? "active" : ""} onClick={() => setMode("signup")}>Create account</button><button className={mode === "signin" ? "active" : ""} onClick={() => setMode("signin")}>Sign in</button></div>
            <h2>{mode === "signup" ? "Join your campus" : "Welcome back"}</h2>
            <p className="muted">{mode === "signup" ? "Create your UEW community account." : "Sign in to catch up with campus."}</p>
            <form onSubmit={authenticate} className="stack">
              {mode === "signup" && <><label>Full name<input required value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your name"/></label><label>Username<input required minLength={3} maxLength={30} pattern="[A-Za-z0-9_]+" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="e.g. ama_mensah"/></label></>}
              <label>University email<input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com"/></label>
              <label>Password<input required minLength={8} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters"/></label>
              <button className="primary-button" disabled={busy}>{busy ? "Please wait…" : mode === "signup" ? "Create my account" : "Sign in"} <span>→</span></button>
            </form>
            <p className="fine-print">Email confirmation is required. Confirming an email address does not by itself verify current UEW enrolment. Official UEW email-domain eligibility is awaiting confirmation.</p>
            {notice && <p className="notice" role="status">{notice}</p>}
          </div>
        </section>
      ) : (
        <div className="app-layout">
          <aside className="sidebar">
            <div className="side-label">YOUR CAMPUS</div>
            <a className="side-link selected" href="#"><span>⌂</span> Home feed</a>
            <a className="side-link" href="#groups"><span>◎</span> Communities <em>Soon</em></a>
            <a className="side-link" href="#messages"><span>✉</span> Messages <em>Soon</em></a>
            <a className="side-link" href="#events"><span>▦</span> Campus events <em>Soon</em></a>
            <div className="sidebar-note"><strong>UEW · Winneba</strong><p>A community built around your campus experience.</p></div>
          </aside>
          <section className="feed-column">
            <div className="feed-heading"><div><div className="eyebrow">MONDAY TO SUNDAY, TOGETHER</div><h1>Your campus feed</h1><p className="muted">What’s happening around UEW?</p></div><div className="campus-pill"><span/> UEW COMMUNITY</div></div>
            <form className="composer card" onSubmit={publish}>
              <div className="composer-top"><div className="avatar">{initials(user.email?.split("@")[0] || "U")}</div><textarea value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={10000} placeholder="Share something with your campus…" aria-label="Write a campus post"/></div>
              <div className="composer-bottom"><select value={channel} onChange={(e) => setChannel(e.target.value as Post["channel"])} aria-label="Choose post channel">{channels.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select><button className="primary-button compact" disabled={busy || !draft.trim()}>Post <span>→</span></button></div>
            </form>
            <div className="filters">{[{id:"all",label:"For you"},...channels].map((item) => <button key={item.id} className={filter === item.id ? "filter active" : "filter"} onClick={() => setFilter(item.id as typeof filter)}>{item.label}</button>)}</div>
            <div className="posts">
              {visiblePosts.length === 0 ? <div className="empty card"><div className="empty-icon">✳</div><h3>Your campus story starts here</h3><p>There are no posts in this feed yet. Be the first to share something with UEW.</p></div> : visiblePosts.map((post) => {
                const person = profiles[post.author_id];
                const name = person?.display_name || "UEW student";
                return <article className="post card" key={post.id}>
                  <div className="post-head"><div className="avatar">{initials(name)}</div><div className="post-author"><strong>{name}</strong><span>@{person?.username || "campusmember"} · {new Date(post.created_at).toLocaleString()}</span></div><span className="channel-tag">{channels.find((item) => item.id === post.channel)?.label}</span></div>
                  <p className="post-body">{post.body}</p>
                  <div className="comment-list">
                    {(comments[post.id] ?? []).map((comment) => {
                      const commenter = profiles[comment.author_id];
                      return <div className="comment" key={comment.id}><div className="comment-avatar">{initials(commenter?.display_name || "UEW")}</div><div><strong>{commenter?.display_name || "UEW student"}</strong><p>{comment.body}</p><time>{new Date(comment.created_at).toLocaleString()}</time></div></div>;
                    })}
                  </div>
                  <form className="comment-form" onSubmit={(event) => publishComment(event, post.id)}>
                    <input aria-label="Write a comment" maxLength={5000} placeholder="Write a comment…" value={commentDrafts[post.id] ?? ""} onChange={(event) => setCommentDrafts((current) => ({ ...current, [post.id]: event.target.value }))}/>
                    <button type="submit" disabled={commentBusy === post.id || !(commentDrafts[post.id] ?? "").trim()}>{commentBusy === post.id ? "…" : "Reply"}</button>
                  </form>
                </article>;
              })}
            </div>
          </section>
          <aside className="rightbar"><div className="right-card"><div className="eyebrow">CAMPUS SPOTLIGHT</div><h3>Good things happen when we connect.</h3><p>Find a study partner, share an opportunity or help someone settle into campus life.</p></div><div className="right-card soft"><div className="eyebrow">COMING TO CAMPUSCONNECT</div><p>Student groups</p><p>Direct messages</p><p>Campus events</p><p>Profiles and discovery</p></div></aside>
          {notice && <div className="toast" role="status">{notice}</div>}
        </div>
      )}
      <footer className="footer">CampusConnect <span>·</span> Built for the UEW community <span>·</span> Ghana</footer>
    </main>
  );
}
