"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
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
  description: string | null;
  avatar_path: string | null;
  avatarUrl: string | null;
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
  edited_at: string | null;
  deleted_at: string | null;
  parent_message_id?: string | null;
  attachmentUrls?: string[];
  reactions?: Array<{ emoji: string; count: number; reacted: boolean }>;
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
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [replyToMessage, setReplyToMessage] = useState<ChatMessage | null>(null);
  const [messageActionBusy, setMessageActionBusy] = useState(false);
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
  const [groupRenameOpen, setGroupRenameOpen] = useState(false);
  const [groupRenameDraft, setGroupRenameDraft] = useState("");
  const [groupSettingsBusy, setGroupSettingsBusy] = useState(false);
  const [groupDescriptionDraft, setGroupDescriptionDraft] = useState("");
  const [groupAvatarFile, setGroupAvatarFile] = useState<File | null>(null);
  const groupAvatarInput = useRef<HTMLInputElement>(null);
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
      .select("id,created_at,created_by,is_group,title,description,avatar_path")
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
      .select("id,conversation_id,sender_id,body,attachment_paths,created_at,edited_at,deleted_at")
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
      description: (row.description as string | null) ?? null,
      avatar_path: (row.avatar_path as string | null) ?? null,
      avatarUrl: null,
      members: memberMap.get(row.id as string) ?? [],
      lastMessage: latest.get(row.id as string) ?? null,
    })).sort((a, b) => new Date(b.lastMessage?.created_at ?? b.created_at).getTime() - new Date(a.lastMessage?.created_at ?? a.created_at).getTime());

    const hydratedResult = await Promise.all(result.map(async (conversation) => {
      if (!conversation.is_group || !conversation.avatar_path) return conversation;
      const { data: signed } = await supabase.storage.from("campus-group-avatars").createSignedUrl(conversation.avatar_path, 3600);
      return { ...conversation, avatarUrl: signed?.signedUrl ?? null };
    }));
    setConversations(hydratedResult);
    setListBusy(false);
  }, [supabase]);

  const loadThread = useCallback(async (conversationId: string) => {
    const { data, error } = await supabase
      .from("messages")
      .select("id,conversation_id,sender_id,body,attachment_paths,created_at,edited_at,deleted_at,parent_message_id")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) {
      setNotice(error.message);
      return;
    }
    const messages = (data ?? []) as ChatMessage[];
    const hydrated = await Promise.all(messages.map(async (message) => {
      const paths = message.deleted_at ? [] : (message.attachment_paths ?? []);
      if (!paths.length) return { ...message, attachmentUrls: [] };
      const urls = await Promise.all(paths.map(async (path) => {
        const { data: signed } = await supabase.storage.from(ATTACHMENT_BUCKET).createSignedUrl(path, 3600);
        return signed?.signedUrl ?? null;
      }));
      return { ...message, attachmentUrls: urls.filter((url): url is string => Boolean(url)) };
    }));
    const messageIds = hydrated.map((message) => message.id);
    const { data: reactionRows, error: reactionError } = messageIds.length
      ? await supabase.from("message_reactions").select("message_id,user_id,emoji").in("message_id", messageIds)
      : { data: [], error: null };
    if (reactionError) setNotice(reactionError.message);
    const reactionMap = new Map<string, Array<{ emoji: string; count: number; reacted: boolean }>>();
    (reactionRows ?? []).forEach((reaction) => {
      const current = reactionMap.get(reaction.message_id) ?? [];
      const existing = current.find((item) => item.emoji === reaction.emoji);
      if (existing) { existing.count += 1; existing.reacted ||= reaction.user_id === user.id; }
      else current.push({ emoji: reaction.emoji, count: 1, reacted: reaction.user_id === user.id });
      reactionMap.set(reaction.message_id, current);
    });
    setThreadMessages(hydrated.map((message) => ({ ...message, reactions: reactionMap.get(message.id) ?? [] })));
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
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, (payload) => {
        const message = payload.new as ChatMessage;
        if (message.conversation_id === activeConversationId) void loadThread(message.conversation_id);
        void loadConversations();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "message_reactions" }, () => {
        if (activeConversationId) void loadThread(activeConversationId);
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

  async function renameGroupConversation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeConversationId) return;
    const title = groupRenameDraft.trim();
    if (title.length < 3 || title.length > 60) { setNotice("Group names must contain 3 to 60 characters."); return; }
    setGroupSettingsBusy(true); setNotice("");
    try {
      const { error } = await supabase.rpc("rename_group_conversation", { target_conversation_id: activeConversationId, new_title: title });
      if (error) throw error;
      setGroupRenameOpen(false); setGroupRenameDraft("");
      await loadConversations();
      setNotice("Group name updated.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not rename this group."); }
    finally { setGroupSettingsBusy(false); }
  }

  async function saveGroupProfile(event?: FormEvent<HTMLFormElement>, removeAvatar = false) {
    event?.preventDefault();
    if (!activeConversationId || !activeConversation?.is_group) return;
    const description = groupDescriptionDraft.trim();
    if (description.length > 500) { setNotice("Group descriptions can be up to 500 characters."); return; }
    if (groupAvatarFile && (groupAvatarFile.size > 2 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(groupAvatarFile.type))) {
      setNotice("Choose a JPG, PNG or WebP image up to 2 MB."); return;
    }
    setGroupSettingsBusy(true); setNotice("");
    let uploadedPath: string | null = null;
    try {
      if (groupAvatarFile && !removeAvatar) {
        const extension = groupAvatarFile.type === "image/png" ? "png" : groupAvatarFile.type === "image/webp" ? "webp" : "jpg";
        uploadedPath = "groups/" + activeConversationId + "/" + crypto.randomUUID() + "." + extension;
        const { error: uploadError } = await supabase.storage.from("campus-group-avatars").upload(uploadedPath, groupAvatarFile, {
          contentType: groupAvatarFile.type, cacheControl: "3600", upsert: false,
        });
        if (uploadError) throw uploadError;
      }
      const update: { description: string | null; avatar_path?: string | null } = { description };
      if (uploadedPath) update.avatar_path = uploadedPath;
      if (removeAvatar) update.avatar_path = null;
      const { error } = await supabase.from("conversations").update(update).eq("id", activeConversationId).eq("is_group", true);
      if (error) throw error;
      const oldPath = activeConversation.avatar_path;
      if (oldPath && (uploadedPath || removeAvatar)) {
        await supabase.storage.from("campus-group-avatars").remove([oldPath]);
      }
      setGroupAvatarFile(null);
      if (groupAvatarInput.current) groupAvatarInput.current.value = "";
      await loadConversations();
      setNotice("Group profile updated.");
    } catch (error) {
      if (uploadedPath) await supabase.storage.from("campus-group-avatars").remove([uploadedPath]);
      setNotice(error instanceof Error ? error.message : "Could not update the group profile.");
    } finally { setGroupSettingsBusy(false); }
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

  async function saveMessageEdit(messageId: string) {
    const cleanBody = editDraft.trim();
    if (!cleanBody || cleanBody.length > 10000) { setNotice("Enter a message between 1 and 10,000 characters."); return; }
    setMessageActionBusy(true); setNotice("");
    try {
      const { error } = await supabase.from("messages").update({ body: cleanBody }).eq("id", messageId).eq("sender_id", user.id).is("deleted_at", null);
      if (error) throw error;
      setEditingMessageId(null); setEditDraft("");
      if (activeConversationId) await Promise.all([loadThread(activeConversationId), loadConversations()]);
      setNotice("Message updated.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "The message could not be edited."); }
    finally { setMessageActionBusy(false); }
  }

  async function deleteMessage(message: ChatMessage) {
    if (!window.confirm("Delete this message for everyone in the conversation?")) return;
    setMessageActionBusy(true); setNotice("");
    try {
      const { error } = await supabase.from("messages").update({ deleted_at: new Date().toISOString() }).eq("id", message.id).eq("sender_id", user.id).is("deleted_at", null);
      if (error) throw error;
      setEditingMessageId(null); setEditDraft("");
      if (message.attachment_paths.length) {
        const { error: cleanupError } = await supabase.storage.from(ATTACHMENT_BUCKET).remove(message.attachment_paths);
        if (cleanupError) setNotice("Message deleted. Its old image file could not be cleaned up automatically.");
      }
      if (activeConversationId) await Promise.all([loadThread(activeConversationId), loadConversations()]);
      setNotice((current) => current || "Message deleted.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "The message could not be deleted."); }
    finally { setMessageActionBusy(false); }
  }
  async function toggleMessageReaction(messageId: string, emoji: string) {
    const message = threadMessages.find((item) => item.id === messageId);
    if (!message || message.deleted_at) return;
    const existing = (message.reactions ?? []).some((reaction) => reaction.emoji === emoji && reaction.reacted);
    setThreadMessages((current) => current.map((item) => {
      if (item.id !== messageId) return item;
      const reactions = [...(item.reactions ?? [])];
      const index = reactions.findIndex((reaction) => reaction.emoji === emoji);
      if (existing) {
        if (index >= 0) {
          reactions[index] = { ...reactions[index], count: reactions[index].count - 1, reacted: false };
          if (reactions[index].count <= 0) reactions.splice(index, 1);
        }
      } else if (index >= 0) {
        reactions[index] = { ...reactions[index], count: reactions[index].count + 1, reacted: true };
      } else reactions.push({ emoji, count: 1, reacted: true });
      return { ...item, reactions };
    }));
    const result = existing
      ? await supabase.from("message_reactions").delete().eq("message_id", messageId).eq("user_id", user.id).eq("emoji", emoji)
      : await supabase.from("message_reactions").insert({ message_id: messageId, user_id: user.id, emoji });
    if (result.error) {
      setNotice(result.error.message);
      if (activeConversationId) void loadThread(activeConversationId);
    }
  }

  function renderMessage(message: ChatMessage, depth = 0): ReactNode {
    const replies = depth === 0 ? threadMessages.filter((item) => item.parent_message_id === message.id) : [];
    return <div key={message.id} className={"message-thread-item" + (depth > 0 ? " message-thread-reply" : "")}>
      <div className={message.sender_id === user.id ? "message-bubble mine" : "message-bubble"}>
        {depth > 0 && <span className="message-reply-context">↳ Reply</span>}
        {editingMessageId === message.id ? <form className="message-edit-form" onSubmit={(event) => { event.preventDefault(); void saveMessageEdit(message.id); }}>
          <textarea value={editDraft} onChange={(event) => setEditDraft(event.target.value)} maxLength={10000} aria-label="Edit message" autoFocus />
          <div><button type="submit" className="primary-button compact" disabled={messageActionBusy || !editDraft.trim()}>{messageActionBusy ? "Saving…" : "Save"}</button><button type="button" className="message-inline-action" disabled={messageActionBusy} onClick={() => { setEditingMessageId(null); setEditDraft(""); }}>Cancel</button></div>
        </form> : <p>{message.deleted_at ? "This message was deleted" : message.body}</p>}
        {!message.deleted_at && message.attachmentUrls?.map((url) => <a className="message-image-link" href={url} target="_blank" rel="noreferrer" key={url}><img className="message-image" src={url} alt="Image shared in this conversation" /></a>)}
        {!message.deleted_at && <div className="message-reactions">
          {(message.reactions ?? []).map((reaction) => <button type="button" key={reaction.emoji} className={"message-reaction" + (reaction.reacted ? " selected" : "")} aria-pressed={reaction.reacted} onClick={() => void toggleMessageReaction(message.id, reaction.emoji)}>{reaction.emoji} {reaction.count}</button>)}
          {["👍", "❤️", "😂", "🎉", "🙏", "🔥"].map((emoji) => <button type="button" key={emoji} className="message-reaction-add" aria-label={"React with " + emoji} title={"React with " + emoji} onClick={() => void toggleMessageReaction(message.id, emoji)}>{emoji}</button>)}
        </div>}
        <div className="message-meta-row"><time>{friendlyTime(message.created_at)}{message.edited_at && !message.deleted_at ? " · edited" : ""}</time>
          <div className="message-own-actions">
            {!message.deleted_at && <button type="button" onClick={() => setReplyToMessage(message)}>Reply</button>}
            {message.sender_id === user.id && !message.deleted_at && editingMessageId !== message.id && <><button type="button" disabled={messageActionBusy} onClick={() => { setEditingMessageId(message.id); setEditDraft(message.body); }}>Edit</button><button type="button" disabled={messageActionBusy} onClick={() => void deleteMessage(message)}>Delete</button></>}
          </div>
        </div>
        {message.id === lastOwnMessageId && <span className="message-read-receipt">{seenByCount > 0 ? (activeConversation?.is_group ? "Seen by " + seenByCount : "Seen") : "Sent"}</span>}
      </div>
      {replies.length > 0 && <div className="message-thread-children">{replies.map((reply) => renderMessage(reply, depth + 1))}</div>}
    </div>;
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
        parent_message_id: replyToMessage ? (replyToMessage.parent_message_id ?? replyToMessage.id) : null,
      });
      if (error) throw error;
      setMessageDraft("");
      setReplyToMessage(null);
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
              <span className="conversation-avatar">{conversation.is_group && conversation.avatarUrl ? <img src={conversation.avatarUrl} alt="" /> : conversation.is_group ? "GC" : initials(title)}</span>
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
              {activeConversation?.is_group && <button type="button" className="message-manage-toggle" onClick={() => { setGroupDescriptionDraft(activeConversation?.description ?? ""); setGroupAvatarFile(null); setManageMembersOpen((open) => !open); }}>{manageMembersOpen ? "Close members" : "Manage members"}</button>}
            </div>
            {activeConversation?.is_group && <div className="group-profile-summary">
              <span className="group-profile-summary-avatar">{activeConversation.avatarUrl ? <img src={activeConversation.avatarUrl} alt={activeTitle + " group photo"} /> : initials(activeTitle)}</span>
              <div><strong>{activeTitle}</strong><p>{activeConversation.description || "No group description has been added yet."}</p></div>
            </div>}
            {activeConversation?.is_group && manageMembersOpen && <section className="group-member-manager">
              <div className="group-member-manager-heading">
                <div><strong>Group members</strong><span>{activeConversation.members.length} of 20 members</span></div>
                <span className="group-manager-role">{currentGroupRole === "owner" ? "Owner" : currentGroupRole === "admin" ? "Administrator" : "Member"}</span>
              </div>
              {canManageGroupMembers && <div className="group-settings-panel">
                <div><strong>Group settings</strong><span>Manage the group profile and membership</span></div>
                {!groupRenameOpen ? <button type="button" className="message-manage-toggle" onClick={() => { setGroupRenameDraft(activeConversation?.title ?? ""); setGroupRenameOpen(true); }}>Rename group</button> : <form className="group-rename-form" onSubmit={(event) => void renameGroupConversation(event)}>
                  <input value={groupRenameDraft} onChange={(event) => setGroupRenameDraft(event.target.value)} minLength={3} maxLength={60} aria-label="New group name" placeholder="Enter a group name" required />
                  <button type="submit" className="primary-button compact" disabled={groupSettingsBusy || groupRenameDraft.trim().length < 3}>{groupSettingsBusy ? "Saving…" : "Save name"}</button>
                  <button type="button" className="message-inline-action" disabled={groupSettingsBusy} onClick={() => { setGroupRenameOpen(false); setGroupRenameDraft(""); }}>Cancel</button>
                </form>}
                <form className="group-profile-form" onSubmit={(event) => void saveGroupProfile(event)}>
                  <label>Group description
                    <textarea value={groupDescriptionDraft} onChange={(event) => setGroupDescriptionDraft(event.target.value)} maxLength={500} rows={3} placeholder="What is this group about?" />
                    <small>{groupDescriptionDraft.length}/500 characters</small>
                  </label>
                  <label>Group profile photo
                    <input ref={groupAvatarInput} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setGroupAvatarFile(event.target.files?.[0] ?? null)} />
                    <small>JPG, PNG or WebP · maximum 2 MB</small>
                  </label>
                  {groupAvatarFile && <span className="group-avatar-selected">Selected: {groupAvatarFile.name}</span>}
                  <div className="group-profile-actions">
                    <button type="submit" className="primary-button compact" disabled={groupSettingsBusy || groupDescriptionDraft.trim().length > 500}>{groupSettingsBusy ? "Saving…" : "Save profile"}</button>
                    {activeConversation?.avatar_path && <button type="button" className="message-inline-action" disabled={groupSettingsBusy} onClick={() => void saveGroupProfile(undefined, true)}>Remove photo</button>}
                  </div>
                </form>
              </div>}
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
              {threadMessages.filter((message) => !message.parent_message_id).length === 0 ? <div className="message-thread-empty">Say hello and start the conversation.</div> : threadMessages.filter((message) => !message.parent_message_id).map((message) => renderMessage(message))}
              <div ref={threadEnd} />
            </div>
            <div className="message-typing-indicator" aria-live="polite" aria-atomic="true">
              {typingUsers.length > 0 && <><span className="typing-dots"><i /><i /><i /></span><span>{typingUsers.length === 1 ? typingUsers[0].display_name + " is typing…" : typingUsers.length === 2 ? typingUsers[0].display_name + " and " + typingUsers[1].display_name + " are typing…" : typingUsers.length + " people are typing…"}</span></>}
            </div>
            {replyToMessage && <div className="message-replying-to"><div><strong>Replying to {replyToMessage.sender_id === user.id ? "yourself" : activeConversation?.members.find((member) => member.user_id === replyToMessage.sender_id)?.display_name ?? "UEW member"}</strong><span>{replyToMessage.deleted_at ? "Message deleted" : replyToMessage.body}</span></div><button type="button" onClick={() => setReplyToMessage(null)} aria-label="Cancel reply">×</button></div>}
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
