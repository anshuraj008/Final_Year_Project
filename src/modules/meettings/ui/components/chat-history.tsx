"use client";

import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { StreamChat, Channel as StreamChatChannel, MessageResponse } from "stream-chat";

import { useTRPC } from "@/trpc/client";
import { LoadingState } from "@/components/loading-state";
import { GeneratedAvatar } from "@/components/generated-avatar";
import { format } from "date-fns";
import { MessageSquareIcon } from "lucide-react";

interface Props {
    meetingId: string;
    userId: string;
    userName: string;
    userImage: string;
}

export const ChatHistory = ({ meetingId, userId, userName, userImage }: Props) => {
    const trpc = useTRPC();
    const { mutateAsync: generateChatToken } = useMutation(
        trpc.meetings.generateChatToken.mutationOptions(),
    );

    const [messages, setMessages] = useState<MessageResponse[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let chatClient: StreamChat | null = null;

        const loadMessages = async () => {
            try {
                setLoading(true);
                const token = await generateChatToken();

                chatClient = StreamChat.getInstance(
                    process.env.NEXT_PUBLIC_STREAM_API_KEY!,
                );

                await chatClient.connectUser(
                    { id: userId, name: userName, image: userImage },
                    token,
                );

                const channel = chatClient.channel("messaging", `meeting-${meetingId}`);

                // Query channel messages (read-only, no need to watch)
                const state = await channel.query({
                    messages: { limit: 300 },
                });

                setMessages(state.messages || []);
            } catch (err) {
                console.error("Failed to load chat history:", err);
                setError("Could not load chat history");
            } finally {
                setLoading(false);
            }
        };

        loadMessages();

        return () => {
            if (chatClient) {
                chatClient.disconnectUser().catch(console.error);
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [meetingId, userId]);

    if (loading) {
        return (
            <LoadingState
                title="Loading Chat History"
                description="Fetching meeting chat messages..."
            />
        );
    }

    if (error) {
        return (
            <div className="bg-white rounded-lg border px-4 py-8 text-center">
                <p className="text-muted-foreground">{error}</p>
            </div>
        );
    }

    if (messages.length === 0) {
        return (
            <div className="bg-white rounded-lg border px-4 py-12 text-center">
                <MessageSquareIcon className="size-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-muted-foreground font-medium">No chat messages</p>
                <p className="text-muted-foreground/70 text-sm mt-1">
                    No messages were sent during this meeting.
                </p>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-lg border overflow-hidden">
            <div className="px-4 py-3 border-b bg-muted/30 flex items-center gap-2">
                <MessageSquareIcon className="size-4 text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground">
                    {messages.length} message{messages.length !== 1 ? "s" : ""}
                </span>
            </div>
            <div className="divide-y max-h-[calc(100vh-20rem)] overflow-y-auto">
                {messages.map((msg) => (
                    <div key={msg.id} className="px-4 py-3 flex gap-3 hover:bg-muted/20 transition-colors">
                        <div className="shrink-0 pt-0.5">
                            {msg.user?.image ? (
                                <img
                                    src={msg.user.image}
                                    alt={msg.user.name || "User"}
                                    className="size-8 rounded-full object-cover"
                                />
                            ) : (
                                <GeneratedAvatar
                                    variant="initials"
                                    seed={msg.user?.name || "Unknown"}
                                    className="size-8"
                                />
                            )}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-2">
                                <span className="font-medium text-sm truncate">
                                    {msg.user?.name || "Unknown"}
                                </span>
                                {msg.created_at && (
                                    <span className="text-xs text-muted-foreground shrink-0">
                                        {format(new Date(msg.created_at), "h:mm a")}
                                    </span>
                                )}
                            </div>
                            <p className="text-sm text-foreground/80 mt-0.5 whitespace-pre-wrap break-words">
                                {msg.text}
                            </p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
