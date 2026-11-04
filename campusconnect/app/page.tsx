"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import { getSupabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

type Profile = { user_id: string; display_name: string; username: string; avatar_path: string | null; bio: string | null; major: string | null; department: string | null; graduation_year: number | null };
type Post = { id: string; author_id: string; body: string; channel: "campus" | "academic" | "marketplace"; created_at: string; is_pinned: boolean };
type Comment = { id: string; post_id: string; author_id: string; body: string; created_at: string };
type CampusGroup = { id: string; institution_id: string; owner_id: string; name: string; description: string | null; category: string | null; visibility: "public" | "private"; created_at: string };
type GroupPost = { id: string; group_id: string; author_id: string; body: string; created_at: string };
type GroupMember = { user_id: string; role: "member" | "moderator" | "admin" };
type GroupInvite = { id: string; group_id: string; invited_by: string; invited_at: string; group_name?: string };

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
  const [verificationStatus, setVerificationStatus] = useState<"pending" | "verified" | "suspended" | "error" | null>(null);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [avatarUrls, setAvatarUrls] = useState<Record<string, string>>({});
  const [myProfile, setMyProfile] = useState<Profile | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [profileForm, setProfileForm] = useState({ display_name: "", username: "", bio: "", major: "", department: "", graduation_year: "" });
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
  const [activeView, setActiveView] = useState<"feed" | "groups">("feed");
  const [groups, setGroups] = useState<CampusGroup[]>([]);
  const [groupMemberships, setGroupMemberships] = useState<Record<string, string>>({});
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [groupPosts, setGroupPosts] = useState<GroupPost[]>([]);
  const [groupPostDraft, setGroupPostDraft] = useState("");
  const [groupName, setGroupName] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [groupCategory, setGroupCategory] = useState("Academic");
  const [groupVisibility, setGroupVisibility] = useState<"public" | "private">("public");
  const [groupBusy, setGroupBusy] = useState(false);
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([]);
  const [inviteUsername, setInviteUsername] = useState("");
  const [myGroupInvites, setMyGroupInvites] = useState<GroupInvite[]>([]);

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
    const ids = [...new Set([...rows.map((post) => post.author_id), ...commentRows.map((comment) => comment.author_id), ...(user ? [user.id] : [])])];
    if (ids.length) {
      const { data: people } = await supabase.from("profiles")
        .select("user_id,display_name,username,avatar_path,bio,major,department,graduation_year")
        .in("user_id", ids);
      const index: Record<string, Profile> = {};
      const signed: Record<string, string> = {};
      const peopleRows = (people ?? []) as Profile[];
      peopleRows.forEach((person) => { index[person.user_id] = person; });
      const signedResults = await Promise.all(peopleRows.filter((person) => person.avatar_path).map(async (person) => {
        const { data: signedUrl } = await supabase.storage.from("campus-avatars").createSignedUrl(person.avatar_path as string, 3600);
        return signedUrl?.signedUrl ? [person.user_id, signedUrl.signedUrl] as const : null;
      }));
      signedResults.forEach((result) => {
        if (result) signed[result[0]] = result[1];
      });
      setProfiles(index);
      setAvatarUrls(signed);
      if (user && index[user.id]) {
        setMyProfile(index[user.id]);
        setProfileForm({
          display_name: index[user.id].display_name ?? "",
          username: index[user.id].username ?? "",
          bio: index[user.id].bio ?? "",
          major: index[user.id].major ?? "",
          department: index[user.id].department ?? "",
          graduation_year: index[user.id].graduation_year?.toString() ?? "",
        });
      }
    }
  }

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (!session?.user) setVerificationStatus(null);
    });
    return () => listener.subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    let active = true;
    async function checkVerification() {
      if (!supabase || !user) { setVerificationStatus(null); return; }
      setVerificationStatus(null);
      const { data, error } = await supabase.from("users").select("verification_status").eq("id", user.id).single();
      if (!active) return;
      if (error) { setNotice("We couldn't check your campus verification status. Please try again."); setVerificationStatus("error"); return; }
      setVerificationStatus(data.verification_status as "pending" | "verified" | "suspended");
    }
    void checkVerification();
    return () => { active = false; };
  }, [supabase, user]);

  useEffect(() => {
    if (user && verificationStatus === "verified") {
      void loadFeed();
      void loadGroups();
    }
  }, [user, verificationStatus]);

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

  async function loadGroups() {
    if (!supabase || !user) return;
    const { data, error } = await supabase.from("groups")
      .select("id,institution_id,owner_id,name,description,category,visibility,created_at")
      .order("created_at", { ascending: false })
      .limit(60);
    if (error) { setNotice(error.message); return; }
    const rows = (data ?? []) as CampusGroup[];
    setGroups(rows);
    const { data: memberships, error: membershipError } = await supabase.from("group_members")
      .select("group_id,role")
      .eq("user_id", user.id);
    if (membershipError) { setNotice(membershipError.message); return; }
    const map: Record<string, string> = {};
    (memberships ?? []).forEach((item) => { map[item.group_id] = item.role; });
    setGroupMemberships(map);
    await loadMyGroupInvites();
    const ownerIds = [...new Set(rows.map((group) => group.owner_id))];
    if (ownerIds.length) {
      const { data: owners } = await supabase.from("profiles")
        .select("user_id,display_name,username,avatar_path,bio,major,department,graduation_year")
        .in("user_id", ownerIds);
      if (owners) setProfiles((current) => {
        const next = { ...current };
        (owners as Profile[]).forEach((person) => { next[person.user_id] = person; });
        return next;
      });
    }
  }

  async function loadMyGroupInvites() {
    if (!supabase || !user) return;
    const { data, error } = await supabase.from("group_invites")
      .select("id,group_id,invited_by,invited_at")
      .eq("invited_user_id", user.id)
      .eq("status", "pending")
      .order("invited_at", { ascending: false })
      .limit(20);
    if (error) { setNotice(error.message); return; }
    const invites = (data ?? []) as GroupInvite[];
    if (!invites.length) { setMyGroupInvites([]); return; }
    const ids = [...new Set(invites.map((invite) => invite.group_id))];
    const { data: groupRows } = await supabase.from("groups").select("id,name").in("id", ids);
    const names = Object.fromEntries((groupRows ?? []).map((group) => [group.id, group.name]));
    setMyGroupInvites(invites.map((invite) => ({ ...invite, group_name: names[invite.group_id] || "UEW community" })));
  }

  async function loadGroupMembers(groupId: string) {
    if (!supabase) return;
    const { data, error } = await supabase.from("group_members")
      .select("user_id,role").eq("group_id", groupId).order("joined_at", { ascending: true });
    if (error) { setNotice(error.message); return; }
    const members = (data ?? []) as GroupMember[];
    setGroupMembers(members);
    const ids = [...new Set(members.map((member) => member.user_id))];
    if (!ids.length) return;
    const { data: people } = await supabase.from("profiles")
      .select("user_id,display_name,username,avatar_path,bio,major,department,graduation_year")
      .in("user_id", ids);
    if (people) setProfiles((current) => {
      const next = { ...current };
      (people as Profile[]).forEach((person) => { next[person.user_id] = person; });
      return next;
    });
  }

  async function sendGroupInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !user || !activeGroup) return;
    const handle = inviteUsername.trim().replace(/^@/, "");
    if (!handle) return;
    setGroupBusy(true); setNotice("");
    try {
      const { data: target, error: targetError } = await supabase.from("profiles")
        .select("user_id,username").eq("username", handle).maybeSingle();
      if (targetError || !target) throw new Error("No UEW member was found with that username.");
      if (target.user_id === user.id) throw new Error("You cannot invite yourself.");
      const { data: account } = await supabase.from("users").select("institution_id").eq("id", user.id).single();
      if (!account) throw new Error("Your UEW account could not be loaded.");
      const { error } = await supabase.from("group_invites").insert({
        institution_id: account.institution_id,
        group_id: activeGroup.id,
        invited_user_id: target.user_id,
        invited_by: user.id,
        status: "pending",
      });
      if (error) {
        if (error.code === "23505") throw new Error("That member already has a pending invitation.");
        throw error;
      }
      setInviteUsername("");
      setNotice("Invitation sent to @" + target.username + ".");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not send this invitation.");
    } finally { setGroupBusy(false); }
  }

  async function respondToGroupInvite(invite: GroupInvite, status: "accepted" | "declined") {
    if (!supabase) return;
    setGroupBusy(true); setNotice("");
    try {
      const { error } = await supabase.from("group_invites").update({
        status, responded_at: new Date().toISOString(),
      }).eq("id", invite.id);
      if (error) throw error;
      await loadMyGroupInvites();
      await loadGroups();
      if (status === "accepted") {
        setActiveView("groups");
        setActiveGroupId(invite.group_id);
        await loadGroupPosts(invite.group_id);
        await loadGroupMembers(invite.group_id);
        setNotice("Invitation accepted. You are now a community member.");
      } else {
        setNotice("Invitation declined.");
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not update this invitation.");
    } finally { setGroupBusy(false); }
  }

  async function updateGroupMemberRole(member: GroupMember, role: "member" | "moderator") {
    if (!supabase || !activeGroup || activeGroup.owner_id !== user?.id) return;
    setGroupBusy(true); setNotice("");
    try {
      const { error } = await supabase.from("group_members").update({ role })
        .eq("group_id", activeGroup.id).eq("user_id", member.user_id);
      if (error) throw error;
      await loadGroupMembers(activeGroup.id);
      setNotice(role === "moderator" ? "Moderator role assigned." : "Moderator role removed.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not update this member role.");
    } finally { setGroupBusy(false); }
  }

  async function loadGroupPosts(groupId: string) {
    if (!supabase) return;
    const { data, error } = await supabase.from("group_posts")
      .select("id,group_id,author_id,body,created_at")
      .eq("group_id", groupId)
      .order("created_at", { ascending: false })
      .limit(60);
    if (error) { setNotice(error.message); return; }
    const rows = (data ?? []) as GroupPost[];
    setGroupPosts(rows);
    const ids = [...new Set(rows.map((post) => post.author_id))];
    if (ids.length) {
      const { data: people } = await supabase.from("profiles")
        .select("user_id,display_name,username,avatar_path,bio,major,department,graduation_year")
        .in("user_id", ids);
      if (people) {
        const peopleRows = people as Profile[];
        setProfiles((current) => {
          const next = { ...current };
          peopleRows.forEach((person) => { next[person.user_id] = person; });
          return next;
        });
        const signedResults = await Promise.all(peopleRows.filter((person) => person.avatar_path).map(async (person) => {
          const { data: signedUrl } = await supabase.storage.from("campus-avatars").createSignedUrl(person.avatar_path as string, 3600);
          return signedUrl?.signedUrl ? [person.user_id, signedUrl.signedUrl] as const : null;
        }));
        setAvatarUrls((current) => {
          const next = { ...current };
          signedResults.forEach((result) => { if (result) next[result[0]] = result[1]; });
          return next;
        });
      }
    }
  }

  async function createGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !user) return;
    setGroupBusy(true); setNotice("");
    try {
      const { data: account, error: accountError } = await supabase.from("users")
        .select("institution_id").eq("id", user.id).single();
      if (accountError || !account) throw new Error("Your verified UEW account could not be loaded.");
      const { data, error } = await supabase.from("groups").insert({
        institution_id: account.institution_id,
        owner_id: user.id,
        name: groupName.trim(),
        description: groupDescription.trim() || null,
        category: groupCategory,
        visibility: groupVisibility,
      }).select("id").single();
      if (error) throw error;
      setGroupName(""); setGroupDescription(""); setGroupVisibility("public");
      await loadGroups();
      const groupId = data.id as string;
      setActiveGroupId(groupId);
      setActiveView("groups");
      await loadGroupPosts(groupId);
      await loadGroupMembers(groupId);
      setNotice("Your community has been created.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not create this community.");
    } finally { setGroupBusy(false); }
  }

  async function joinGroup(group: CampusGroup) {
    if (!supabase || !user) return;
    setGroupBusy(true); setNotice("");
    try {
      const { error } = await supabase.from("group_members").insert({
        institution_id: group.institution_id,
        group_id: group.id,
        user_id: user.id,
        role: "member",
      });
      if (error) throw error;
      await loadGroups();
      setActiveGroupId(group.id);
      await loadGroupPosts(group.id);
      await loadGroupMembers(group.id);
      setNotice("You joined the community.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not join this community.");
    } finally { setGroupBusy(false); }
  }

  async function leaveGroup(group: CampusGroup) {
    if (!supabase || !user || group.owner_id === user.id) return;
    setGroupBusy(true); setNotice("");
    try {
      const { error } = await supabase.from("group_members")
        .delete().eq("group_id", group.id).eq("user_id", user.id);
      if (error) throw error;
      setActiveGroupId(null);
      setGroupPosts([]);
      setGroupMembers([]);
      await loadGroups();
      setNotice("You left the community.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not leave this community.");
    } finally { setGroupBusy(false); }
  }

  async function deleteGroupPost(post: GroupPost) {
    if (!supabase || !user || !activeGroup) return;
    if (post.author_id !== user.id && activeGroup.owner_id !== user.id && groupMemberships[activeGroup.id] !== "moderator" && groupMemberships[activeGroup.id] !== "admin") return;
    if (!window.confirm("Delete this group post? This cannot be undone.")) return;
    setGroupBusy(true); setNotice("");
    try {
      const { error } = await supabase.from("group_posts").delete().eq("id", post.id);
      if (error) throw error;
      await loadGroupPosts(activeGroup.id);
      setNotice("Group post deleted.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not delete this group post.");
    } finally { setGroupBusy(false); }
  }

  async function publishGroupPost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !user || !activeGroup) return;
    const body = groupPostDraft.trim();
    if (!body) return;
    setGroupBusy(true); setNotice("");
    try {
      const { error } = await supabase.from("group_posts").insert({
        institution_id: activeGroup.institution_id,
        group_id: activeGroup.id,
        author_id: user.id,
        body,
      });
      if (error) throw error;
      setGroupPostDraft("");
      await loadGroupPosts(activeGroup.id);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not publish your group post.");
    } finally { setGroupBusy(false); }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !user) return;
    setProfileSaving(true); setNotice("");
    try {
      const year = profileForm.graduation_year.trim() ? Number(profileForm.graduation_year) : null;
      if (year !== null && (!Number.isInteger(year) || year < 1950 || year > 2150)) {
        throw new Error("Enter a valid graduation year between 1950 and 2150.");
      }
      const { data, error } = await supabase.from("profiles").update({
        display_name: profileForm.display_name.trim(),
        username: profileForm.username.trim().toLowerCase(),
        bio: profileForm.bio.trim() || null,
        major: profileForm.major.trim() || null,
        department: profileForm.department.trim() || null,
        graduation_year: year,
      }).eq("user_id", user.id).select("user_id,display_name,username,avatar_path,bio,major,department,graduation_year").single();
      if (error) throw error;
      setMyProfile(data as Profile);
      setProfiles((current) => ({ ...current, [user.id]: data as Profile }));
      setProfileOpen(false);
      setNotice("Your profile has been updated.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save your profile.");
    } finally { setProfileSaving(false); }
  }

  async function uploadAvatar(event: ChangeEvent<HTMLInputElement>) {
    if (!supabase || !user) return;
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setNotice("Choose a JPG, PNG or WebP image."); return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setNotice("Your profile photo must be 2 MB or smaller."); return;
    }
    setAvatarBusy(true); setNotice("");
    try {
      const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
      const path = user.id + "/" + Date.now() + "." + extension;
      const { error: uploadError } = await supabase.storage.from("campus-avatars").upload(path, file, {
        contentType: file.type,
        cacheControl: "3600",
        upsert: false,
      });
      if (uploadError) throw uploadError;
      const { data, error } = await supabase.from("profiles").update({ avatar_path: path })
        .eq("user_id", user.id)
        .select("user_id,display_name,username,avatar_path,bio,major,department,graduation_year")
        .single();
      if (error) throw error;
      const { data: signed, error: signedError } = await supabase.storage.from("campus-avatars").createSignedUrl(path, 3600);
      if (signedError) throw signedError;
      const updated = data as Profile;
      setMyProfile(updated);
      setProfiles((current) => ({ ...current, [user.id]: updated }));
      if (signed?.signedUrl) setAvatarUrls((current) => ({ ...current, [user.id]: signed.signedUrl }));
      setNotice("Your profile photo has been updated.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not upload your profile photo.");
    } finally { setAvatarBusy(false); }
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

  const activeGroup = groups.find((group) => group.id === activeGroupId) ?? null;
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
      ) : verificationStatus !== "verified" ? (
        <section className="verification-layout">
          <div className="verification-card card">
            <div className="verification-icon">{verificationStatus === "suspended" || verificationStatus === "error" ? "!" : "⌛"}</div>
            <div className="eyebrow">UEW ACCOUNT CHECK</div>
            <h1>{verificationStatus === "suspended" ? "Account access paused" : verificationStatus === "error" ? "We couldn’t check your account" : verificationStatus === "pending" ? "Your account is awaiting verification" : "Checking your campus account…"}</h1>
            <p>{verificationStatus === "pending" ? "Your email sign-in is confirmed, but CampusConnect still needs an authorised UEW verification before you can access the campus community. This helps keep the network limited to eligible members." : verificationStatus === "suspended" ? "Your account is currently suspended. Please contact the CampusConnect support team or your campus administrator for help." : verificationStatus === "error" ? "Your account status could not be retrieved. Your access remains restricted until the check succeeds." : "Please wait while we check your campus membership status."}</p>
            {verificationStatus === "pending" && <p className="verification-note">Email confirmation alone does not prove current enrolment. An authorised campus administrator must complete this step.</p>}{notice && <p className="notice" role="status">{notice}</p>}{verificationStatus === "error" && <button className="profile-edit-button" onClick={() => window.location.reload()}>Try again</button>}
            <button className="primary-button" onClick={signOut}>Sign out</button>
          </div>
        </section>
      ) : (
        <div className="app-layout">
          <aside className="sidebar">
            <div className="side-label">YOUR CAMPUS</div>
            <button className={activeView === "feed" ? "side-link selected" : "side-link"} onClick={() => { setActiveView("feed"); setActiveGroupId(null); }}><span>⌂</span> Home feed</button>
            <button className={activeView === "groups" ? "side-link selected" : "side-link"} onClick={() => { setActiveView("groups"); setActiveGroupId(null); void loadGroups(); }}><span>◎</span> Communities</button>
            <a className="side-link" href="#messages"><span>✉</span> Messages <em>Soon</em></a>
            <a className="side-link" href="#events"><span>▦</span> Campus events <em>Soon</em></a>
            <div className="sidebar-note"><strong>UEW · Winneba</strong><p>A community built around your campus experience.</p></div>
          </aside>
          <section className="feed-column">
            <div className={activeView === "feed" ? "view-content" : "view-content hidden"}>
            <section className="profile-summary card">
              <div className="profile-identity">
                <div className="profile-avatar-wrap">
                  {avatarUrls[user.id] ? <img className="profile-avatar" src={avatarUrls[user.id]} alt="Your profile"/> : <div className="profile-avatar profile-avatar-fallback">{initials(myProfile?.display_name || user.email?.split("@")[0] || "U")}</div>}
                  <label className="avatar-change" title="Change profile photo">✎<input type="file" accept="image/png,image/jpeg,image/webp" onChange={uploadAvatar} disabled={avatarBusy}/></label>
                </div>
                <div className="profile-summary-text"><strong>{myProfile?.display_name || "Your profile"}</strong><span>@{myProfile?.username || "set-a-username"}</span><p>{myProfile?.bio || "Add a short bio so campus members can get to know you."}</p></div>
              </div>
              <div className="profile-actions"><button className="profile-edit-button" onClick={() => setProfileOpen((open) => !open)}>{profileOpen ? "Close editor" : "Edit profile"}</button><small>{avatarBusy ? "Uploading photo…" : "JPG, PNG or WebP · Max 2 MB"}</small></div>
              {profileOpen && <form className="profile-editor" onSubmit={saveProfile}>
                <div className="profile-form-grid">
                  <label>Full name<input required maxLength={120} value={profileForm.display_name} onChange={(e) => setProfileForm((v) => ({...v,display_name:e.target.value}))}/></label>
                  <label>Username<input required minLength={3} maxLength={30} pattern="[A-Za-z0-9_]+" value={profileForm.username} onChange={(e) => setProfileForm((v) => ({...v,username:e.target.value}))}/></label>
                  <label>Programme / major<input maxLength={120} value={profileForm.major} onChange={(e) => setProfileForm((v) => ({...v,major:e.target.value}))} placeholder="e.g. B.Ed. Basic Education"/></label>
                  <label>Department<input maxLength={120} value={profileForm.department} onChange={(e) => setProfileForm((v) => ({...v,department:e.target.value}))} placeholder="Your department"/></label>
                  <label>Graduation year<input type="number" min="1950" max="2150" value={profileForm.graduation_year} onChange={(e) => setProfileForm((v) => ({...v,graduation_year:e.target.value}))} placeholder="e.g. 2028"/></label>
                </div>
                <label className="profile-bio-label">Bio<textarea maxLength={500} rows={3} value={profileForm.bio} onChange={(e) => setProfileForm((v) => ({...v,bio:e.target.value}))} placeholder="A little about you…"/></label>
                <div className="profile-editor-actions"><span>Keep personal details you don&apos;t want public out of your bio.</span><button className="primary-button compact" disabled={profileSaving}>{profileSaving ? "Saving…" : "Save profile"}</button></div>
              </form>}
            </section>
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
                  <div className="post-head">{avatarUrls[post.author_id] ? <img className="avatar avatar-image" src={avatarUrls[post.author_id]} alt=""/> : <div className="avatar">{initials(name)}</div>}<div className="post-author"><strong>{name}</strong><span>@{person?.username || "campusmember"} · {new Date(post.created_at).toLocaleString()}</span></div><span className="channel-tag">{channels.find((item) => item.id === post.channel)?.label}</span></div>
                  <p className="post-body">{post.body}</p>
                  <div className="comment-list">
                    {(comments[post.id] ?? []).map((comment) => {
                      const commenter = profiles[comment.author_id];
                      return <div className="comment" key={comment.id}>{avatarUrls[comment.author_id] ? <img className="comment-avatar" src={avatarUrls[comment.author_id]} alt=""/> : <div className="comment-avatar">{initials(commenter?.display_name || "UEW")}</div>}<div><strong>{commenter?.display_name || "UEW student"}</strong><p>{comment.body}</p><time>{new Date(comment.created_at).toLocaleString()}</time></div></div>;
                    })}
                  </div>
                  <form className="comment-form" onSubmit={(event) => publishComment(event, post.id)}>
                    <input aria-label="Write a comment" maxLength={5000} placeholder="Write a comment…" value={commentDrafts[post.id] ?? ""} onChange={(event) => setCommentDrafts((current) => ({ ...current, [post.id]: event.target.value }))}/>
                    <button type="submit" disabled={commentBusy === post.id || !(commentDrafts[post.id] ?? "").trim()}>{commentBusy === post.id ? "…" : "Reply"}</button>
                  </form>
                </article>;
              })}
            </div>
            </div>
            <div className={activeView === "groups" ? "view-content" : "view-content hidden"}>
              {activeGroup ? (
                <div className="groups-view">
                  <button className="back-link" onClick={() => { setActiveGroupId(null); setGroupPosts([]); }}>← All communities</button>
                  <div className="group-detail-card card">
                    <div className="group-detail-top"><div><div className="eyebrow">{activeGroup.category || "UEW COMMUNITY"}</div><h1>{activeGroup.name}</h1><p>{activeGroup.description || "A place for UEW members to connect and share."}</p></div><span className="group-type-tag">{activeGroup.visibility === "public" ? "PUBLIC" : "PRIVATE"}</span></div>
                    <div className="group-detail-meta"><span>{groupMemberships[activeGroup.id] === "admin" ? "Community owner" : groupMemberships[activeGroup.id] === "moderator" ? "Moderator" : "Member"}</span><button className="profile-edit-button" disabled={groupBusy || activeGroup.owner_id === user.id} onClick={() => leaveGroup(activeGroup)}>{activeGroup.owner_id === user.id ? "You own this group" : "Leave group"}</button></div>
                  </div>
                  {(activeGroup.owner_id === user.id || groupMemberships[activeGroup.id] === "moderator" || groupMemberships[activeGroup.id] === "admin") && <form className="group-invite-card card" onSubmit={sendGroupInvite}><div><strong>Invite a UEW member</strong><p>Enter their exact CampusConnect username.</p></div><div className="group-invite-fields"><input value={inviteUsername} onChange={(e) => setInviteUsername(e.target.value)} placeholder="e.g. ama_owusu" aria-label="Member username" required/><button className="primary-button compact" disabled={groupBusy || !inviteUsername.trim()}>{groupBusy ? "Sending…" : "Send invite"} <span>→</span></button></div></form>}
                  {(activeGroup.owner_id === user.id || groupMemberships[activeGroup.id] === "admin") && <section className="group-members-card card"><div className="groups-section-heading"><h2>Members & moderators</h2><span>{groupMembers.length} members</span></div><div className="group-member-list">{groupMembers.map((member) => { const person = profiles[member.user_id]; return <div className="group-member-row" key={member.user_id}><div><strong>{person?.display_name || "UEW member"}</strong><span>@{person?.username || "campusmember"} · {member.role}</span></div>{activeGroup.owner_id === user.id && member.user_id !== user.id && <select aria-label={"Role for " + (person?.username || "member")} value={member.role === "moderator" ? "moderator" : "member"} disabled={groupBusy} onChange={(e) => void updateGroupMemberRole(member, e.target.value as "member" | "moderator")}><option value="member">Member</option><option value="moderator">Moderator</option></select>}</div>; })}</div></section>}
                  <form className="group-composer card" onSubmit={publishGroupPost}>
                    <textarea value={groupPostDraft} onChange={(e) => setGroupPostDraft(e.target.value)} maxLength={10000} placeholder={"Share something with " + activeGroup.name + "…"} aria-label="Write a group post"/>
                    <div className="group-composer-bottom"><span>Posts are visible to group members only.</span><button className="primary-button compact" disabled={groupBusy || !groupPostDraft.trim()}>{groupBusy ? "Please wait…" : "Share post"} <span>→</span></button></div>
                  </form>
                  <div className="group-posts">
                    {groupPosts.length === 0 ? <div className="empty card"><div className="empty-icon">◎</div><h3>Start the conversation</h3><p>Share the first update with members of this community.</p></div> : groupPosts.map((post) => {
                      const author = profiles[post.author_id];
                      return <article className="post card" key={post.id}><div className="post-head">{avatarUrls[post.author_id] ? <img className="avatar avatar-image" src={avatarUrls[post.author_id]} alt=""/> : <div className="avatar">{initials(author?.display_name || "UEW")}</div>}<div className="post-author"><strong>{author?.display_name || "UEW member"}</strong><span>@{author?.username || "campusmember"} · {new Date(post.created_at).toLocaleString()}</span></div></div><p className="post-body">{post.body}</p>{(post.author_id === user.id || activeGroup.owner_id === user.id || groupMemberships[activeGroup.id] === "moderator" || groupMemberships[activeGroup.id] === "admin") && <div className="group-post-actions"><button disabled={groupBusy} onClick={() => deleteGroupPost(post)}>Delete post</button></div>}</article>;
                    })}
                  </div>
                </div>
              ) : (
                <div className="groups-view">
                  {myGroupInvites.length > 0 && <section className="group-inbox card"><div className="groups-section-heading"><h2>Community invitations</h2><span>{myGroupInvites.length} pending</span></div>{myGroupInvites.map((invite) => <div className="group-invite-row" key={invite.id}><div><strong>{invite.group_name}</strong><span>Invited to join a UEW community</span></div><div><button className="primary-button compact" disabled={groupBusy} onClick={() => void respondToGroupInvite(invite, "accepted")}>Accept</button><button className="profile-edit-button" disabled={groupBusy} onClick={() => void respondToGroupInvite(invite, "declined")}>Decline</button></div></div>)}</section>}
                  <div className="feed-heading"><div><div className="eyebrow">FIND YOUR PEOPLE</div><h1>Campus communities</h1><p className="muted">Join conversations and learn with people who share your interests.</p></div><div className="campus-pill"><span/> UEW GROUPS</div></div>
                  <form className="group-create-card card" onSubmit={createGroup}>
                    <div className="group-create-heading"><div><strong>Create a community</strong><p>Bring classmates and campus friends together around an interest.</p></div><span>✳</span></div>
                    <div className="group-create-fields"><label>Community name<input required minLength={3} maxLength={80} value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="e.g. UEW Level 200 Study Circle"/></label><label>Category<select value={groupCategory} onChange={(e) => setGroupCategory(e.target.value)}><option>Academic</option><option>Department</option><option>Hall & residence</option><option>Sports</option><option>Arts & culture</option><option>Career & business</option><option>Social</option></select></label><label>Visibility<select value={groupVisibility} onChange={(e) => setGroupVisibility(e.target.value as "public" | "private")}><option value="public">Public — anyone can join</option><option value="private">Private — invite only</option></select></label></div>
                    <label className="group-description-label">Description<textarea rows={2} maxLength={500} value={groupDescription} onChange={(e) => setGroupDescription(e.target.value)} placeholder="What is this community about?"/></label>
                    <div className="group-create-footer"><span>{groupVisibility === "public" ? "Public communities can be joined by verified UEW members." : "Private communities are hidden until a member accepts an invitation."}</span><button className="primary-button compact" disabled={groupBusy || groupName.trim().length < 3}>{groupBusy ? "Creating…" : "Create community"} <span>→</span></button></div>
                  </form>
                  <div className="groups-section-heading"><h2>Explore communities</h2><span>{groups.length} found</span></div>
                  <div className="group-grid">
                    {groups.length === 0 ? <div className="empty card"><div className="empty-icon">◎</div><h3>No communities yet</h3><p>Create the first UEW community and invite people to join.</p></div> : groups.map((group) => {
                      const role = groupMemberships[group.id];
                      const owner = profiles[group.owner_id];
                      return <article className="group-card card" key={group.id}><div className="group-card-top"><span className="group-icon">◎</span><span className="group-type-tag">{group.visibility === "public" ? "PUBLIC" : "PRIVATE"}</span></div><div className="eyebrow">{group.category || "CAMPUS COMMUNITY"}</div><h3>{group.name}</h3><p>{group.description || "A community for UEW members to connect."}</p><div className="group-card-owner">Created by {owner?.display_name || "UEW member"}</div><div className="group-card-actions">{role ? <><button className="primary-button compact" onClick={() => { setActiveGroupId(group.id); void loadGroupPosts(group.id); void loadGroupMembers(group.id); }}>Open community →</button>{group.owner_id !== user.id && <button className="profile-edit-button" disabled={groupBusy} onClick={() => leaveGroup(group)}>Leave</button>}</> : group.visibility === "public" ? <button className="primary-button compact" disabled={groupBusy} onClick={() => joinGroup(group)}>Join community <span>→</span></button> : <span className="invite-only">Invite only</span>}</div></article>;
                    })}
                  </div>
                </div>
              )}
            </div>
          </section>
          <aside className="rightbar"><div className="right-card"><div className="eyebrow">CAMPUS SPOTLIGHT</div><h3>Good things happen when we connect.</h3><p>Find a study partner, share an opportunity or help someone settle into campus life.</p></div><div className="right-card soft"><div className="eyebrow">COMING TO CAMPUSCONNECT</div><p>Private-group invitations</p><p>Direct messages</p><p>Campus events</p><p>Member notifications</p></div></aside>
          {notice && <div className="toast" role="status">{notice}</div>}
        </div>
      )}
      <footer className="footer">CampusConnect <span>·</span> Built for the UEW community <span>·</span> Ghana</footer>
    </main>
  );
}
