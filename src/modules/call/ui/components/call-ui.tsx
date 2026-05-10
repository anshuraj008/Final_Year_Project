import { StreamTheme, useCall } from "@stream-io/video-react-sdk";
import { useState, useRef } from "react";
import { StreamChat } from "stream-chat";
import { useTRPC } from "@/trpc/client";
import { useMutation } from "@tanstack/react-query";
import { CallLobby } from "./call-lobby";
import { CallActive } from "./call-active";
import { CallEnded } from "./call-ended";

interface Props {
    meetingId: string;
    meetingName: string;
    chatClient: StreamChat;
}

export const CallUI = ({ meetingId, meetingName, chatClient }: Props) => {
    const call = useCall();
    const trpc = useTRPC();

    const [show, setShow] = useState<"lobby" | "call" | "ended">("lobby");
    const isLeavingRef = useRef(false);

    const handleJoin = async () => {
        if (!call) return;
        await call.join();
        setShow("call");
    };

    const handleLeave = async () => {
        if (!call || isLeavingRef.current) return;
        isLeavingRef.current = true;

        try {
            const state = call.state;
            if (state.callingState === "joined") {
                await call.leave();
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (!errorMessage.includes("already been left")) {
                console.error("Failed to leave call:", error);
            }
        } finally {
            setShow("ended");
        }
    };

    return (
        <StreamTheme className="h-full">
            {show === "lobby" && <CallLobby onJoin={handleJoin} />}
            {show === "call" && (
                <CallActive
                    onLeave={handleLeave}
                    meetingName={meetingName}
                    meetingId={meetingId}
                    chatClient={chatClient}
                />
            )}
            {show === "ended" && <CallEnded />}
        </StreamTheme>
    );
};