import { useState, useEffect } from "react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { VideoIcon, ClipboardIcon, CheckIcon, ShieldCheckIcon } from "lucide-react";
import Link from "next/link";
import { CoHostManager } from "./co-host-manager";

interface Props {
  meetingId: string;
  isHost?: boolean;
  isOriginalHost?: boolean;
}

export const UpcomingState = ({ meetingId, isHost, isOriginalHost }: Props) => {
  const [copiedId, setCopiedId] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [meetingLink, setMeetingLink] = useState(`/meetings/${meetingId}`);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setMeetingLink(`${window.location.origin}/meetings/${meetingId}`);
    }
  }, [meetingId]);

  const copyToClipboard = (text: string, isLink: boolean) => {
    navigator.clipboard.writeText(text);
    if (isLink) {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } else {
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    }
  };

  return (
    <div className="bg-white rounded-lg border p-6 flex flex-col items-center justify-center gap-y-6">
      <EmptyState
        image="/upcoming.svg"
        title={isHost ? "Not started yet" : "Ready to join"}
        description={
          isHost
            ? "Once you start this meeting, a summary will appear here."
            : "Once the host starts the meeting, you can see the summary here."
        }
      />
      
      {isHost ? (
        /* Responsive two-column grid layout for Host details */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full max-w-4xl mt-2">
          {/* Meeting Credentials Section (Host Only) */}
          <div className="bg-gray-50/50 rounded-xl border border-gray-100 p-5 flex flex-col gap-y-4 h-full justify-between">
            <div className="flex flex-col gap-y-4">
              <div className="flex items-center gap-x-2 border-b pb-3 mb-1">
                <ShieldCheckIcon className="size-5 text-green-600" />
                <span className="font-semibold text-sm text-gray-800">Meeting Joining Info</span>
              </div>

              <div className="flex flex-col gap-y-1">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Meeting ID</span>
                <div className="flex items-center gap-x-2">
                  <code className="flex-1 bg-white border border-gray-200 px-3 py-2 rounded-lg text-xs text-gray-800 font-mono overflow-x-auto whitespace-nowrap">
                    {meetingId}
                  </code>
                  <Button 
                    variant="outline" 
                    size="icon" 
                    className="shrink-0 size-9 rounded-lg"
                    onClick={() => copyToClipboard(meetingId, false)}
                  >
                    {copiedId ? (
                      <CheckIcon className="size-4 text-green-600 animate-in fade-in" />
                    ) : (
                      <ClipboardIcon className="size-4 text-gray-500" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="flex flex-col gap-y-1">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Invite Link</span>
                <div className="flex items-center gap-x-2">
                  <code className="flex-1 bg-white border border-gray-200 px-3 py-2 rounded-lg text-xs text-gray-600 overflow-x-auto whitespace-nowrap">
                    {meetingLink}
                  </code>
                  <Button 
                    variant="outline" 
                    size="icon" 
                    className="shrink-0 size-9 rounded-lg"
                    onClick={() => copyToClipboard(meetingLink, true)}
                  >
                    {copiedLink ? (
                      <CheckIcon className="size-4 text-green-600 animate-in fade-in" />
                    ) : (
                      <ClipboardIcon className="size-4 text-gray-500" />
                    )}
                  </Button>
                </div>
              </div>
            </div>

            <div className="text-xs text-gray-400 leading-normal flex items-start gap-x-1.5 mt-4">
              <span>🔒</span>
              <span>This meeting is protected. There is no password required; only people with the unique Meeting ID or Invite Link can join the call.</span>
            </div>
          </div>

          {/* Co-Host Manager Section */}
          <CoHostManager meetingId={meetingId} isOriginalHost={isOriginalHost} />
        </div>
      ) : (
        /* Invitation Card (Participants Only) */
        <div className="w-full max-w-md bg-gray-50/55 rounded-xl border border-gray-100 p-5 text-center text-sm text-gray-600 flex items-center justify-center gap-x-2">
          <span>👋</span>
          <span>You have been invited to join this meeting. Click the button below to join the lobby.</span>
        </div>
      )}

      <div className="flex flex-col-reverse lg:flex-row lg:justify-center items-center gap-2 w-full mt-2">
        <Button asChild className="w-full lg:w-auto h-11 px-8 rounded-lg text-sm font-medium">
          <Link href={`/call/${meetingId}`}>
            <VideoIcon className="size-4 mr-1.5" />
            {isHost ? "Start meeting" : "Join meeting"}
          </Link>
        </Button>
      </div>
    </div>
  );
};