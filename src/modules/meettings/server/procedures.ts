import { z } from "zod";
import JSONL from "jsonl-parse-stringify";
import { and, count, desc, eq, getTableColumns, ilike, inArray, sql, not } from "drizzle-orm";
import { db } from "@/db";
import { meetings, user, meetingParticipants, meetingCoHosts } from "@/db/schema";
import { createTRPCRouter, premiumProcedure, protectedProcedure } from "@/trpc/init";
import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, MIN_PAGE_SIZE, SYSTEM_AGENT_ID, SYSTEM_AGENT_NAME } from "@/constants";
import { TRPCError } from "@trpc/server";
import { meetingsInsertSchema, meetingsUpdateSchema } from "../schemas";
import { MeetingStatus, StreamTranscriptItem } from "../types";
import { streamVideo } from "@/lib/stream-video";
import { generateAvatarUri } from "@/lib/avatar";
import { streamChat } from "@/lib/stream-chat";
import OpenAI from "openai";

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

            if (!existingMeeting) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "Meeting not found",
                });
            }

            if (!existingMeeting.transcriptUrl) {
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
                    users.map((u) => ({
                        ...u,
                        image:
                            u.image ?? generateAvatarUri({ seed: u.name, variant: "initials" }),
                    }))
                );

            // Map system agent speaker if present
            const speakers = [
                ...userSpeakers,
                // Include the system agent as a possible speaker
                {
                    id: SYSTEM_AGENT_ID,
                    name: SYSTEM_AGENT_NAME,
                    image: generateAvatarUri({ seed: SYSTEM_AGENT_NAME, variant: "botttsNeutral" }),
                },
            ];

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

    generateToken: protectedProcedure
        .input(z.object({ meetingId: z.string() }))
        .mutation(async ({ ctx, input }) => {
            const [meeting] = await db
                .select()
                .from(meetings)
                .where(eq(meetings.id, input.meetingId));

            const isOriginalHost = meeting ? meeting.userId === ctx.auth.user.id : false;
            let isCoHost = false;
            if (meeting) {
                const [coHost] = await db
                    .select()
                    .from(meetingCoHosts)
                    .where(and(
                        eq(meetingCoHosts.meetingId, input.meetingId),
                        eq(meetingCoHosts.userId, ctx.auth.user.id)
                    ));
                if (coHost) {
                    isCoHost = true;
                }
            }
            const isHost = isOriginalHost || isCoHost;
            const role = isHost ? "admin" : "user";

            if (isHost && meeting && meeting.status === "upcoming") {
                await db
                    .update(meetings)
                    .set({ status: "active", startedAt: new Date() })
                    .where(eq(meetings.id, input.meetingId));
            }

            await streamVideo.upsertUsers([
                {
                    id: ctx.auth.user.id,
                    name: ctx.auth.user.name,
                    role: role,
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
                .values({ ...input, userId: ctx.auth.user.id })
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
            });

            // Register the system agent as a Stream user so it can
            // respond in post-meeting chat channels.
            await streamVideo.upsertUsers([
                {
                    id: SYSTEM_AGENT_ID,
                    name: SYSTEM_AGENT_NAME,
                    role: "user",
                    image: generateAvatarUri({ seed: SYSTEM_AGENT_NAME, variant: "botttsNeutral" })
                }
            ]);

            return createdMeeting;
        }),


    getOne: protectedProcedure
        .input(z.object({ id: z.string() }))
        .query(async ({ input, ctx }) => {
            const [existingMeeting] = await db
                .select({
                    ...getTableColumns(meetings),
                    host: user,
                    duration: sql<number>`EXTRACT(EPOCH FROM (meetings.ended_at - meetings.started_at))`.as("duration"),
                })
                .from(meetings)
                .innerJoin(user, eq(meetings.userId, user.id))
                .where(
                    eq(meetings.id, input.id)
                );

            if (!existingMeeting) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Meeting not found" })
            }

            // Check if the current user is kicked or blocked
            const [participant] = await db
                .select()
                .from(meetingParticipants)
                .where(and(
                    eq(meetingParticipants.meetingId, input.id),
                    eq(meetingParticipants.userId, ctx.auth.user.id)
                ));

            if (participant && (participant.isKicked || participant.isBlocked)) {
                throw new TRPCError({
                    code: "FORBIDDEN",
                    message: participant.isBlocked
                        ? "You have been blocked from this meeting."
                        : "You have been kicked from this meeting.",
                });
            }

            const coHosts = await db
                .select({ userId: meetingCoHosts.userId })
                .from(meetingCoHosts)
                .where(eq(meetingCoHosts.meetingId, input.id));

            return {
                ...existingMeeting,
                coHostIds: coHosts.map((ch) => ch.userId),
            };
        }),

    getParticipants: protectedProcedure
        .input(z.object({ meetingId: z.string() }))
        .query(async ({ input, ctx }) => {
            const [meeting] = await db
                .select()
                .from(meetings)
                .where(and(eq(meetings.id, input.meetingId), eq(meetings.userId, ctx.auth.user.id)));

            if (!meeting) {
                throw new TRPCError({
                    code: "UNAUTHORIZED",
                    message: "Only the meeting host can view participant details.",
                });
            }

            const participants = await db
                .select({
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    image: user.image,
                    joinedAt: meetingParticipants.joinedAt,
                })
                .from(meetingParticipants)
                .innerJoin(user, eq(meetingParticipants.userId, user.id))
                .where(eq(meetingParticipants.meetingId, input.meetingId))
                .orderBy(desc(meetingParticipants.joinedAt));

            return participants;
        }),

    getMany: protectedProcedure
        .input(z.object({
            page: z.number().default(DEFAULT_PAGE),
            pageSize: z.number().min(MIN_PAGE_SIZE).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
            search: z.string().nullish(),
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
            const { search, page, pageSize, status, type } = input;

            const participantMeetingIds = db.select({ id: meetingParticipants.meetingId })
                .from(meetingParticipants)
                .where(eq(meetingParticipants.userId, ctx.auth.user.id));

            const data = await db
                .select({
                    ...getTableColumns(meetings),
                    host: user,
                    duration: sql<number>`EXTRACT(EPOCH FROM (meetings.ended_at - meetings.started_at))`.as("duration"),
                })
                .from(meetings)
                .innerJoin(user, eq(meetings.userId, user.id))
                .where(
                    and(
                        type === "others-meetings" ? and(
                            not(eq(meetings.userId, ctx.auth.user.id)),
                            inArray(meetings.id, participantMeetingIds)
                        ) : eq(meetings.userId, ctx.auth.user.id),
                        search ? ilike(meetings.name, `%${search}%`) : undefined,
                        status ? eq(meetings.status, status) : undefined,
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

    getCoHosts: protectedProcedure
        .input(z.object({ meetingId: z.string() }))
        .query(async ({ input }) => {
            const coHosts = await db
                .select({
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    image: user.image,
                })
                .from(meetingCoHosts)
                .innerJoin(user, eq(meetingCoHosts.userId, user.id))
                .where(eq(meetingCoHosts.meetingId, input.meetingId));

            return coHosts;
        }),

    addCoHost: protectedProcedure
        .input(z.object({ meetingId: z.string(), email: z.string().email() }))
        .mutation(async ({ input, ctx }) => {
            const [meeting] = await db
                .select()
                .from(meetings)
                .where(and(eq(meetings.id, input.meetingId), eq(meetings.userId, ctx.auth.user.id)));

            if (!meeting) {
                throw new TRPCError({
                    code: "UNAUTHORIZED",
                    message: "Only the meeting host can add co-hosts.",
                });
            }

            if (meeting.status !== "upcoming") {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Co-hosts can only be added before the meeting starts.",
                });
            }

            const [targetUser] = await db
                .select()
                .from(user)
                .where(eq(user.email, input.email));

            if (!targetUser) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "User with this email not found.",
                });
            }

            if (targetUser.id === ctx.auth.user.id) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "You are already the host of this meeting.",
                });
            }

            try {
                await db.insert(meetingCoHosts).values({
                    meetingId: input.meetingId,
                    userId: targetUser.id,
                });
            } catch {
                // Ignore unique constraint violation (already a co-host)
            }

            return {
                id: targetUser.id,
                name: targetUser.name,
                email: targetUser.email,
            };
        }),

    removeCoHost: protectedProcedure
        .input(z.object({ meetingId: z.string(), userId: z.string() }))
        .mutation(async ({ input, ctx }) => {
            const [meeting] = await db
                .select()
                .from(meetings)
                .where(and(eq(meetings.id, input.meetingId), eq(meetings.userId, ctx.auth.user.id)));

            if (!meeting) {
                throw new TRPCError({
                    code: "UNAUTHORIZED",
                    message: "Only the meeting host can remove co-hosts.",
                });
            }

            if (meeting.status !== "upcoming") {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Co-hosts can only be removed before the meeting starts.",
                });
            }

            await db
                .delete(meetingCoHosts)
                .where(and(
                    eq(meetingCoHosts.meetingId, input.meetingId),
                    eq(meetingCoHosts.userId, input.userId)
                ));

            return { success: true };
        }),

});