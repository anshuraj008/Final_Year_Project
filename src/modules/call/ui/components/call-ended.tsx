import Link from "next/link";
import { Button } from "@/components/ui/button";

interface Props {
  kickedReason?: string | null;
}

export const CallEnded = ({ kickedReason }: Props) => {
  const isKickedOrBlocked = kickedReason === "kicked" || kickedReason === "blocked" || kickedReason === "PolicyViolationModeration";

  return (
    <div className="flex flex-col items-center justify-center h-full bg-radial from-sidebar-accent to-sidebar animate-in fade-in duration-300">
      <div className="py-4 px-8 flex flex-1 items-center justify-center">
        <div className="flex flex-col items-center justify-center gap-y-6 bg-background rounded-2xl p-10 shadow-xl max-w-md w-full border border-gray-100 text-center">
          {isKickedOrBlocked ? (
            <>
              <div className="size-16 rounded-full bg-red-50 flex items-center justify-center text-3xl">
                🚫
              </div>
              <div className="flex flex-col gap-y-2 text-center">
                <h6 className="text-xl font-semibold text-gray-900">Removed from meeting</h6>
                <p className="text-sm text-gray-500 leading-relaxed">
                  The host has kicked you from this meeting room. You no longer have permission to join this session.
                </p>
              </div>
              <Button asChild className="w-full bg-red-600 hover:bg-red-700 text-white rounded-lg h-11">
                <Link href="/meetings">Back to Dashboard</Link>
              </Button>
            </>
          ) : (
            <>
              <div className="size-16 rounded-full bg-gray-50 flex items-center justify-center text-3xl">
                👋
              </div>
              <div className="flex flex-col gap-y-2 text-center">
                <h6 className="text-xl font-semibold text-gray-900">Call Ended</h6>
                <p className="text-sm text-gray-500 leading-relaxed">
                  You have left the meeting. The summary will appear in your dashboard shortly.
                </p>
              </div>
              <Button asChild className="w-full rounded-lg h-11">
                <Link href="/meetings">Back to Dashboard</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
