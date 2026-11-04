"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";

type ReadMarker = { user_id: string; last_read_at: string | null };

type Profile = {
  user_id: string;
  display_name: string;
  username: string;
  avatar_path: string | null;
};

type GroupMember = Profile & { role: "owner" | "admin" | "member" };

type Conversation = {
  id: string;
  created_at: string;
  created_by: string;
  is_group: boolean;
  title: string | null;
  members: GroupMember[];
  lastMessage: ChatMessage | null;
};

type ChatMessage = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  attachment_paths: string[];
  created_at: string;
  attachmentUrls?: string[];
};

type MessagingWorkspaceProps = {
  supabase: SupabaseClient;
  user: User;
};

const ATTACHMENT_BUCKET = "campus-message-attachments";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function initials(value: string) {
  return value.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "U";
}

function friendlyTime(value: string) {
  return new Intl.DateTimeFormat("en-GH", { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

export default function MessagingWorkspace({ supabase, user }: MessagingWorkspaceProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [threadMessages, setThreadMessages] = useState<ChatMessage[]>([]);
  const [readMarkers, setReadMarkers] = useState<ReadMarker[]>([]);
  const [typingUsers, setTypingUsers] = useState<Array<{ user_id: string; display_name: string }>>([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [memberResult, setMemberResult] = useState<Profile | null>(null);
  const [searchBusy, setSearchBusy] = useState(false);
  const [messageDraft, setMessageDraft] = useState("");
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [messageBusy, setMessageBusy] = useState(false);
  const [groupFormOpen, setGroupFormOpen] = useState(false);
  const [groupTitle, setGroupTitle] = useState("");
  const [groupSearch, setGroupSearch] = useState("");
  const [groupSearchResult, setGroupSearchResult] = useState<Profile | null>(null);
  const [groupMembers, setGroupMembers] = useState<Profile[]>([]);
  const [groupBusy, setGroupBusy] = useState(false);
  const [manageMembersOpen, setManageMembersOpen] = useState(false);
  const [manageMemberSearch, setManageMemberSearch] = useState("");
  const [manageMemberResult, setManageMemberResult] = useState<Profile | null>(null);
  const [manageBusy, setManageBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [listBusy, setListBusy] = useState(false);
  const imageInput = useRef<HTMLInputElement>(null);
  const threadEnd = useRef<HTMLDivElement>(null);
  const typingChannelRef = useRef<ReturnType<SupabaseClient["channel"]> | null>(null);
  const typingStopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadConversations = useCallback(async () => {
    setListBusy(true);
    const { data: rows, error } = await supabase
      .from("conversations")
      .select("id,created_at,created_by,is_group,title")
      .order("created_at", { ascending: false })
      .limit(60);
    if (error) {
      setNotice(error.message);
      setListBusy(false);
      return;
    }
    const ids = (rows ?? []).map((row) => row.id as string);
    if (!ids.length) {
      setConversations([]);
      setListBusy(false);
      return;
    }

    const { data: memberRows, error: membersError } = await supabase
      .from("conversation_members")
      .select("conversation_id,user_id,role")
      .in("conversation_id", ids);
    if (membersError) {
      setNotice(membersError.message);
      setListBusy(false);
      return;
    }

    const userIds = [...new Set((memberRows ?? []).map((row) => row.user_id as string))];
    const { data: people, error: peopleError } = await supabase
      .from("profiles")
      .select("user_id,display_name,username,avatar_path")
      .in("user_id", userIds);
    if (peopleError) {
      setNotice(peopleError.message);
      setListBusy(false);
      return;
    }
    const peopleMap = new Map<string, Profile>();
    ((people ?? []) as Profile[]).forEach((person) => peopleMap.set(person.user_id, person));

    const { data: messageRows, error: messagesError } = await supabase
      .from("messages")
      .select("id,conversation_id,sender_id,body,attachment_paths,created_at")
      .in("conversation_id", ids)
      .order("created_at", { ascending: false })
      .limit(500);
    if (messagesError) {
      setNotice(messagesError.message);
      setListBusy(false);
      return;
    }
    const latest = new Map<string, ChatMessage>();
    ((messageRows ?? []) as ChatMessage[]).forEach((message) => {
      if (!latest.has(message.conversation_id)) latest.set(message.conversation_id, message);
    });

    const memberMap = new Map<string, GroupMember[]>();
    (memberRows ?? []).forEach((row) => {
      const person = peopleMap.get(row.user_id as string);
      if (!person) return;
      const member = { ...person, role: (row.role as GroupMember["role"]) || "member" };
      memberMap.set(row.conversation_id as string, [...(memberMap.get(row.conversation_id as string) ?? []), member]);
    });

    const result: Conversation[] = (rows ?? []).map((row) => ({
      id: row.id as string,
      created_at: row.created_at as string,
      created_by: row.created_by as string,
      is_group: Boolean(row.is_group),
      title: (row.title as string | null) ?? null,
      members: memberMap.get(row.id as string) ?? [],
      lastMessage: latest.get(row.id as string) ?? null,
    })).sort((a, b) => new Date(b.lastMessage?.created_at ?? b.created_at).getTime() - new Date(a.lastMessage?.created_at ?? a.created_at).getTime());

    setConversations(result);
    setListBusy(false);
  }, [supabase]);

  const loadThread = useCallback(async (conversationId: string) => {
    const { data, error } = await supabase
      .from("messages")
      .select("id,conversation_id,sender_id,body,attachment_paths,created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) {
      setNotice(error.message);
      return;
    }
    const messages = (data ?? []) as ChatMessage[];
    const hydrated = await Promise.all(messages.map(async (message) => {
      const paths = message.attachment_paths ?? [];
      if (!paths.length) return { ...message, attachmentUrls: [] };
      const urls = await Promise.all(paths.map(async (path) => {
        const { data: signed } = await supabase.storage.from(ATTACHMENT_BUCKET).createSignedUrl(path, 3600);
        return signed?.signedUrl ?? null;
      }));
      return { ...message, attachmentUrls: urls.filter((url): url is string => Boolean(url)) };
    }));
    setThreadMessages(hydrated);
    const readAt = new Date().toISOString();
    const { error: markError } = await supabase.from("conversation_members")
      .update({ last_read_at: readAt })
      .eq("conversation_id", conversationId)
      .eq("user_id", user.id);
    if (markError) setNotice(markError.message);
    const { data: markers, error: markerError } = await supabase
      .from("conversation_members")
      .select("user_id,last_read_at")
      .eq("conversation_id", conversationId);
    if (markerError) setNotice(markerError.message);
    else setReadMarkers((markers ?? []) as ReadMarker[]);
  }, [supabase, user.id]);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (activeConversationId) void loadThread(activeConversationId);
  }, [activeConversationId, loadThread]);

  useEffect(() => {
    threadEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [threadMessages]);

  useEffect(() => {
    const channel = supabase.channel("campusconnect-messages-ui-" + user.id)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        const message = payload.new as ChatMessage;
        if (message.conversation_id === activeConversationId) void loadThread(message.conversation_id);
        void loadConversations();
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [supabase, user.id, activeConversationId, loadConversations, loadThread]);


  const activeConversation = conversations.find((conversation) => conversation.id === activeConversationId) ?? null;
  const typingDisplayName = activeConversation?.members.find((member) => member.user_id === user.id)?.display_name ?? "UEW member";

  useEffect(() => {
    if (!activeConversationId) {
      setTypingUsers([]);
      return;
    }

    const channel = supabase.channel(
      "campusconnect:conversation:" + activeConversationId,
      { config: { private: true, presence: { key: user.id } } }
    );
    typingChannelRef.current = channel;

    channel.on("presence", { event: "sync" }, () => {
      const presence = channel.presenceState() as Record<string, Array<{
        user_id?: string;
        display_name?: string;
        typing?: boolean;
      }>>;
      const activeTypers = Object.values(presence).flat()
        .filter((entry) => entry.user_id && entry.user_id !== user.id && entry.typing)
        .map((entry) => ({
          user_id: entry.user_id as string,
          display_name: entry.display_name || "A UEW member",
        }));
      setTypingUsers(activeTypers);
    });

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        void channel.track({ user_id: user.id, display_name: typingDisplayName, typing: false });
      }
    });

    return () => {
      if (typingStopTimer.current) clearTimeout(typingStopTimer.current);
      typingStopTimer.current = null;
      typingChannelRef.current = null;
      setTypingUsers([]);
      void supabase.removeChannel(channel);
    };
  }, [supabase, activeConversationId, user.id, typingDisplayName]);

  function updateTypingPresence(isTyping: boolean) {
    const channel = typingChannelRef.current;
    if (!channel) return;
    if (typingStopTimer.current) clearTimeout(typingStopTimer.current);
    typingStopTimer.current = null;
    void channel.track({
      user_id: user.id,
      display_name: typingDisplayName,
      typing: isTyping,
    });
    if (isTyping) {
      typingStopTimer.current = setTimeout(() => {
        void channel.track({
          user_id: user.id,
          display_name: typingDisplayName,
          typing: false,
        });
        typingStopTimer.current = null;
      }, 1600);
    }
  }

  const lastOwnMessageId = [...threadMessages].reverse().find((message) => message.sender_id === user.id)?.id ?? null;
  const seenByCount = readMarkers.filter((marker) => {
    const readAt = marker.last_read_at;
    if (marker.user_id === user.id || !readAt || !lastOwnMessageId) return false;
    const lastOwnMessage = threadMessages.find((message) => message.id === lastOwnMessageId);
    return Boolean(lastOwnMessage) && new Date(readAt).getTime() >= new Date(lastOwnMessage!.created_at).getTime();
  }).length;
  const currentGroupRole = activeConversation?.members.find((member) => member.user_id === user.id)?.role ?? null;
  const canManageGroupMembers = activeConversation?.is_group && (currentGroupRole === "owner" || currentGroupRole === "admin");
  const isGroupOwner = currentGroupRole === "owner";
  const activeTitle = activeConversation
    ? activeConversation.is_group
      ? activeConversation.title || "Campus group chat"
      : activeConversation.members.find((member) => member.user_id !== user.id)?.display_name || "UEW member"
    : "Your private conversations";

  async function searchMember(username: string, setter: (profile: Profile | null) => void, setBusy: (busy: boolean) => void) {
    const handle = username.trim().replace(/^@/, "").toLowerCase();
    if (!handle) return;
    setBusy(true);
    setter(null);
    setNotice("");
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id,display_name,username,avatar_path")
        .eq("username", handle)
        .maybeSingle();
      if (error) throw error;
      if (!data || data.user_id === user.id) throw new Error("No other UEW member was found with that username.");
      setter(data as Profile);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Member search failed.");
    } finally {
      setBusy(false);
    }
  }

  async function startDirectConversation(person: Profile) {
    setMessageBusy(true);
    setNotice("");
    try {
      const { data, error } = await supabase.rpc("open_direct_conversation", { target_user_id: person.user_id });
      if (error) throw error;
      const id = data as string;
      setMemberResult(null);
      setMemberSearch("");
      await loadConversations();
      setActiveConversationId(id);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not open this conversation.");
    } finally {
      setMessageBusy(false);
    }
  }

  function addGroupMember(person: Profile) {
    if (groupMembers.some((member) => member.user_id === person.user_id)) {
      setNotice("That member is already on the group list.");
      return;
    }
    if (groupMembers.length >= 19) {
      setNotice("A group can have up to 20 members, including you.");
      return;
    }
    setGroupMembers((current) => [...current, person]);
    setGroupSearchResult(null);
    setGroupSearch("");
    setNotice("");
  }

  async function createGroupConversation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!groupTitle.trim() || groupMembers.length < 1) {
      setNotice("Add a group name and at least one other verified UEW member.");
      return;
    }
    setGroupBusy(true);
    setNotice("");
    try {
      const { data, error } = await supabase.rpc("create_group_conversation", {
        target_user_ids: groupMembers.map((member) => member.user_id),
        conversation_title: groupTitle.trim(),
      });
      if (error) throw error;
      const id = data as string;
      setGroupFormOpen(false);
      setGroupTitle("");
      setGroupMembers([]);
      setGroupSearch("");
      setGroupSearchResult(null);
      await loadConversations();
      setActiveConversationId(id);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not create the group chat.");
    } finally {
      setGroupBusy(false);
    }
  }

  async function manageGroupMember(targetUserId: string, action: "add" | "remove" | "leave") {
    if (!activeConversationId) return;
    setManageBusy(true);
    setNotice("");
    try {
      const { error } = await supabase.rpc("manage_group_conversation_member", {
        target_conversation_id: activeConversationId,
        target_user_id: targetUserId,
        action,
      });
      if (error) throw error;
      setManageMemberResult(null);
      setManageMemberSearch("");
      await loadConversations();
      if (action === "leave") setActiveConversationId(null);
      else await loadThread(activeConversationId);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not update group membership.");
    } finally {
      setManageBusy(false);
    }
  }

  async function changeGroupAdmin(targetUserId: string, makeAdmin: boolean) {
    if (!activeConversationId) return;
    setManageBusy(true);
    setNotice("");
    try {
      const { error } = await supabase.rpc("set_group_conversation_admin", {
        target_conversation_id: activeConversationId,
        target_user_id: targetUserId,
        make_admin: makeAdmin,
      });
      if (error) throw error;
      await loadConversations();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not update administrator role.");
    } finally {
      setManageBusy(false);
    }
  }

  async function transferGroupOwnership(targetUserId: string) {
    if (!activeConversationId || !window.confirm("Transfer ownership of this group? You will become an administrator.")) return;
    setManageBusy(true);
    setNotice("");
    try {
      const { error } = await supabase.rpc("transfer_group_conversation_ownership", {
        target_conversation_id: activeConversationId,
        target_user_id: targetUserId,
      });
      if (error) throw error;
      await loadConversations();
      setManageMembersOpen(false);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not transfer group ownership.");
    } finally {
      setManageBusy(false);
    }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeConversationId || (!messageDraft.trim() && !selectedImage)) return;
    setMessageBusy(true);
    setNotice("");
    let uploadedPath: string | null = null;
    try {
      let attachmentPaths: string[] = [];
      if (selectedImage) {
        if (selectedImage.size > MAX_IMAGE_BYTES) throw new Error("Choose an image smaller than 5 MB.");
        if (!["image/jpeg", "image/png", "image/webp"].includes(selectedImage.type)) {
          throw new Error("Use a JPG, PNG or WebP image.");
        }
        const extension = selectedImage.type === "image/jpeg" ? "jpg" : selectedImage.type.split("/")[1];
        uploadedPath = activeConversationId + "/" + user.id + "/" + crypto.randomUUID() + "." + extension;
        const { error: uploadError } = await supabase.storage.from(ATTACHMENT_BUCKET)
          .upload(uploadedPath, selectedImage, { contentType: selectedImage.type, upsert: false });
        if (uploadError) throw uploadError;
        attachmentPaths = [uploadedPath];
      }

      const { error } = await supabase.from("messages").insert({
        conversation_id: activeConversationId,
        sender_id: user.id,
        body: messageDraft.trim() || (attachmentPaths.length ? "Shared a photo" : ""),
        attachment_paths: attachmentPaths,
      });
      if (error) throw error;
      setMessageDraft("");
      updateTypingPresence(false);
      setSelectedImage(null);
      if (imageInput.current) imageInput.current.value = "";
      await Promise.all([loadThread(activeConversationId), loadConversations()]);
    } catch (error) {
      if (uploadedPath) {
        await supabase.storage.from(ATTACHMENT_BUCKET).remove([uploadedPath]);
      }
      setNotice(error instanceof Error ? error.message : "Your message could not be sent.");
    } finally {
      setMessageBusy(false);
    }
  }

  return (
    <div className="messages-view">
      <div className="feed-heading">
        <div>
          <div className="eyebrow">PRIVATE CAMPUS CHATS</div>
          <h1>Messages</h1>
          <p className="muted">Private chats with verified UEW members, classmates and groups.</p>
        </div>
        <div className="campus-pill"><span /> PRIVATE</div>
      </div>

      {notice && <p className="notice" role="status">{notice}</p>}

      <div className="messaging-actions">
        <form className="message-search-card card" onSubmit={(event) => { event.preventDefault(); void searchMember(memberSearch, setMemberResult, setSearchBusy); }}>
          <label htmlFor="message-member-search">Start a one-to-one conversation</label>
          <div className="message-search-row">
            <input id="message-member-search" value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} placeholder="Search exact username, e.g. ama_owusu" />
            <button className="primary-button compact" disabled={searchBusy || !memberSearch.trim()}>{searchBusy ? "Searching…" : "Find member"}</button>
          </div>
          {memberResult && <div className="message-member-result">
            <div><strong>{memberResult.display_name}</strong><span>@{memberResult.username}</span></div>
            <button type="button" className="primary-button compact" disabled={messageBusy} onClick={() => void startDirectConversation(memberResult)}>Message</button>
          </div>}
        </form>

        <button type="button" className="profile-edit-button group-chat-toggle" onClick={() => setGroupFormOpen((open) => !open)}>
          {groupFormOpen ? "Close group form" : "＋ Create group chat"}
        </button>
      </div>

      {groupFormOpen && <form className="group-chat-form card" onSubmit={createGroupConversation}>
        <div><strong>Start a group conversation</strong><p className="muted">Choose a name and add verified UEW members by username.</p></div>
        <label>Group name<input required minLength={2} maxLength={80} value={groupTitle} onChange={(event) => setGroupTitle(event.target.value)} placeholder="e.g. Level 300 Study Circle" /></label>
        <div className="message-search-row">
          <input value={groupSearch} onChange={(event) => setGroupSearch(event.target.value)} placeholder="Find a member by username" aria-label="Find a group member by username" />
          <button type="button" className="profile-edit-button" disabled={searchBusy || !groupSearch.trim()} onClick={() => void searchMember(groupSearch, setGroupSearchResult, setSearchBusy)}>Find member</button>
        </div>
        {groupSearchResult && <div className="message-member-result">
          <div><strong>{groupSearchResult.display_name}</strong><span>@{groupSearchResult.username}</span></div>
          <button type="button" className="primary-button compact" onClick={() => addGroupMember(groupSearchResult)}>Add member</button>
        </div>}
        {groupMembers.length > 0 && <div className="group-chat-member-list">
          {groupMembers.map((member) => <span key={member.user_id}>{member.display_name} <button type="button" aria-label={"Remove " + member.display_name} onClick={() => setGroupMembers((current) => current.filter((item) => item.user_id !== member.user_id))}>×</button></span>)}
        </div>}
        <button className="primary-button compact" disabled={groupBusy || !groupTitle.trim() || groupMembers.length < 1}>{groupBusy ? "Creating…" : "Create group conversation"}</button>
      </form>}

      <div className="message-workspace card">
        <section className="conversation-list">
          <div className="groups-section-heading"><h2>Your chats</h2><span>{conversations.length}</span></div>
          {listBusy && conversations.length === 0 ? <p className="message-empty-copy">Loading conversations…</p> : conversations.length === 0 ? <p className="message-empty-copy">No conversations yet. Search for a UEW username or create a group chat.</p> : conversations.map((conversation) => {
            const peer = conversation.members.find((member) => member.user_id !== user.id);
            const title = conversation.is_group ? conversation.title || "Campus group chat" : peer?.display_name || "UEW member";
            const preview = conversation.lastMessage
              ? (conversation.lastMessage.sender_id === user.id ? "You: " : "") + (conversation.lastMessage.attachment_paths?.length ? "📷 " : "") + conversation.lastMessage.body
              : conversation.is_group ? "Group conversation created" : "Start the conversation";
            return <button type="button" className={activeConversationId === conversation.id ? "conversation-item active" : "conversation-item"} key={conversation.id} onClick={() => setActiveConversationId(conversation.id)}>
              <span className="conversation-avatar">{conversation.is_group ? "GC" : initials(title)}</span>
              <span className="conversation-item-copy">
                <strong>{title}</strong>
                <small>{conversation.is_group ? conversation.members.length + " members" : "@" + (peer?.username || "campusmember")}</small>
                <span>{preview}</span>
              </span>
            </button>;
          })}
        </section>

        <section className="message-thread">
          {activeConversationId ? <>
            <div className="message-thread-heading">
              <div className="message-thread-title">
                <strong>{activeTitle}</strong>
                <span>{activeConversation?.is_group ? "Group conversation · " + activeConversation.members.length + " members" : "Private one-to-one conversation"}</span>
              </div>
              {activeConversation?.is_group && <button type="button" className="message-manage-toggle" onClick={() => setManageMembersOpen((open) => !open)}>{manageMembersOpen ? "Close members" : "Manage members"}</button>}
            </div>
            {activeConversation?.is_group && manageMembersOpen && <section className="group-member-manager">
              <div className="group-member-manager-heading">
                <div><strong>Group members</strong><span>{activeConversation.members.length} of 20 members</span></div>
                <span className="group-manager-role">{currentGroupRole === "owner" ? "Owner" : currentGroupRole === "admin" ? "Administrator" : "Member"}</span>
              </div>
              {canManageGroupMembers && <form className="group-member-add" onSubmit={(event) => { event.preventDefault(); void searchMember(manageMemberSearch, setManageMemberResult, setSearchBusy); }}>
                <input value={manageMemberSearch} onChange={(event) => setManageMemberSearch(event.target.value)} placeholder="Find a verified UEW member by username" aria-label="Search member to add" />
                <button type="submit" className="primary-button compact" disabled={searchBusy || !manageMemberSearch.trim()}>Find</button>
              </form>}
              {manageMemberResult && <div className="message-member-result">
                <div><strong>{manageMemberResult.display_name}</strong><span>@{manageMemberResult.username}</span></div>
                <button type="button" className="primary-button compact" disabled={manageBusy} onClick={() => void manageGroupMember(manageMemberResult.user_id, "add")}>Add to group</button>
              </div>}
              <div className="group-member-list">
                {activeConversation.members.map((member) => <div className="group-member-row" key={member.user_id}>
                  <span className="conversation-avatar">{initials(member.display_name)}</span>
                  <span className="group-member-name"><strong>{member.display_name}{member.user_id === user.id ? " (you)" : ""}</strong><small>@{member.username}</small></span>
                  <span className={"group-member-role " + member.role}>{member.role}</span>
                  {isGroupOwner && member.role !== "owner" && <div className="group-member-actions">
                    <button type="button" disabled={manageBusy} onClick={() => void changeGroupAdmin(member.user_id, member.role !== "admin")}>{member.role === "admin" ? "Remove admin" : "Make admin"}</button>
                    <button type="button" disabled={manageBusy} onClick={() => void transferGroupOwnership(member.user_id)}>Make owner</button>
                    <button type="button" disabled={manageBusy} onClick={() => void manageGroupMember(member.user_id, "remove")}>Remove</button>
                  </div>}
                  {currentGroupRole === "admin" && member.role === "member" && <button type="button" className="group-member-remove" disabled={manageBusy} onClick={() => void manageGroupMember(member.user_id, "remove")}>Remove</button>}
                </div>)}
              </div>
              {currentGroupRole && currentGroupRole !== "owner" && <button type="button" className="group-leave-button" disabled={manageBusy} onClick={() => { if (window.confirm("Leave this group conversation?")) void manageGroupMember(user.id, "leave"); }}>Leave group</button>}
              {isGroupOwner && <p className="group-owner-note">As owner, you can add or remove members, appoint administrators, and transfer ownership. Administrators can manage regular members.</p>}
            </section>}
            <div className="message-thread-body">
              {threadMessages.length === 0 ? <div className="message-thread-empty">Say hello and start the conversation.</div> : threadMessages.map((message) => <div key={message.id} className={message.sender_id === user.id ? "message-bubble mine" : "message-bubble"}>
                <p>{message.body}</p>
                {message.attachmentUrls?.map((url) => <a className="message-image-link" href={url} target="_blank" rel="noreferrer" key={url}><img className="message-image" src={url} alt="Image shared in this conversation" /></a>)}
                <time>{friendlyTime(message.created_at)}</time>
                {message.id === lastOwnMessageId && <span className="message-read-receipt">{seenByCount > 0 ? (activeConversation?.is_group ? "Seen by " + seenByCount : "Seen") : "Sent"}</span>}
              </div>)}
              <div ref={threadEnd} />
            </div>
            <div className="message-typing-indicator" aria-live="polite" aria-atomic="true">
              {typingUsers.length > 0 && <><span className="typing-dots"><i /><i /><i /></span><span>{typingUsers.length === 1 ? typingUsers[0].display_name + " is typing…" : typingUsers.length === 2 ? typingUsers[0].display_name + " and " + typingUsers[1].display_name + " are typing…" : typingUsers.length + " people are typing…"}</span></>}
            </div>
            <form className="message-compose" onSubmit={sendMessage}>
              <input value={messageDraft} onChange={(event) => { setMessageDraft(event.target.value); updateTypingPresence(Boolean(event.target.value.trim())); }} onBlur={() => updateTypingPresence(false)} maxLength={10000} placeholder="Write a message…" aria-label="Write a message" />
              <input ref={imageInput} className="message-image-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setSelectedImage(event.target.files?.[0] ?? null)} aria-label="Attach an image" />
              <button type="button" className="message-attach-button" onClick={() => imageInput.current?.click()} title="Attach an image">＋ Photo</button>
              <button className="primary-button compact" disabled={messageBusy || (!messageDraft.trim() && !selectedImage)}>{messageBusy ? "Sending…" : "Send"} <span>→</span></button>
            </form>
            {selectedImage && <div className="message-selected-image">Selected: {selectedImage.name} <button type="button" onClick={() => { setSelectedImage(null); if (imageInput.current) imageInput.current.value = ""; }}>Remove</button></div>}
          </> : <div className="message-thread-placeholder"><span>✉</span><strong>Your private conversations</strong><p>Choose a chat, find a UEW member or create a group to begin.</p></div>}
        </section>
      </div>
    </div>
  );
}
