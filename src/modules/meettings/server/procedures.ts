import { z } from "zod";
import JSONL from "jsonl-parse-stringify";
import { and, count, desc, eq, getTableColumns, ilike, inArray, sql, or, not } from "drizzle-orm";
import { db } from "@/db";
import { agents, meetings, user, meetingParticipants } from "@/db/schema";
import { createTRPCRouter, premiumProcedure, protectedProcedure,
    //  publicProcedure 
} from "@/trpc/init";
import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, MIN_PAGE_SIZE } from "@/constants";
import { TRPCError } from "@trpc/server";
import { meetingsInsertSchema, meetingsUpdateSchema } from "../schemas";
import { MeetingStatus, StreamTranscriptItem } from "../types";
import { streamVideo } from "@/lib/stream-video";
import { generateAvatarUri } from "@/lib/avatar";
import { streamChat } from "@/lib/stream-chat";
import OpenAI from "openai";
// import { nanoid } from "nanoid";

export const meetingssRouter = createTRPCRouter({
        generateChatToken: protectedProcedure.mutation(async ({ ctx }) => {
        const token = streamChat.createToken(ctx.auth.user.id);
        await streamChat.upsertUsers([
            {
                id: ctx.auth.user.id,
                role: "admin",
            }
        ]);
        return token;
    }),



    getTranscript: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
        const [existingMeeting] = await db
        .select()
        .from(meetings)
        .where(
            and(eq(meetings.id, input.id), eq(meetings.userId, ctx.auth.user.id))
        );

        if(!existingMeeting){
        throw new TRPCError({
            code: "NOT_FOUND",
            message: "Meeting not found",
        });
    }

    if(!existingMeeting.transcriptUrl){
        return [];
    }
      
    const transcript = await fetch(existingMeeting.transcriptUrl)
    .then((res) => res.text())
    .then((text) => JSONL.parse<StreamTranscriptItem>(text))
    .catch(() => {
        return [];
    });

    const speakerIds = [
        ...new Set(transcript.map((item) => item.speaker_id)),
    ];

    const userSpeakers = await db
    .select()
    .from(user)
    .where(inArray(user.id, speakerIds))
        .then((users) => 
            users.map((user) => ({
              ...user,
              image:
              user.image ?? generateAvatarUri({ seed: user.name, variant: "initials" }),
            }))
        );

        const agentSpeakers = await db
        .select()
        .from(agents)
        .where(inArray(agents.id, speakerIds))
        .then((agents) => 
            agents.map((agent) => ({
              ...agent,
              image: generateAvatarUri({ seed: agent.name, variant: "botttsNeutral" })
            }))
        );

        const speakers = [...userSpeakers, ...agentSpeakers];
        const transcriptWithSpeaker = transcript.map((item) => {
            const speaker = speakers.find((speaker) => speaker.id === item.speaker_id);
            if (!speaker) {
                return {
                    ...item,
                    user: {
                        name: "Unknown",
                        image: generateAvatarUri({
                            seed: "Unknown",
                            variant: "initials",
                        }),
                    }
                };
            }

            return {
                ...item,
                user: {
                    name: speaker.name,
                    image: speaker.image,
                }
            };
        });
        return transcriptWithSpeaker;
    }),

    generateToken: protectedProcedure.mutation(async ({ ctx }) => {
        await streamVideo.upsertUsers([
            {
                id: ctx.auth.user.id,
                name: ctx.auth.user.name,
                role: "admin",
                image: ctx.auth.user.image ?? generateAvatarUri({ seed: ctx.auth.user.name, variant: "initials" })
            }
        ]);

        const expirationTime = Math.floor(Date.now() / 1000) + 3600;

        const token = streamVideo.generateUserToken({
            user_id: ctx.auth.user.id,
            exp: expirationTime,
        });

        return token;
    }),
    remove: protectedProcedure
        .input(z.object({ id: z.string() }))
        .mutation(async ({ ctx, input }) => {
            const [removedMeeting] = await db
                .delete(meetings)
                .where(
                    and(
                        eq(meetings.id, input.id),
                        eq(meetings.userId, ctx.auth.user.id),
                    )
                )
                .returning();
            if (!removedMeeting) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "Meeting not found",
                });
            }

            return removedMeeting;
        }),

    update: protectedProcedure
        .input(meetingsUpdateSchema)
        .mutation(async ({ ctx, input }) => {
            const [updatedMeeting] = await db
                .update(meetings)
                .set(input)
                .where(
                    and(
                        eq(meetings.id, input.id),
                        eq(meetings.userId, ctx.auth.user.id),
                    )
                )
                .returning();
            if (!updatedMeeting) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "Meeting not found",
                });
            }

            return updatedMeeting;
        }),

    create: premiumProcedure("meetings")
        .input(meetingsInsertSchema)
        .mutation(async ({ input, ctx }) => {
            const [createdMeeting] = await db
                .insert(meetings)
                .values({ ...input, userId: ctx.auth.user.id, })
                .returning();

            const call = streamVideo.video.call("default", createdMeeting.id);
            await call.create({
                data: {
                    created_by_id: ctx.auth.user.id,
                    custom: {
                        meetingId: createdMeeting.id,
                        meetingName: createdMeeting.name
                    },
                    settings_override: {
                        transcription: {
                            language: "en",
                            mode: "auto-on",
                            closed_caption_mode: "auto-on"
                        },
                        recording: {
                            mode: "auto-on",
                            quality: "1080p",
                        }
                    }
                }
            })

            const [existingAgent] = await db.select().from(agents).where(eq(agents.id, createdMeeting.agentId));

            if (!existingAgent) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "Agent Not Found",
                })
            }

            await streamVideo.upsertUsers([
                {
                    id: existingAgent.id,
                    name: existingAgent.name,
                    role: "user",
                    image: generateAvatarUri({ seed: existingAgent.name, variant: "botttsNeutral"})
                }
            ])

            return createdMeeting;
        }),


    getOne: protectedProcedure
        .input(z.object({ id: z.string() }))
        .query(async ({ input }) => {
            const [existingMeeting] = await db
                .select({
                    ...getTableColumns(meetings),
                    agent: agents,
                    host: user,
                    duration: sql<number>`EXTRACT(EPOCH FROM (meetings.ended_at - meetings.started_at))`.as("duration"),
                })
                .from(meetings)
                .innerJoin(agents, eq(meetings.agentId, agents.id))
                .innerJoin(user, eq(meetings.userId, user.id))
                .where(
                    eq(meetings.id, input.id)
                );

            if (!existingMeeting) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Meeting not found" })
            }

            return existingMeeting;
        }),

    getMany: protectedProcedure
        .input(z.object({
            page: z.number().default(DEFAULT_PAGE),
            pageSize: z.number().min(MIN_PAGE_SIZE).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
            search: z.string().nullish(), agentId: z.string().nullish(),
            status: z.enum([
                MeetingStatus.Upcoming,
                MeetingStatus.Active,
                MeetingStatus.Completed,
                MeetingStatus.Processing,
                MeetingStatus.Cancelled,
            ])
                .nullish(),
            type: z.enum(["my-meetings", "others-meetings"]).nullish(),
        })
        )
        .query(async ({ ctx, input }) => {
            const { search, page, pageSize, status, agentId, type } = input;

            const participantMeetingIds = db.select({ id: meetingParticipants.meetingId })
                .from(meetingParticipants)
                .where(eq(meetingParticipants.userId, ctx.auth.user.id));

            const data = await db
                .select({
                    ...getTableColumns(meetings),
                    agent: agents,
                    host: user,
                    duration: sql<number>`EXTRACT(EPOCH FROM (meetings.ended_at - meetings.started_at))`.as("duration"),
                })
                .from(meetings)
                .innerJoin(agents, eq(agents.id, meetings.agentId))
                .innerJoin(user, eq(meetings.userId, user.id))
                .where(
                    and(
                        type === "others-meetings" ? and(
                            not(eq(meetings.userId, ctx.auth.user.id)),
                            inArray(meetings.id, participantMeetingIds)
                        ) : eq(meetings.userId, ctx.auth.user.id),
                        search ? ilike(meetings.name, `%${search}%`) : undefined,
                        status ? eq(meetings.status, status) : undefined,
                        agentId ? eq(meetings.agentId, agentId) : undefined,
                    )
                )
                .orderBy(desc(meetings.createdAt), desc(meetings.id))
                .limit(pageSize)
                .offset((page - 1) * pageSize)

            const [total] = await db
                .select({ count: count() })
                .from(meetings)
                .where(
                    and(
                        type === "others-meetings" ? and(
                            not(eq(meetings.userId, ctx.auth.user.id)),
                            inArray(meetings.id, participantMeetingIds)
                        ) : eq(meetings.userId, ctx.auth.user.id),
                        search ? ilike(meetings.name, `%${search}%`) : undefined,
                        status ? eq(meetings.status, status) : undefined,
                        agentId ? eq(meetings.agentId, agentId) : undefined,
                    )
                );

            const totalPage = Math.ceil(total.count / pageSize);

            return {
                items: data,
                total: total.count,
                totalPage,
            };
        }),

    chatWithOpenAI: protectedProcedure
        .input(z.object({
            messages: z.array(z.object({
                role: z.enum(["user", "assistant"]),
                content: z.string(),
            })),
        }))
        .mutation(async ({ input }) => {
            const openai = new OpenAI({
                apiKey: process.env.OPENAI_API_KEY!,
            });

            try {
                const completion = await openai.chat.completions.create({
                    model: "gpt-4o-mini",
                    messages: [
                        {
                            role: "system",
                            content: "You are a helpful assistant during a video meeting. Provide concise and helpful responses to user questions."
                        },
                        ...input.messages.map(msg => ({
                            role: msg.role,
                            content: msg.content,
                        })),
                    ],
                    temperature: 0.7,
                    max_tokens: 500,
                });

                return {
                    message: completion.choices[0]?.message?.content || "Sorry, I couldn't generate a response.",
                };
            } catch (error) {
                console.error("OpenAI API error:", error);
                throw new TRPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: "Failed to get response from OpenAI",
                });
            }
        }),

});