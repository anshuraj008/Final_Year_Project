import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Markdown from "react-markdown";
import { MeetingGetOne } from "../../types";
import { GeneratedAvatar } from "@/components/generated-avatar";
import { FileTextIcon, BookOpenTextIcon, FileVideoIcon, ClockFadingIcon, MessageSquareIcon, UsersIcon, SparklesIcon } from "lucide-react";
import { format} from "date-fns";
import { Badge } from "@/components/ui/badge";
import { formatDuration } from "@/lib/utils";
import { Transcript } from "./transcript";
import { ChatHistoryProvider } from "./chat-history-provider";
import { SYSTEM_AGENT_NAME } from "@/constants";
import { MeetingParticipants } from "./meeting-participants";
import { authClient } from "@/lib/auth-client";

interface Props{
    data: MeetingGetOne;
    isHost?: boolean;
}


export const CompletedState = ({data, isHost}: Props) => {
    const { data: session } = authClient.useSession();
    return (
        <div className="flex flex-col gap-y-4">
            <Tabs defaultValue="summary">
                <div className="bg-white rounded-lg border px-3">
                    <ScrollArea>
                        <TabsList className="p-0 bg-background justify-start rounded-none h-13">
                            <TabsTrigger value="summery" className="text-mute-foreground rounded-none bg-background data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-b-primary data-[state=active]:text-accent-foreground h-full hover:text-accent-foreground">
                                <BookOpenTextIcon />
                                Summary
                            </TabsTrigger>
                             <TabsTrigger value="transcript" className="text-mute-foreground rounded-none bg-background data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-b-primary data-[state=active]:text-accent-foreground h-full hover:text-accent-foreground">
                                <FileTextIcon />
                                Transcript
                            </TabsTrigger>
                             <TabsTrigger value="recording" className="text-mute-foreground rounded-none bg-background data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-b-primary data-[state=active]:text-accent-foreground h-full hover:text-accent-foreground">
                                <FileVideoIcon />
                                Recording
                            </TabsTrigger>
                             <TabsTrigger value="chatHistory" className="text-mute-foreground rounded-none bg-background data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-b-primary data-[state=active]:text-accent-foreground h-full hover:text-accent-foreground">
                                <MessageSquareIcon />
                                Chat
                            </TabsTrigger>
                            {isHost && (
                             <TabsTrigger value="participants" className="text-mute-foreground rounded-none bg-background data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-b-primary data-[state=active]:text-accent-foreground h-full hover:text-accent-foreground">
                                <UsersIcon />
                                Participants
                            </TabsTrigger>
                            )}
                        </TabsList>
                        <ScrollBar orientation="horizontal"/>
                    </ScrollArea>
                </div>
                <TabsContent value="chatHistory">
                    <ChatHistoryProvider meetingId={data.id} />
                </TabsContent>
                <TabsContent value="transcript">
                    <Transcript meetingId={data.id} />
                </TabsContent>
                <TabsContent value="recording">
                    <div className="bg-white rounded-lg border px-4 py-5">
                        <video src={data.recordingUrl!} className="w-full rounded-lg" controls/>
                    </div>
                </TabsContent>
                {isHost && (
                    <TabsContent value="participants">
                        <div className="bg-white rounded-lg border">
                            <MeetingParticipants
                                meetingId={data.id}
                                hostId={data.userId}
                                currentUserId={session?.user?.id}
                                coHostIds={data.coHostIds}
                            />
                        </div>
                    </TabsContent>
                )}

                <TabsContent value="summery">
                    <div className="bg-white rounded-lg border">
                        <div className="px-4 py-5 gap-y-5 flex flex-col col-span-5">
                            <h2>{data.name}</h2>
                            <div className="flex gap-x-2 items-center">
                                <div className="flex items-center gap-x-2 capitalize">
                                    <GeneratedAvatar variant="botttsNeutral" seed={SYSTEM_AGENT_NAME} className="size-5"/>
                                    {SYSTEM_AGENT_NAME}
                                </div>{" "}
                                <p>{data.startedAt ? format(data.startedAt, "PPP") : "" }</p>
                            </div>
                            <div className="flex gap-x-2 items-center">
                                <SparklesIcon className="size-4"/>
                                <p>General summary</p>
                            </div> 
                            <Badge variant="outline" className="flex items-center gap-x-2 [&>svg]:size-4">
                                <ClockFadingIcon className="text-blue-700" />
                                {data.duration ? formatDuration(data.duration) : "No duration"}
                           </Badge>
                           <div>
                            <Markdown components={{
                                h1: (props) => (   
                                    <h1 className="text-2xl font-medium mb-6" {...props}/>
                                ),
                                h2: (props) => (   
                                    <h2 className="text-xl font-medium mb-6" {...props}/>
                                ),
                                h3: (props) => (   
                                    <h3 className="text-lg font-medium mb-6" {...props}/>
                                ),
                                h4: (props) => (   
                                    <h4 className="text-base font-medium mb-6" {...props}/>
                                ),
                                p: (props) => (   
                                    <p className="mb-6 leading-relaxed" {...props}/>
                                ),
                                ul: (props) => (   
                                    <ul className="list-disc list-inside mb-6" {...props}/>
                                ),
                                ol: (props) => (   
                                    <ol className="list-disc list-inside mb-6" {...props}/>
                                ),
                                li: (props) => (   
                                    <li className="mb-1" {...props}/>
                                ),
                                strong: (props) => (   
                                    <strong className="font-semibold" {...props}/>
                                ),
                                code: (props) => (   
                                    <code className="bg-gray-100 px-1 py-0.5 rounded" {...props}/>
                                ),
                                blockquote: (props) => (   
                                    <blockquote className="border-l-4 italic my-4b" {...props}/>
                                ),
                                

                            }}>
                                {data.summary}
                            </Markdown>
                           </div>
                        </div>
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    )
}