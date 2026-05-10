"use client";

import { useEffect, useRef, useState } from "react";
import { Channel, MessageInput, MessageList, Window, TypingIndicator } from "stream-chat-react";
import { StreamChat } from "stream-chat";
import { MessageSquare, X } from "lucide-react";

import "stream-chat-react/dist/css/v2/index.css";

interface Props {
    chatClient: StreamChat;
    meetingId: string;
    onClose: () => void;
}

export const CallChat = ({ chatClient, meetingId, onClose }: Props) => {
    const channelRef = useRef<ReturnType<typeof chatClient.channel> | null>(null);
    const [channelReady, setChannelReady] = useState(false);

    useEffect(() => {
        if (!chatClient) return;
        let watched = false;

        const channel = chatClient.channel("messaging", `meeting-${meetingId}`, {
            members: chatClient.userID ? [chatClient.userID] : [],
        });
        channelRef.current = channel;

        channel.watch()
            .then(() => {
                watched = true;
                setChannelReady(true);
            })
            .catch(console.error);

        return () => {
            if (watched) {
                channel.stopWatching().catch(console.error);
            }
        };
    }, [chatClient, meetingId]);

    return (
        <div className="w-80 flex flex-col bg-[#101213] border-l border-white/10 transition-all duration-300">
            {/* Sidebar header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                <div className="flex items-center gap-2">
                    <MessageSquare className="size-4 text-blue-400" />
                    <span className="font-semibold text-sm">Meeting Chat</span>
                </div>
                <button
                    onClick={onClose}
                    className="p-1 rounded-full hover:bg-white/10 transition"
                >
                    <X className="size-4" />
                </button>
            </div>

            {/* Stream Chat panel */}
            <div className="flex-1 overflow-hidden">
                {channelReady && channelRef.current ? (
                    <Channel channel={channelRef.current}>
                        <Window>
                            <MessageList />
                            <TypingIndicator />
                            <MessageInput focus />
                        </Window>
                    </Channel>
                ) : (
                    <div className="flex items-center justify-center h-full text-white/40 text-sm">
                        Connecting to chat…
                    </div>
                )}
            </div>
        </div>
    );
};
