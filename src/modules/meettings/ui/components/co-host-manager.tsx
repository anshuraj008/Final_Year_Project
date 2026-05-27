"use client";

import { useTRPC } from "@/trpc/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { UsersIcon, PlusIcon, Trash2Icon, Loader2Icon, MailIcon } from "lucide-react";
import { GeneratedAvatar } from "@/components/generated-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Props {
  meetingId: string;
  isOriginalHost?: boolean;
}

export const CoHostManager = ({ meetingId, isOriginalHost = true }: Props) => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");

  const { data: coHosts, isPending } = useQuery(
    trpc.meetings.getCoHosts.queryOptions({ meetingId }),
  );

  const addCoHost = useMutation(
    trpc.meetings.addCoHost.mutationOptions({
      onSuccess: (data) => {
        toast.success(`${data.name} is now a co-host!`);
        setEmail("");
        queryClient.invalidateQueries(trpc.meetings.getCoHosts.queryOptions({ meetingId }));
        queryClient.invalidateQueries(trpc.meetings.getOne.queryOptions({ id: meetingId }));
      },
      onError: (err) => {
        toast.error(err.message || "Failed to add co-host.");
      },
    }),
  );

  const removeCoHost = useMutation(
    trpc.meetings.removeCoHost.mutationOptions({
      onSuccess: () => {
        toast.success("Co-host removed successfully.");
        queryClient.invalidateQueries(trpc.meetings.getCoHosts.queryOptions({ meetingId }));
        queryClient.invalidateQueries(trpc.meetings.getOne.queryOptions({ id: meetingId }));
      },
      onError: (err) => {
        toast.error(err.message || "Failed to remove co-host.");
      },
    }),
  );

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || addCoHost.isPending) return;
    addCoHost.mutate({ meetingId, email: email.trim() });
  };

  const handleRemove = (userId: string) => {
    if (removeCoHost.isPending) return;
    removeCoHost.mutate({ meetingId, userId });
  };

  return (
    <Card className="bg-white rounded-lg border shadow-none w-full">
      <CardHeader className="flex flex-row items-center gap-x-2.5 pb-3">
        <UsersIcon className="size-5 text-gray-500" />
        <CardTitle className="text-lg font-medium text-gray-800">
          Co-Hosts ({coHosts?.length ?? 0})
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-y-4">
        {/* Form to add co-host - Only visible to the original host */}
        {isOriginalHost && (
          <form onSubmit={handleAdd} className="flex gap-x-2">
            <Input
              placeholder="Add co-host by email (e.g. user@example.com)"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={addCoHost.isPending}
              required
              className="flex-1 bg-white border-gray-200 rounded-lg text-sm"
            />
            <Button type="submit" disabled={addCoHost.isPending || !email.trim()} className="rounded-lg h-9">
              {addCoHost.isPending ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <>
                  <PlusIcon className="size-4 mr-1.5" />
                  Add
                </>
              )}
            </Button>
          </form>
        )}

        {/* List of co-hosts */}
        {isPending ? (
          <div className="flex flex-col gap-y-3 animate-pulse">
            <div className="h-12 bg-gray-100 rounded-lg" />
            <div className="h-12 bg-gray-100 rounded-lg" />
          </div>
        ) : !coHosts || coHosts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-gray-500 text-sm gap-y-2 border border-dashed rounded-lg bg-gray-50/50">
            <UsersIcon className="size-8 text-gray-300" />
            <p>No co-hosts added yet.</p>
          </div>
        ) : (
          <ScrollArea className="max-h-60 pr-2">
            <div className="flex flex-col gap-y-2">
              {coHosts.map((coHost) => (
                <div
                  key={coHost.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-gray-100 hover:bg-gray-50/50 transition-colors"
                >
                  <div className="flex items-center gap-x-3">
                    <GeneratedAvatar
                      variant="initials"
                      seed={coHost.name}
                      className="size-8 border border-gray-100 shadow-sm"
                    />
                    <div className="flex flex-col">
                      <span className="font-medium text-sm text-gray-900 leading-snug">
                        {coHost.name}
                      </span>
                      <span className="text-xs text-gray-500 flex items-center gap-x-1 mt-0.5">
                        <MailIcon className="size-3 text-gray-400" />
                        {coHost.email}
                      </span>
                    </div>
                  </div>
                  {/* Remove button - Only visible to original host */}
                  {isOriginalHost && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemove(coHost.id)}
                      disabled={removeCoHost.isPending}
                      className="text-gray-400 hover:text-red-600 hover:bg-red-50 size-8 rounded-lg transition-colors"
                    >
                      <Trash2Icon className="size-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
};
