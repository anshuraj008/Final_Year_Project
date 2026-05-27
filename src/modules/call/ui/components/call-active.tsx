"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useEffect } from "react";
import { CallControls, SpeakerLayout, PaginatedGridLayout, DefaultParticipantViewUI, useCallStateHooks } from "@stream-io/video-react-sdk";
import { LayoutGrid, User, Copy, Check, MessageSquare } from "lucide-react";
import { StreamChat } from "stream-chat";
import { CallChat } from "./call-chat";
import { OpenAIChatbox } from "./openai-chatbox";
import { useTRPC } from "@/trpc/client";
import { useQuery } from "@tanstack/react-query";

import "stream-chat-react/dist/css/v2/index.css";

interface Props {
    onLeave: () => void;
    meetingName: string;
    meetingId: string;
    chatClient: StreamChat;
}

export const CallActive = ({ onLeave, meetingName, meetingId, chatClient }: Props) => {
    const trpc = useTRPC();
    const { useLocalParticipant } = useCallStateHooks();
    const localParticipant = useLocalParticipant();
    const currentUserId = localParticipant?.userId;

    const { data: meeting } = useQuery(
        trpc.meetings.getOne.queryOptions({ id: meetingId }),
    );

    const isOriginalHost = meeting ? meeting.userId === currentUserId : false;
    const isCoHost = meeting?.coHostIds ? meeting.coHostIds.includes(currentUserId ?? "") : false;
    const isHostOrCoHost = isOriginalHost || isCoHost;

    useEffect(() => {
        if (isHostOrCoHost) return;

        const observer = new MutationObserver(() => {
            // Find all buttons or elements that might be menu items inside popovers or dropdowns
            const items = document.querySelectorAll(
                ".str-video__menu-container button, [class*='menu-item'], .str-video__menu-item, [role='menuitem']"
            );

            items.forEach((item) => {
                const el = item as HTMLElement;
                const text = el.textContent?.trim().toLowerCase() || "";
                
                // Allowed options: "pin", "unpin", "enter fullscreen", "exit fullscreen", "fullscreen"
                // Restricted options (host-only moderation actions):
                const isRestricted = 
                    text.includes("block") || 
                    text.includes("kick") || 
                    text.includes("everyone") || 
                    text.includes("allow") || 
                    text.includes("disable") || 
                    text.includes("mute");

                if (isRestricted) {
                    el.style.setProperty("display", "none", "important");
                }
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
        });

        return () => observer.disconnect();
    }, [isHostOrCoHost]);

    const CustomParticipantOverlay = (props: React.ComponentProps<typeof DefaultParticipantViewUI>) => {
        return (
            <div className="h-full w-full">
                <DefaultParticipantViewUI {...props} />
            </div>
        );
    };

    const [layout, setLayout] = useState<"grid" | "speaker">("grid");
    const [copied, setCopied] = useState(false);
    const [isChatOpen, setIsChatOpen] = useState(false);

    const onCopyLink = () => {
        navigator.clipboard.writeText(window.location.href);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="flex h-full text-white relative">
            {/* ── Main call area ── */}
            <div className="flex flex-col flex-1 p-4 gap-4 min-w-0">
                {/* Top bar */}
                <div className="bg-[#101213] rounded-full p-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link
                            href="/"
                            className="flex items-center justify-between p-1 bg-white/10 rounded-full w-fit"
                        >
                            <Image src="/logo.svg" width={22} height={22} alt="Logo" />
                        </Link>
                        <h4 className="text-base font-medium">{meetingName}</h4>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={onCopyLink}
                            className="flex items-center gap-2 bg-white/10 hover:bg-white/20 transition px-3 py-1.5 rounded-full text-sm"
                        >
                            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                            {copied ? "Copied" : "Copy Link"}
                        </button>

                        {/* Chat toggle */}
                        <button
                            onClick={() => setIsChatOpen((prev) => !prev)}
                            className={`flex items-center gap-2 transition px-3 py-1.5 rounded-full text-sm ${isChatOpen
                                    ? "bg-blue-600 hover:bg-blue-700"
                                    : "bg-white/10 hover:bg-white/20"
                                }`}
                        >
                            <MessageSquare className="size-4" />
                            Chat
                        </button>

                        {/* Layout switcher */}
                        <div className="flex bg-white/10 rounded-full p-1">
                            <button
                                onClick={() => setLayout("grid")}
                                className={`p-1.5 rounded-full transition ${layout === "grid" ? "bg-white/20" : "hover:bg-white/10"
                                    }`}
                            >
                                <LayoutGrid className="size-4" />
                            </button>
                            <button
                                onClick={() => setLayout("speaker")}
                                className={`p-1.5 rounded-full transition ${layout === "speaker" ? "bg-white/20" : "hover:bg-white/10"
                                    }`}
                            >
                                <User className="size-4" />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Video area */}
                <div className="flex-1 w-full relative overflow-hidden">
                    {layout === "grid" ? (
                        <PaginatedGridLayout ParticipantViewUI={CustomParticipantOverlay} />
                    ) : (
                        <SpeakerLayout
                            ParticipantViewUISpotlight={CustomParticipantOverlay}
                            ParticipantViewUIBar={CustomParticipantOverlay}
                        />
                    )}
                </div>

                {/* Controls */}
                <div className="bg-[#101213] rounded-full px-4 flex justify-center">
                    <CallControls onLeave={onLeave} />
                </div>
            </div>

            {/* ── Chat sidebar ── */}
            {isChatOpen && (
                <CallChat
                    chatClient={chatClient}
                    meetingId={meetingId}
                    onClose={() => setIsChatOpen(false)}
                />
            )}

            {/* OpenAI Chatbox */}
            <OpenAIChatbox />
        </div>
    );
};