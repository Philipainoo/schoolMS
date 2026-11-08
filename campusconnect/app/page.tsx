"use client";

import Image from "next/image";
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
type DirectMessage = { id: string; conversation_id: string; sender_id: string; body: string; created_at: string };
type ConversationSummary = { id: string; created_at: string; peer: Profile | null; lastMessage: DirectMessage | null };
type CampusEvent = { id: string; title: string; description: string | null; starts_at: string; ends_at: string | null; location: string; organizer_id: string };
type CampusAnnouncement = { id: string; title: string; content: string; priority: "normal" | "high"; published_at: string; author_id: string };
type CampusNotification = { id: string; actor_id: string | null; notification_type: "comment" | "direct_message" | "group_invite" | "connection_accepted"; entity_type: "post" | "message" | "group" | "connections"; entity_id: string; message: string; created_at: string; read_at: string | null };

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
  const [accountRole, setAccountRole] = useState<"student" | "faculty" | null>(null);
  const [campusEvents, setCampusEvents] = useState<CampusEvent[]>([]);
  const [announcements, setAnnouncements] = useState<CampusAnnouncement[]>([]);
  const [eventForm, setEventForm] = useState({ title: "", description: "", starts_at: "", ends_at: "", location: "" });
  const [announcementForm, setAnnouncementForm] = useState({ title: "", content: "", priority: "normal" as "normal" | "high" });
  const [boardBusy, setBoardBusy] = useState(false);
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
  const [activeView, setActiveView] = useState<"feed" | "discover" | "connections" | "groups" | "messages" | "events">("feed");
  const [discoverySearch, setDiscoverySearch] = useState("");
  const [discoveredMembers, setDiscoveredMembers] = useState<Profile[]>([]);
  const [discoveryBusy, setDiscoveryBusy] = useState(false);
  const [connectionRows, setConnectionRows] = useState<Array<{id:string; requester_id:string; recipient_id:string; status:"pending"|"accepted"|"declined"; created_at:string}>>([]);
  const [connectionProfiles, setConnectionProfiles] = useState<Record<string, Profile>>({});
  const [connectionBusy, setConnectionBusy] = useState(false);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [threadMessages, setThreadMessages] = useState<DirectMessage[]>([]);
  const [messageDraft, setMessageDraft] = useState("");
  const [messageBusy, setMessageBusy] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const [memberResult, setMemberResult] = useState<Profile | null>(null);
  const [messageSearchBusy, setMessageSearchBusy] = useState(false);
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
  const [notifications, setNotifications] = useState<CampusNotification[]>([]);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [realtimeStatus, setRealtimeStatus] = useState<"connecting" | "connected" | "offline">("connecting");

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
      if (!supabase || !user) { setVerificationStatus(null); setAccountRole(null); return; }
      setVerificationStatus(null);
      const { data, error } = await supabase.from("users").select("verification_status,role").eq("id", user.id).single();
      if (!active) return;
      if (error) { setNotice("We couldn't check your account status. Please try again."); setVerificationStatus("error"); return; }
      setVerificationStatus(data.verification_status as "pending" | "verified" | "suspended");
      setAccountRole(data.role as "student" | "faculty");
    }
    void checkVerification();
    return () => { active = false; };
  }, [supabase, user]);

  useEffect(() => {
    if (user && verificationStatus === "verified") {
      void loadFeed();
      void loadGroups();
      void loadCampusBoard();
      void loadNotifications();
    }
  }, [user, verificationStatus]);

  async function loadConversations() {
    if (!supabase || !user) return;
    const { data: rows, error } = await supabase.from("conversations")
      .select("id,created_at")
      .eq("is_group", false)
      .order("created_at", { ascending: false })
      .limit(60);
    if (error) { setNotice(error.message); return; }
    const ids = (rows ?? []).map((row) => row.id as string);
    if (!ids.length) { setConversations([]); return; }
    const { data: members, error: membersError } = await supabase.from("conversation_members")
      .select("conversation_id,user_id").in("conversation_id", ids);
    if (membersError) { setNotice(membersError.message); return; }
    const peers = new Map<string, string>();
    (members ?? []).forEach((member) => {
      if (member.user_id !== user.id) peers.set(member.conversation_id, member.user_id);
    });
    const peerIds = [...new Set([...peers.values()])];
    const { data: people } = peerIds.length ? await supabase.from("profiles")
      .select("user_id,display_name,username,avatar_path,bio,major,department,graduation_year")
      .in("user_id", peerIds) : { data: [] as Profile[] };
    const peopleMap: Record<string, Profile> = {};
    ((people ?? []) as Profile[]).forEach((person) => { peopleMap[person.user_id] = person; });
    if (people) setProfiles((current) => ({ ...current, ...peopleMap }));
    const { data: messageRows, error: messagesError } = await supabase.from("messages")
      .select("id,conversation_id,sender_id,body,created_at")
      .in("conversation_id", ids)
      .order("created_at", { ascending: false })
      .limit(300);
    if (messagesError) { setNotice(messagesError.message); return; }
    const latest = new Map<string, DirectMessage>();
    ((messageRows ?? []) as DirectMessage[]).forEach((message) => {
      if (!latest.has(message.conversation_id)) latest.set(message.conversation_id, message);
    });
    const summaries = (rows ?? []).map((row) => ({
      id: row.id as string,
      created_at: row.created_at as string,
      peer: peopleMap[peers.get(row.id as string) || ""] || null,
      lastMessage: latest.get(row.id as string) || null,
    })).sort((a, b) => new Date(b.lastMessage?.created_at || b.created_at).getTime() - new Date(a.lastMessage?.created_at || a.created_at).getTime());
    setConversations(summaries);
  }

  async function loadThreadMessages(conversationId: string) {
    if (!supabase) return;
    const { data, error } = await supabase.from("messages")
      .select("id,conversation_id,sender_id,body,created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(150);
    if (error) { setNotice(error.message); return; }
    setThreadMessages((data ?? []) as DirectMessage[]);
  }

  async function loadConnections() {
    if (!supabase || !user) return;
    setConnectionBusy(true);
    try {
      const { data, error } = await supabase.from("campus_connections")
        .select("id,requester_id,recipient_id,status,created_at")
        .or("requester_id.eq."+user.id+",recipient_id.eq."+user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as typeof connectionRows;
      setConnectionRows(rows);
      const ids = [...new Set(rows.map((row) => row.requester_id === user.id ? row.recipient_id : row.requester_id))];
      if (ids.length) {
        const { data: people, error: peopleError } = await supabase.from("profiles")
          .select("user_id,display_name,username,avatar_path,bio,major,department,graduation_year").in("user_id", ids);
        if (peopleError) throw peopleError;
        const mapped = Object.fromEntries(((people ?? []) as Profile[]).map((person) => [person.user_id, person]));
        setConnectionProfiles(mapped);
        setProfiles((current) => ({ ...current, ...mapped }));
        const signed = await Promise.all(Object.values(mapped).filter((person) => person.avatar_path).map(async (person) => {
          const { data: result } = await supabase.storage.from("campus-avatars").createSignedUrl(person.avatar_path as string, 3600);
          return result?.signedUrl ? [person.user_id, result.signedUrl] as const : null;
        }));
        setAvatarUrls((current) => ({ ...current, ...Object.fromEntries(signed.filter((item): item is readonly [string, string] => item !== null)) }));
      } else setConnectionProfiles({});
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not load your connections.");
    } finally { setConnectionBusy(false); }
  }

  async function sendConnectionRequest(person: Profile) {
    if (!supabase || !user) return;
    setConnectionBusy(true); setNotice("");
    try {
      const { data: account, error: accountError } = await supabase.from("users").select("institution_id").eq("id", user.id).single();
      if (accountError || !account) throw new Error("Your UEW account could not be loaded.");
      const { error } = await supabase.from("campus_connections").insert({
        institution_id: account.institution_id, requester_id: user.id, recipient_id: person.user_id, status: "pending"
      });
      if (error) throw error;
      setNotice("Connection request sent to " + person.display_name + ".");
      await loadConnections();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not send the connection request.");
    } finally { setConnectionBusy(false); }
  }

  async function respondToConnection(id: string, status: "accepted" | "declined") {
    if (!supabase) return;
    setConnectionBusy(true); setNotice("");
    try {
      const { error } = await supabase.from("campus_connections").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
      setNotice(status === "accepted" ? "Connection accepted." : "Request declined.");
      await loadConnections();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not update this request.");
    } finally { setConnectionBusy(false); }
  }

  async function searchCampusMembers(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !discoverySearch.trim()) return;
    setDiscoveryBusy(true); setNotice("");
    try {
      const term = discoverySearch.trim().replace(/[,%()]/g, " ").slice(0, 80);
      const { data, error } = await supabase.from("profiles")
        .select("user_id,display_name,username,avatar_path,bio,major,department,graduation_year")
        .or("display_name.ilike.%"+term+"%,username.ilike.%"+term+"%,major.ilike.%"+term+"%")
        .neq("user_id", user?.id || "")
        .order("display_name", { ascending: true })
        .limit(24);
      if (error) throw error;
      const people = (data ?? []) as Profile[];
      setDiscoveredMembers(people);
      setProfiles((current) => ({ ...current, ...Object.fromEntries(people.map((person) => [person.user_id, person])) }));
      const signed = await Promise.all(people.filter((person) => person.avatar_path).map(async (person) => {
        const { data: result } = await supabase.storage.from("campus-avatars").createSignedUrl(person.avatar_path as string, 3600);
        return result?.signedUrl ? [person.user_id, result.signedUrl] as const : null;
      }));
      setAvatarUrls((current) => ({ ...current, ...Object.fromEntries(signed.filter((item): item is readonly [string, string] => item !== null)) }));
      if (!people.length) setNotice("No matching members were found. Try a name, username or programme.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Member search is unavailable right now.");
    } finally { setDiscoveryBusy(false); }
  }

  async function findMessageMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !memberSearch.trim()) return;
    setMessageSearchBusy(true); setMemberResult(null); setNotice("");
    try {
      const handle = memberSearch.trim().replace(/^@/, "").toLowerCase();
      const { data, error } = await supabase.from("profiles")
        .select("user_id,display_name,username,avatar_path,bio,major,department,graduation_year")
        .eq("username", handle).maybeSingle();
      if (error) throw error;
      if (!data || data.user_id === user?.id) throw new Error("No other UEW member was found with that username.");
      setMemberResult(data as Profile);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not search for that member.");
    } finally { setMessageSearchBusy(false); }
  }

  async function startDirectConversation(person: Profile) {
    if (!supabase) return;
    setMessageBusy(true); setNotice("");
    try {
      const { data, error } = await supabase.rpc("open_direct_conversation", { target_user_id: person.user_id });
      if (error) throw error;
      const conversationId = data as string;
      setMemberResult(null); setMemberSearch("");
      setActiveConversationId(conversationId);
      setActiveView("messages");
      await loadConversations();
      await loadThreadMessages(conversationId);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not open this conversation.");
    } finally { setMessageBusy(false); }
  }

  async function sendDirectMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !user || !activeConversationId || !messageDraft.trim()) return;
    setMessageBusy(true); setNotice("");
    try {
      const { data: account, error: accountError } = await supabase.from("users")
        .select("institution_id").eq("id", user.id).single();
      if (accountError || !account) throw new Error("Your UEW account could not be loaded.");
      const { error } = await supabase.from("messages").insert({
        institution_id: account.institution_id,
        conversation_id: activeConversationId,
        sender_id: user.id,
        body: messageDraft.trim(),
      });
      if (error) throw error;
      setMessageDraft("");
      await Promise.all([loadThreadMessages(activeConversationId), loadConversations()]);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Your message could not be sent.");
    } finally { setMessageBusy(false); }
  }

  async function openConversation(conversationId: string) {
    setActiveConversationId(conversationId);
    setThreadMessages([]);
    await loadThreadMessages(conversationId);
  }

  useEffect(() => {
    if (!supabase || !user || verificationStatus !== "verified") return;
    const channel = supabase.channel("campusconnect-direct-messages-" + user.id)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        const incoming = payload.new as DirectMessage;
        if (incoming.conversation_id === activeConversationId) void loadThreadMessages(incoming.conversation_id);
        void loadConversations();
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [supabase, user, verificationStatus, activeConversationId]);

  useEffect(() => {
    if (!supabase || !user || verificationStatus !== "verified") return;
    const channel = supabase.channel("campusconnect-notifications-" + user.id)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: "recipient_id=eq." + user.id,
      }, () => { void loadNotifications(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [supabase, user, verificationStatus]);

  useEffect(() => {
    if (!supabase || !user || verificationStatus !== "verified") {
      setRealtimeStatus("offline");
      return;
    }
    setRealtimeStatus("connecting");
    let mounted = true;
    const groupId = activeGroupId;
    let channel = supabase.channel("campusconnect-feed-groups-" + user.id);
    channel = channel
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "posts" }, () => {
        void loadFeed();
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "posts" }, () => {
        void loadFeed();
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "comments" }, () => {
        void loadFeed();
      });
    if (groupId) {
      channel = channel.on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "group_posts",
        filter: "group_id=eq." + groupId,
      }, () => {
        void loadGroupPosts(groupId);
      });
    }
    channel = channel.subscribe((status) => {
      if (!mounted) return;
      if (status === "SUBSCRIBED") setRealtimeStatus("connected");
      else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") setRealtimeStatus("offline");
    });
    return () => {
      mounted = false;
      void supabase.removeChannel(channel);
    };
  }, [supabase, user, verificationStatus, activeGroupId]);

  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true); setNotice("");
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: {
            emailRedirectTo: window.location.origin,
            data: {
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
        setNotice("Welcome back to CampusConnect.");
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
      const { error } = await supabase.from("posts").insert({
        institution_id: null,
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

  async function loadCampusBoard() {
    if (!supabase || !user) return;
    const [{ data: eventRows, error: eventError }, { data: announcementRows, error: announcementError }] = await Promise.all([
      supabase.from("campus_events").select("id,title,description,starts_at,ends_at,location,organizer_id").gte("starts_at", new Date().toISOString()).order("starts_at", { ascending: true }).limit(50),
      supabase.from("announcements").select("id,title,content,priority,published_at,author_id").order("published_at", { ascending: false }).limit(30),
    ]);
    if (eventError) setNotice(eventError.message); else setCampusEvents((eventRows ?? []) as CampusEvent[]);
    if (announcementError) setNotice(announcementError.message); else setAnnouncements((announcementRows ?? []) as CampusAnnouncement[]);
  }

  async function loadNotifications() {
    if (!supabase || !user) return;
    const { data, error } = await supabase.from("notifications")
      .select("id,actor_id,notification_type,entity_type,entity_id,message,created_at,read_at")
      .order("created_at", { ascending: false })
      .limit(40);
    if (error) { setNotice(error.message); return; }
    const rows = (data ?? []) as CampusNotification[];
    setNotifications(rows);
    const actorIds = [...new Set(rows.map((item) => item.actor_id).filter((id): id is string => Boolean(id)))];
    if (!actorIds.length) return;
    const { data: people, error: peopleError } = await supabase.from("profiles")
      .select("user_id,display_name,username,avatar_path,bio,major,department,graduation_year")
      .in("user_id", actorIds);
    if (!peopleError && people) {
      const index: Record<string, Profile> = {};
      (people as Profile[]).forEach((person) => { index[person.user_id] = person; });
      setProfiles((current) => ({ ...current, ...index }));
    }
  }

  async function markAllNotificationsRead() {
    if (!supabase || !user) return;
    const unreadIds = notifications.filter((item) => !item.read_at).map((item) => item.id);
    if (!unreadIds.length) return;
    const readAt = new Date().toISOString();
    const { error } = await supabase.from("notifications").update({ read_at: readAt }).in("id", unreadIds);
    if (error) { setNotice(error.message); return; }
    setNotifications((current) => current.map((item) => item.read_at ? item : { ...item, read_at: readAt }));
  }

  async function openNotification(item: CampusNotification) {
    if (!supabase) return;
    setNotificationOpen(false);
    if (!item.read_at) {
      const readAt = new Date().toISOString();
      const { error } = await supabase.from("notifications").update({ read_at: readAt }).eq("id", item.id).is("read_at", null);
      if (error) setNotice(error.message);
      else setNotifications((current) => current.map((entry) => entry.id === item.id ? { ...entry, read_at: readAt } : entry));
    }
    if (item.entity_type === "connections") {
      setActiveView("connections");
      await loadConnections();
    } else if (item.entity_type === "message") {
      setActiveView("messages");
      await loadConversations();
    } else if (item.entity_type === "group") {
      setActiveView("groups");
      setActiveGroupId(null);
      await loadGroups();
    } else {
      setActiveView("feed");
      await loadFeed();
    }
  }

  async function createCampusEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !user || accountRole !== "faculty") return;
    setBoardBusy(true); setNotice("");
    try {
      const { data: institution, error: institutionError } = await supabase.from("institutions").select("id").eq("slug", "uew").single();
      if (institutionError || !institution) throw new Error("UEW campus could not be found.");
      const { error } = await supabase.from("campus_events").insert({
        institution_id: institution.id, organizer_id: user.id, title: eventForm.title.trim(),
        description: eventForm.description.trim() || null, starts_at: new Date(eventForm.starts_at).toISOString(),
        ends_at: eventForm.ends_at ? new Date(eventForm.ends_at).toISOString() : null, location: eventForm.location.trim(),
      });
      if (error) throw error;
      setEventForm({ title: "", description: "", starts_at: "", ends_at: "", location: "" });
      setNotice("Campus event published."); await loadCampusBoard();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not publish this event."); }
    finally { setBoardBusy(false); }
  }

  async function createAnnouncement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !user || accountRole !== "faculty") return;
    setBoardBusy(true); setNotice("");
    try {
      const { data: institution, error: institutionError } = await supabase.from("institutions").select("id").eq("slug", "uew").single();
      if (institutionError || !institution) throw new Error("UEW campus could not be found.");
      const { error } = await supabase.from("announcements").insert({
        institution_id: institution.id, author_id: user.id, title: announcementForm.title.trim(),
        content: announcementForm.content.trim(), priority: announcementForm.priority,
      });
      if (error) throw error;
      setAnnouncementForm({ title: "", content: "", priority: "normal" });
      setNotice("Campus announcement published."); await loadCampusBoard();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not publish this announcement."); }
    finally { setBoardBusy(false); }
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
      const { error } = await supabase.from("comments").insert({
        institution_id: null,
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
    setNotifications([]);
    setNotificationOpen(false);
    setNotice("You have signed out.");
  }

  const activeGroup = groups.find((group) => group.id === activeGroupId) ?? null;
  const visiblePosts = posts.filter((post) => filter === "all" || post.channel === filter);
  const initials = (name: string) => name.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase();

  if (!supabase) return <main className="setup"><div className="setup-card"><Image src="/uew-logo.svg" alt="University of Education, Winneba crest" width={76} height={75} className="brand-logo brand-logo-large" /><h1>CampusConnect</h1><p>Connect your Supabase project to launch the UEW campus community.</p><code>cp .env.example .env.local</code><p className="muted">Then add your Supabase public key and restart the development server.</p></div></main>;

  return (
    <main className="shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="CampusConnect UEW home"><Image src="/uew-logo.svg" alt="University of Education, Winneba crest" width={48} height={47} className="brand-logo" /><span>Campus<span className="brand-accent">Connect</span><small>UEW COMMUNITY</small></span></a>
        {user ? <div className="topbar-actions">
          {verificationStatus === "verified" && <div className="notification-menu-wrap">
            <button type="button" className="notification-trigger" onClick={() => setNotificationOpen((open) => !open)} aria-expanded={notificationOpen}>
              <span aria-hidden="true">♢</span> Notifications
              {notifications.some((item) => !item.read_at) && <b>{notifications.filter((item) => !item.read_at).length}</b>}
            </button>
            {notificationOpen && <div className="notification-popover">
              <div className="notification-popover-heading"><strong>Notifications <small>{notifications.filter((item) => !item.read_at).length} unread</small></strong><span className="notification-heading-actions"><button type="button" onClick={() => void markAllNotificationsRead()} disabled={!notifications.some((item) => !item.read_at)}>Mark all read</button><button type="button" onClick={() => setNotificationOpen(false)}>Close</button></span></div>
              {notifications.length === 0 ? <p className="notification-empty">You’re all caught up. Connection updates, comments, messages and community invitations will appear here.</p> : <div className="notification-list">
                {notifications.map((item) => <button type="button" key={item.id} className={item.read_at ? "notification-item" : "notification-item unread"} onClick={() => void openNotification(item)}>
                  <span className="notification-dot" aria-hidden="true"/>
                  <span className="notification-item-copy"><strong>{item.actor_id ? profiles[item.actor_id]?.display_name || "A UEW member" : "CampusConnect"}</strong><span>{item.message}</span><time>{new Date(item.created_at).toLocaleString("en-GH", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Accra" })}</time></span>
                </button>)}
              </div>}
            </div>}
          </div>}
          <button className="text-button" onClick={signOut}>Sign out</button>
        </div> : <span className="top-note">University of Education, Winneba</span>}
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
            <p className="fine-print">A valid email address is required. Confirm your email to activate your CampusConnect account.</p>
            {notice && <p className="notice" role="status">{notice}</p>}
          </div>
        </section>
      ) : verificationStatus !== "verified" ? (
        <section className="verification-layout">
          <div className="verification-card card">
            <div className="verification-icon">{verificationStatus === "suspended" || verificationStatus === "error" ? "!" : "⌛"}</div>
            <div className="eyebrow">EMAIL VERIFICATION</div>
            <h1>{verificationStatus === "suspended" ? "Account access paused" : verificationStatus === "error" ? "We couldn’t check your account" : verificationStatus === "pending" ? "Confirm your email to activate your account" : "Checking your account…"}</h1>
            <p>{verificationStatus === "pending" ? "Your account is waiting for email confirmation. Open the confirmation link we sent to your email address, then sign in." : verificationStatus === "suspended" ? "Your account is currently suspended. Please contact CampusConnect support for help." : verificationStatus === "error" ? "Your account status could not be retrieved. Your access remains restricted until the check succeeds." : "Please wait while we check your account status."}</p>
            {notice && <p className="notice" role="status">{notice}</p>}{verificationStatus === "error" && <button className="profile-edit-button" onClick={() => window.location.reload()}>Try again</button>}
            <button className="primary-button" onClick={signOut}>Sign out</button>
          </div>
        </section>
      ) : (
        <div className="app-layout">
          <aside className="sidebar">
            <div className="side-label">YOUR CAMPUS</div>
            <button className={activeView === "feed" ? "side-link selected" : "side-link"} onClick={() => { setActiveView("feed"); setActiveGroupId(null); }}><span>⌂</span> Home feed</button>
            <button className={activeView === "discover" ? "side-link selected" : "side-link"} onClick={() => { setActiveView("discover"); setActiveGroupId(null); void loadConnections(); }}><span>⌕</span> Discover people</button>
            <button className={activeView === "connections" ? "side-link selected" : "side-link"} onClick={() => { setActiveView("connections"); setActiveGroupId(null); void loadConnections(); }}><span>♡</span> Connections</button>
            <button className={activeView === "groups" ? "side-link selected" : "side-link"} onClick={() => { setActiveView("groups"); setActiveGroupId(null); void loadGroups(); }}><span>◎</span> Communities</button>
            <button className={activeView === "messages" ? "side-link selected" : "side-link"} onClick={() => { setActiveView("messages"); setActiveGroupId(null); void loadConversations(); }}><span>✉</span> Messages</button>
            <button className={activeView === "events" ? "side-link selected" : "side-link"} onClick={() => { setActiveView("events"); setActiveGroupId(null); void loadCampusBoard(); }}><span>▦</span> Events & notices</button>
            <a className="side-link" href="/marketplace"><span>▤</span> Marketplace</a>
            <div className="sidebar-note"><strong>UEW · Winneba</strong><p>A community built around your campus experience.</p></div>
          </aside>
          <section className="feed-column">
            <div className={activeView === "feed" ? "view-content" : "view-content hidden"}>
            <section className="dashboard-welcome">
              <div className="dashboard-welcome-copy">
                <span className="dashboard-kicker">YOUR UEW COMMUNITY</span>
                <h1>Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"}, {myProfile?.display_name?.split(" ")[0] || "there"}.</h1>
                <p>Your campus, your people, your next opportunity. See what’s happening across Winneba today.</p>
                <div className="dashboard-welcome-actions">
                  <button type="button" onClick={() => document.querySelector<HTMLTextAreaElement>(".composer textarea")?.focus()}>Share an update <span>↗</span></button>
                  <button type="button" className="dashboard-secondary-action" onClick={() => { setActiveView("events"); void loadCampusBoard(); }}>Explore events</button>
                </div>
              </div>
              <Image src="/uew-logo.svg" alt="" aria-hidden="true" width={116} height={114} className="dashboard-crest" priority/>
            </section>
            <section className="dashboard-quick-stats" aria-label="Campus activity overview">
              <button type="button" className="dashboard-stat-card" onClick={() => { setActiveView("feed"); setFilter("all"); }}>
                <span className="dashboard-stat-icon">✳</span><span className="dashboard-stat-copy"><strong>{posts.length}</strong><small>Campus posts</small></span><span className="dashboard-stat-arrow">↗</span>
              </button>
              <button type="button" className="dashboard-stat-card" onClick={() => { setActiveView("groups"); void loadGroups(); }}>
                <span className="dashboard-stat-icon">◎</span><span className="dashboard-stat-copy"><strong>{groups.length}</strong><small>Communities</small></span><span className="dashboard-stat-arrow">↗</span>
              </button>
              <button type="button" className="dashboard-stat-card" onClick={() => { setActiveView("events"); void loadCampusBoard(); }}>
                <span className="dashboard-stat-icon">▦</span><span className="dashboard-stat-copy"><strong>{campusEvents.filter((event) => new Date(event.starts_at).getTime() >= Date.now()).length}</strong><small>Upcoming events</small></span><span className="dashboard-stat-arrow">↗</span>
              </button>
              <button type="button" className="dashboard-stat-card" onClick={() => { setActiveView("messages"); void loadConversations(); }}>
                <span className="dashboard-stat-icon">✉</span><span className="dashboard-stat-copy"><strong>{conversations.length}</strong><small>Your chats</small></span><span className="dashboard-stat-arrow">↗</span>
              </button>
            </section>
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
            <div className="feed-heading"><div><div className="eyebrow">MONDAY TO SUNDAY, TOGETHER</div><h1>Your campus feed</h1><p className="muted">What’s happening around UEW?</p></div><div className="campus-pill"><span/> {realtimeStatus === "connected" ? "LIVE UPDATES" : realtimeStatus === "connecting" ? "CONNECTING…" : "LIVE UPDATES OFFLINE"}</div></div>
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
            <div className={activeView === "messages" ? "view-content" : "view-content hidden"}>
              <div className="messages-view">
                <div className="feed-heading"><div><div className="eyebrow">PRIVATE CAMPUS CHATS</div><h1>Messages</h1><p className="muted">Connect one-to-one with verified UEW members.</p></div><div className="campus-pill"><span/> PRIVATE</div></div>
                <form className="message-search-card card" onSubmit={findMessageMember}>
                  <label htmlFor="message-member-search">Start a conversation</label>
                  <div className="message-search-row"><input id="message-member-search" value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)} placeholder="Search by exact username, e.g. ama_owusu"/><button className="primary-button compact" disabled={messageSearchBusy || !memberSearch.trim()}>{messageSearchBusy ? "Searching…" : "Find member"}</button></div>
                  {memberResult && <div className="message-member-result"><div><strong>{memberResult.display_name}</strong><span>@{memberResult.username}</span></div><button type="button" className="primary-button compact" disabled={messageBusy} onClick={() => void startDirectConversation(memberResult)}>{messageBusy ? "Opening…" : "Message"}</button></div>}
                </form>
                <div className="message-workspace card">
                  <section className="conversation-list">
                    <div className="groups-section-heading"><h2>Your chats</h2><span>{conversations.length}</span></div>
                    {conversations.length === 0 ? <p className="message-empty-copy">No conversations yet. Search for a UEW username above to start one.</p> : conversations.map((conversation) => <button type="button" className={activeConversationId === conversation.id ? "conversation-item active" : "conversation-item"} key={conversation.id} onClick={() => void openConversation(conversation.id)}><span className="conversation-avatar">{initials(conversation.peer?.display_name || "UEW")}</span><span className="conversation-item-copy"><strong>{conversation.peer?.display_name || "UEW member"}</strong><small>@{conversation.peer?.username || "campusmember"}</small><span>{conversation.lastMessage ? (conversation.lastMessage.sender_id === user.id ? "You: " : "") + conversation.lastMessage.body : "Start the conversation"}</span></span></button>)}
                  </section>
                  <section className="message-thread">
                    {activeConversationId ? <>
                      <div className="message-thread-heading"><strong>{conversations.find((item) => item.id === activeConversationId)?.peer?.display_name || "UEW member"}</strong><span>Private conversation</span></div>
                      <div className="message-thread-body">
                        {threadMessages.length === 0 ? <div className="message-thread-empty">Say hello and start the conversation.</div> : threadMessages.map((message) => <div key={message.id} className={message.sender_id === user.id ? "message-bubble mine" : "message-bubble"}><p>{message.body}</p><time>{new Date(message.created_at).toLocaleString()}</time></div>)}
                      </div>
                      <form className="message-compose" onSubmit={sendDirectMessage}><input value={messageDraft} onChange={(e) => setMessageDraft(e.target.value)} maxLength={10000} placeholder="Write a message…" aria-label="Write a direct message"/><button className="primary-button compact" disabled={messageBusy || !messageDraft.trim()}>{messageBusy ? "Sending…" : "Send"} <span>→</span></button></form>
                    </> : <div className="message-thread-placeholder"><span>✉</span><strong>Your private conversations</strong><p>Choose a chat or search for a UEW member to begin.</p></div>}
                  </section>
                </div>
              </div>
            </div>
            <div className={activeView === "events" ? "view-content" : "view-content hidden"}>
              <div className="campus-board-view">
                <div className="feed-heading"><div><div className="eyebrow">WHAT’S HAPPENING AT UEW</div><h1>Events & announcements</h1><p className="muted">Stay up to date with campus activities and official notices.</p></div><div className="campus-pill"><span/> UEW CAMPUS</div></div>
                {accountRole === "faculty" && <div className="board-create-grid">
                  <form className="board-form card" onSubmit={createCampusEvent}>
                    <div className="group-create-heading"><div><strong>Publish a campus event</strong><p>Share a lecture, programme, meeting or campus activity.</p></div><span>▦</span></div>
                    <label>Event title<input required minLength={2} maxLength={200} value={eventForm.title} onChange={(e) => setEventForm((v) => ({ ...v, title: e.target.value }))} placeholder="e.g. UEW Career Fair"/></label>
                    <label>Description<textarea rows={3} maxLength={5000} value={eventForm.description} onChange={(e) => setEventForm((v) => ({ ...v, description: e.target.value }))} placeholder="What should attendees know?"/></label>
                    <div className="board-form-row"><label>Starts<input type="datetime-local" required value={eventForm.starts_at} onChange={(e) => setEventForm((v) => ({ ...v, starts_at: e.target.value }))}/></label><label>Ends (optional)<input type="datetime-local" value={eventForm.ends_at} onChange={(e) => setEventForm((v) => ({ ...v, ends_at: e.target.value }))}/></label></div>
                    <label>Location<input required maxLength={300} value={eventForm.location} onChange={(e) => setEventForm((v) => ({ ...v, location: e.target.value }))} placeholder="e.g. Jophus Anamuah-Mensah Conference Centre"/></label>
                    <button className="primary-button compact" disabled={boardBusy || !eventForm.title.trim() || !eventForm.starts_at || !eventForm.location.trim()}>{boardBusy ? "Publishing…" : "Publish event"} <span>→</span></button>
                  </form>
                  <form className="board-form card" onSubmit={createAnnouncement}>
                    <div className="group-create-heading"><div><strong>Publish an announcement</strong><p>Post an official update for verified UEW members.</p></div><span>✳</span></div>
                    <label>Announcement title<input required minLength={2} maxLength={200} value={announcementForm.title} onChange={(e) => setAnnouncementForm((v) => ({ ...v, title: e.target.value }))} placeholder="e.g. Registration deadline"/></label>
                    <label>Notice<textarea required rows={6} maxLength={20000} value={announcementForm.content} onChange={(e) => setAnnouncementForm((v) => ({ ...v, content: e.target.value }))} placeholder="Write the official notice…"/></label>
                    <label>Priority<select value={announcementForm.priority} onChange={(e) => setAnnouncementForm((v) => ({ ...v, priority: e.target.value as "normal" | "high" }))}><option value="normal">Normal</option><option value="high">Important</option></select></label>
                    <button className="primary-button compact" disabled={boardBusy || !announcementForm.title.trim() || !announcementForm.content.trim()}>{boardBusy ? "Publishing…" : "Publish announcement"} <span>→</span></button>
                  </form>
                </div>}
                <section className="board-section"><div className="groups-section-heading"><h2>Campus announcements</h2><span>{announcements.length} notices</span></div>
                  {announcements.length === 0 ? <div className="empty card"><div className="empty-icon">✳</div><h3>No announcements yet</h3><p>Official campus notices will appear here.</p></div> : announcements.map((item) => <article className={item.priority === "high" ? "announcement-card card important" : "announcement-card card"} key={item.id}><div className="announcement-top"><span className={item.priority === "high" ? "announcement-priority high" : "announcement-priority"}>{item.priority === "high" ? "IMPORTANT" : "CAMPUS NOTICE"}</span><time>{new Date(item.published_at).toLocaleString()}</time></div><h3>{item.title}</h3><p>{item.content}</p></article>)}
                </section>
                <section className="board-section"><div className="groups-section-heading"><h2>Upcoming campus events</h2><span>{campusEvents.length} events</span></div>
                  {campusEvents.length === 0 ? <div className="empty card"><div className="empty-icon">▦</div><h3>No upcoming events listed</h3><p>Check back for lectures, programmes and activities around UEW.</p></div> : <div className="event-list">{campusEvents.map((item) => <article className="event-card card" key={item.id}><div className="event-date"><strong>{new Date(item.starts_at).toLocaleDateString("en-GH", { day: "2-digit" })}</strong><span>{new Date(item.starts_at).toLocaleDateString("en-GH", { month: "short" })}</span></div><div className="event-copy"><h3>{item.title}</h3><p>{item.description || "A campus event for the UEW community."}</p><div className="event-meta"><span>◷ {new Date(item.starts_at).toLocaleString("en-GH", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Accra" })}</span><span>⌖ {item.location}</span></div>{item.ends_at && <small>Ends {new Date(item.ends_at).toLocaleString("en-GH", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Accra" })}</small>}</div></article>)}</div>}
                </section>
                {accountRole !== "faculty" && <p className="board-readonly-note">Only verified UEW faculty accounts can publish official events and announcements. Contact your campus administrator if you need publishing access.</p>}
              </div>
            </div>
            <div className={activeView === "discover" ? "view-content" : "view-content hidden"}>
              <div className="feed-heading"><div><span className="eyebrow">MEET YOUR CAMPUS</span><h1>Discover people</h1><p>Find UEW members by name, username or programme.</p></div><span className="campus-pill">UEW COMMUNITY</span></div>
              <form className="discover-search card" onSubmit={searchCampusMembers}>
                <label htmlFor="campus-member-search">Search the campus directory</label>
                <div className="discover-search-row"><input id="campus-member-search" value={discoverySearch} onChange={(event) => setDiscoverySearch(event.target.value)} placeholder="Try a name, @username or programme…" maxLength={80} required/><button className="primary-button" disabled={discoveryBusy || !discoverySearch.trim()}>{discoveryBusy ? "Searching…" : "Search members"}</button></div>
                <p>Results follow the profile visibility and access rules configured for CampusConnect.</p>
              </form>
              <div className="discover-results-heading"><h2>Campus members</h2><span>{discoveredMembers.length ? discoveredMembers.length+" results" : "Search to get started"}</span></div>
              {discoveredMembers.length ? <div className="discover-grid">{discoveredMembers.map((person) => <article className="discover-card card" key={person.user_id}>
                <div className="discover-person">
                  {avatarUrls[person.user_id] ? <img className="discover-avatar" src={avatarUrls[person.user_id]} alt={person.display_name+" profile"}/> : <div className="discover-avatar discover-avatar-fallback">{initials(person.display_name)}</div>}
                  <div className="discover-person-copy"><strong>{person.display_name}</strong><span>@{person.username}</span></div>
                </div>
                <div className="discover-details">
                  {person.major && <span>📚 {person.major}</span>}
                  {person.department && <span>🏛 {person.department}</span>}
                  {person.graduation_year && <span>🎓 Class of {person.graduation_year}</span>}
                </div>
                <p className="discover-bio">{person.bio || "This member hasn't added a bio yet."}</p>
                <div className="discover-card-actions"><button className="profile-edit-button" type="button" onClick={() => void sendConnectionRequest(person)} disabled={connectionBusy || connectionRows.some((row) => (row.requester_id === user?.id ? row.recipient_id : row.requester_id) === person.user_id)}>{connectionRows.some((row) => row.status === "accepted" && (row.requester_id === user?.id ? row.recipient_id : row.requester_id) === person.user_id) ? "Connected" : connectionRows.some((row) => row.status === "pending" && row.requester_id === user?.id && row.recipient_id === person.user_id) ? "Request sent" : connectionRows.some((row) => row.status === "pending" && row.recipient_id === user?.id && row.requester_id === person.user_id) ? "Respond in Connections" : connectionRows.some((row) => (row.requester_id === user?.id ? row.recipient_id : row.requester_id) === person.user_id) ? "Request closed" : "Connect"}</button><button className="profile-edit-button discover-message" type="button" onClick={() => void startDirectConversation(person)} disabled={messageBusy}>Message <span>↗</span></button></div>
              </article>)}</div> : <div className="empty card"><div className="empty-icon">⌕</div><h3>Find your UEW people</h3><p>Search by a student&apos;s name, username or programme to discover members and start a conversation.</p></div>}
            </div>
            <div className={activeView === "connections" ? "view-content" : "view-content hidden"}>
              <div className="feed-heading"><div><span className="eyebrow">YOUR UEW NETWORK</span><h1>Connections</h1><p>Build your campus circle and keep up with classmates.</p></div><span className="campus-pill">UEW COMMUNITY</span></div>
              <div className="connection-summary-grid">
                <div className="connection-summary card"><strong>{connectionRows.filter((row) => row.status === "accepted").length}</strong><span>Connections</span></div>
                <div className="connection-summary card"><strong>{connectionRows.filter((row) => row.status === "pending" && row.recipient_id === user?.id).length}</strong><span>Requests received</span></div>
                <div className="connection-summary card"><strong>{connectionRows.filter((row) => row.status === "pending" && row.requester_id === user?.id).length}</strong><span>Requests sent</span></div>
              </div>
              <section className="connections-section"><div className="discover-results-heading"><h2>Received requests</h2><span>People who want to connect</span></div>
                {connectionRows.filter((row) => row.status === "pending" && row.recipient_id === user?.id).map((row) => { const person = connectionProfiles[row.requester_id]; return <article className="connection-row card" key={row.id}><div className="connection-person">{avatarUrls[row.requester_id] ? <img className="discover-avatar" src={avatarUrls[row.requester_id]} alt=""/> : <div className="discover-avatar discover-avatar-fallback">{person ? initials(person.display_name) : "UEW"}</div>}<div className="discover-person-copy"><strong>{person?.display_name || "UEW member"}</strong><span>@{person?.username || "member"}</span></div></div><div className="connection-actions"><button className="primary-button" disabled={connectionBusy} onClick={() => void respondToConnection(row.id,"accepted")}>Accept</button><button className="profile-edit-button" disabled={connectionBusy} onClick={() => void respondToConnection(row.id,"declined")}>Decline</button></div></article>; })}
                {!connectionRows.some((row) => row.status === "pending" && row.recipient_id === user?.id) && <div className="empty card"><p>No new connection requests.</p></div>}
              </section>
              <section className="connections-section"><div className="discover-results-heading"><h2>Your connections</h2><span>Accepted members</span></div>
                {connectionRows.filter((row) => row.status === "accepted").map((row) => { const peerId = row.requester_id === user?.id ? row.recipient_id : row.requester_id; const person = connectionProfiles[peerId]; return <article className="connection-row card" key={row.id}><div className="connection-person">{avatarUrls[peerId] ? <img className="discover-avatar" src={avatarUrls[peerId]} alt=""/> : <div className="discover-avatar discover-avatar-fallback">{person ? initials(person.display_name) : "UEW"}</div>}<div className="discover-person-copy"><strong>{person?.display_name || "UEW member"}</strong><span>@{person?.username || "member"}</span></div></div><button className="profile-edit-button" onClick={() => person && void startDirectConversation(person)} disabled={!person || messageBusy}>Message</button></article>; })}
                {!connectionRows.some((row) => row.status === "accepted") && <div className="empty card"><p>Your accepted connections will appear here.</p><button className="primary-button" onClick={() => setActiveView("discover")}>Discover members</button></div>}
              </section>
              <section className="connections-section"><div className="discover-results-heading"><h2>Requests you&apos;ve sent</h2><span>Awaiting a response</span></div>
                {connectionRows.filter((row) => row.status === "pending" && row.requester_id === user?.id).map((row) => <article className="connection-row card" key={row.id}><div className="connection-person"><div className="discover-avatar discover-avatar-fallback">UEW</div><div className="discover-person-copy"><strong>{connectionProfiles[row.recipient_id]?.display_name || "UEW member"}</strong><span>@{connectionProfiles[row.recipient_id]?.username || "member"}</span></div></div><span className="connection-pending">Pending</span></article>)}
                {!connectionRows.some((row) => row.status === "pending" && row.requester_id === user?.id) && <div className="empty card"><p>You haven&apos;t sent any requests yet.</p></div>}
              </section>
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
                    <div className="group-composer-bottom"><span>Members only · {realtimeStatus === "connected" ? "Live updates on" : realtimeStatus === "connecting" ? "Connecting…" : "Live updates offline"}</span><button className="primary-button compact" disabled={groupBusy || !groupPostDraft.trim()}>{groupBusy ? "Please wait…" : "Share post"} <span>→</span></button></div>
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
          <aside className="rightbar"><div className="right-card"><div className="eyebrow">CAMPUS SPOTLIGHT</div><h3>Good things happen when we connect.</h3><p>Find a study partner, share an opportunity or help someone settle into campus life.</p></div><div className="right-card soft"><div className="eyebrow">COMING TO CAMPUSCONNECT</div><p>Private-group invitations</p><p>Private direct messages</p><p>Campus events & announcements</p><p>Member notifications</p></div></aside>
          {notice && <div className="toast" role="status">{notice}</div>}
        </div>
      )}
      <footer className="footer">CampusConnect <span>·</span> Built for the UEW community <span>·</span> Ghana</footer>
    </main>
  );
}
