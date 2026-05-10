"use client";

import { authClient } from "@/lib/auth-client";
import { LoadingState } from "@/components/loading-state";
import { ChatHistory } from "./chat-history";

interface Props {
    meetingId: string;
}

export const ChatHistoryProvider = ({ meetingId }: Props) => {
    const { data, isPending } = authClient.useSession();

    if (isPending || !data?.user) {
        return (
            <LoadingState
                title="Loading..."
                description="Please wait while we load the chat history"
            />
        );
    }

    return (
        <ChatHistory
            meetingId={meetingId}
            userId={data.user.id}
            userName={data.user.name}
            userImage={data.user.image ?? ""}
        />
    );
};
