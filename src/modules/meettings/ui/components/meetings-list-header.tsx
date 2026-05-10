"use client";

import { Button } from "@/components/ui/button";
import { PlusIcon, XCircleIcon } from "lucide-react";
import { NewMeetingDialog } from "./new-meeting-dialog";
import { JoinMeetingDialog } from "./join-meeting-dialog";
import { useState } from "react";
import { MeetingsSearchFilter } from "./meetings-search-filter";
import { StatusFilter } from "./status-filter";
import { AgentIdFilter } from "./agent-id-filter";
import { useMeetingsFilters } from "../../hooks/use-meetings-filters";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { DEFAULT_PAGE } from "@/constants";

export const MeetingsListHeader = () => {
  const [filters, setFilters] = useMeetingsFilters();
  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false);
  const [isJoinDialogOpen, setIsJoinDialogOpen] = useState(false);
  const isAnyFilterModified =
    !!filters.status ||
    !!filters.search ||
    !!filters.agentId;

  const onClearFilters = () => {
    setFilters({
      status: null,
      agentId: "",
      search: "",
      page: DEFAULT_PAGE,
    });
  }

  return (
    <>
     <NewMeetingDialog open={isNewDialogOpen} onOpenChange={setIsNewDialogOpen}/>
     <JoinMeetingDialog open={isJoinDialogOpen} onOpenChange={setIsJoinDialogOpen}/>
    <div className="py-4 px-4 md:px-8 flex flex-col gap-y-4">
      <div className="flex items-center justify-between">
        <h5 className="font-medium text-xl">{filters.type === "others-meetings" ? "Other Meetings" : "My Meetings"}</h5>
        <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setIsJoinDialogOpen(true)}>
                Join Meeting
            </Button>
            <Button onClick={() => setIsNewDialogOpen(true)}>
                <PlusIcon/>
                New Meeting
            </Button>
        </div>
      </div>
      <ScrollArea>
      <div className="flex items-center gap-x-2 p-1">
         <MeetingsSearchFilter/>
         <StatusFilter/>
         <AgentIdFilter/>
         {isAnyFilterModified && (
          <Button variant="outline" onClick={onClearFilters}>
            <XCircleIcon className="size-4"/>
            Clear
          </Button>
         )}
      </div>
      <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
    </>
  );
};