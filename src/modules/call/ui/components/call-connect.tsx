"use client";

import { Loader2Icon } from "lucide-react";
import { useEffect, useState } from "react";

import { useTRPC } from "@/trpc/client";
import { useMutation } from "@tanstack/react-query";
import {
    Call,
    CallingState,
    StreamVideo,
    StreamCall,
    StreamVideoClient,
} from "@stream-io/video-react-sdk";
import { StreamChat } from "stream-chat";
import { Chat } from "stream-chat-react";
import { CallUI } from "./call-ui";

interface Props {
    meetingId: string;
    meetingName: string;
    userId: string;
    userName: string;
    userImage: string;
}

export const CallConnect = ({ meetingId, meetingName, userId, userName, userImage }: Props) => {
    const trpc = useTRPC();

    // ── Stream Video ──────────────────────────────────────────────────────────
    const { mutateAsync: generateToken } = useMutation(
        trpc.meetings.generateToken.mutationOptions(),
    );

    const [videoClient, setVideoClient] = useState<StreamVideoClient>();

    useEffect(() => {
        const _client = new StreamVideoClient({
            apiKey: process.env.NEXT_PUBLIC_STREAM_API_KEY!,
            user: { id: userId, name: userName, image: userImage },
            tokenProvider: () => generateToken(),
        });
        setVideoClient(_client);

        return () => {
            _client.disconnectUser();
            setVideoClient(undefined);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId, userName, userImage]);

    const [call, setCall] = useState<Call>();

    useEffect(() => {
        if (!videoClient) return;

        const _call = videoClient.call("default", meetingId);
        _call.camera.disable();
        _call.microphone.disable();
        setCall(_call);

        return () => {
            if (_call.state.callingState !== CallingState.LEFT) {
                _call.leave();
                _call.endCall();
                setCall(undefined);
            }
        };
    }, [videoClient, meetingId]);

    // ── Stream Chat ───────────────────────────────────────────────────────────
    const { mutateAsync: generateChatToken } = useMutation(
        trpc.meetings.generateChatToken.mutationOptions(),
    );

    const [chatClient, setChatClient] = useState<StreamChat>();

    useEffect(() => {
        const connectChat = async () => {
            const token = await generateChatToken();

            const _chatClient = StreamChat.getInstance(
                process.env.NEXT_PUBLIC_STREAM_API_KEY!,
            );

            await _chatClient.connectUser(
                { id: userId, name: userName, image: userImage },
                token,
            );

            setChatClient(_chatClient);
        };

        connectChat().catch(console.error);

        return () => {
            setChatClient(undefined);
            StreamChat.getInstance(process.env.NEXT_PUBLIC_STREAM_API_KEY!).disconnectUser();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId, userName, userImage]);

    // ── Loading guard ─────────────────────────────────────────────────────────
    if (!videoClient || !call || !chatClient) {
        return (
            <div className="flex h-screen items-center justify-center bg-radial from-sidebar-accent to-sidebar">
                <Loader2Icon className="size-6 animate-spin text-white" />
            </div>
        );
    }

    return (
        <StreamVideo client={videoClient}>
            <StreamCall call={call}>
                <Chat client={chatClient} theme="str-chat__theme-dark">
                    <CallUI
                        meetingId={meetingId}
                        meetingName={meetingName}
                        chatClient={chatClient}
                    />
                </Chat>
            </StreamCall>
        </StreamVideo>
    );
};