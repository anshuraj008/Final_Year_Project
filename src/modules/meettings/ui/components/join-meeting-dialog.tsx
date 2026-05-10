"use client";

import { ResponsiveDialog } from "@/components/responsive-dialog";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface JoinMeetingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const JoinMeetingDialog = ({ open, onOpenChange }: JoinMeetingDialogProps) => {
  const router = useRouter(); 
  const [meetingId, setMeetingId] = useState("");

  const onSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (!meetingId.trim()) return;
      onOpenChange(false);
      router.push(`/meetings/${meetingId.trim()}`);
      setMeetingId("");
  };

  return (
        <ResponsiveDialog
          title="Join Meeting"
          description="Enter a meeting ID to join an existing meeting"
          open={open}
          onOpenChange={onOpenChange}
        >
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
              <div className="space-y-2">
                  <Input 
                      placeholder="Meeting ID (e.g., 123e4567-e89b...)" 
                      value={meetingId}
                      onChange={(e) => setMeetingId(e.target.value)}
                      required
                  />
              </div>
              <div className="flex justify-end gap-2 mt-4">
                  <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                      Cancel
                  </Button>
                  <Button type="submit" disabled={!meetingId.trim()}>
                      Join
                  </Button>
              </div>
          </form>
        </ResponsiveDialog>
    );
};
