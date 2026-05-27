import OpenAI from "openai";
import {and, eq} from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { ChatCompletionMessageParam } from "openai/resources/index.mjs";
import { CallEndedEvent, CallTranscriptionReadyEvent, CallSessionParticipantLeftEvent, CallRecordingReadyEvent, CallSessionStartedEvent } from "@stream-io/node-sdk";
import { db } from "@/db";
import { meetings, meetingParticipants } from "@/db/schema";
import { streamVideo } from "@/lib/stream-video";
import { inngest } from "@/inngest/client";
import { generateAvatarUri } from "@/lib/avatar";
import { streamChat } from "@/lib/stream-chat";
import { SYSTEM_AGENT_ID, SYSTEM_AGENT_NAME, SYSTEM_AGENT_INSTRUCTIONS } from "@/constants";

const openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY!});

function verifySignatureWthSDK(body: string, signature: string): boolean {
    return streamVideo.verifyWebhook(body, signature);
}

export async function POST(req:NextRequest) {
    const signature = req.headers.get("x-signature");
    const apiKey = req.headers.get("x-api-key");

    if(!signature || !apiKey){
        return NextResponse.json(
            {error: "Missing signature or API key"},
            {status: 400}
        )
    }

    const body = await req.text();

    if(!verifySignatureWthSDK(body, signature)){
        return NextResponse.json({error: "Invalid Signature"}, {status: 401})
    }

    let payload: unknown;
    try{
        payload = JSON.parse(body) as Record<string, unknown>;
    }catch{
        return NextResponse.json({error: "Invalid JSON"}, { status: 400})
    }

    const eventType = (payload as Record<string, unknown>)?.type;

    if(eventType === "call.session_started"){
        const event = payload as CallSessionStartedEvent;
        const meetingId = event.call.custom?.meetingId;

        if(!meetingId){
            return NextResponse.json({error: "Missing meetingId"}, {status: 400});
        }

        const [existingMeeting] = await db.select()
        .from(meetings)
        .where(eq(meetings.id, meetingId))

        if(!existingMeeting){
            return NextResponse.json({error: "Meeting not found"}, {status: 404})
        }

        if (existingMeeting.status !== "active") {
            await db.update(meetings).set({status: "active", startedAt: new Date()}).where(eq(meetings.id, existingMeeting.id))
        }

        // We no longer connect a voice agent here. The AI is a background entity
        // that only processes transcripts and chat messages asynchronously.
        return NextResponse.json({ status: "Ok" });
    }else if( eventType === "call.session_participant_left"){
        const event = payload as CallSessionParticipantLeftEvent;
        const meetingId = event.call_cid.split(":")[1];

        if(!meetingId){
            return NextResponse.json({error: "Missing meetingId"}, {status:400});
        }

        try {
            const call = streamVideo.video.call("default", meetingId);
            const callResponse = await call.get();
            
            // Only end the call if there are no more human participants
            const participants = callResponse?.call?.session?.participants || [];
            const humanParticipants = participants.filter(
                (p) => p.user?.id !== SYSTEM_AGENT_ID
            );

            // If no human participants remain, end the call
            if (humanParticipants.length === 0) {
                await call.end();
            }
        } catch (error) {
            console.error("Error handling participant left:", error);
        }
    } else if(eventType === "call.session_ended"){
        const event = payload as CallEndedEvent;
        const meetingId = event.call.custom?.meetingId;

        if(!meetingId){
            return NextResponse.json({error: "Missing meetingId"}, {status: 400})
        }

        await db.update(meetings).set({ status: "processing", endedAt: new Date()}).where(and(eq(meetings.id, meetingId), eq(meetings.status, "active")))
    }else if(eventType === "call.transcription_ready"){
        const event = payload as CallTranscriptionReadyEvent;
        const meetingId = event.call_cid.split(":")[1];

        const [updateMeeting] = await db
            .update(meetings)
            .set({
                transcriptUrl: event.call_transcription.url,
            }).where(eq(meetings.id, meetingId))
            .returning();


            if(!updateMeeting){
                return NextResponse.json({error: "Meeting not found"}, {status: 404})
            }

            await inngest.send({
                name: "meetings/processing",
                data: {
                    meetingId: updateMeeting.id,
                    transcriptUrl: updateMeeting.transcriptUrl
                }
            })
    }else if(eventType === "call.recording_ready"){
        const event  = payload as CallRecordingReadyEvent;
        const meetingId = event.call_cid.split(":")[1];

        await db.update(meetings).set({recordingUrl: event.call_recording.url}).where(eq(meetings.id, meetingId))
    } else if (eventType === "call.kicked_user") {
        const event = payload as { call_cid: string; user: { id: string } };
        const meetingId = event.call_cid.split(":")[1];
        const userId = event.user.id;

        if (meetingId && userId) {
            await db.update(meetingParticipants)
                .set({ isKicked: true })
                .where(and(
                    eq(meetingParticipants.meetingId, meetingId),
                    eq(meetingParticipants.userId, userId)
                ));
        }
    } else if (eventType === "call.blocked_user") {
        const event = payload as { call_cid: string; user: { id: string } };
        const meetingId = event.call_cid.split(":")[1];
        const userId = event.user.id;

        if (meetingId && userId) {
            await db.update(meetingParticipants)
                .set({ isBlocked: true })
                .where(and(
                    eq(meetingParticipants.meetingId, meetingId),
                    eq(meetingParticipants.userId, userId)
                ));
        }
    } else if (eventType === "message.new") {
        const event = payload as { user?: { id: string }; channel_id?: string; message?: { text?: string } };
        const userId = event.user?.id;
        const channelId = event.channel_id;
        const text = event.message?.text;

        if(!userId || !channelId || !text){
            return NextResponse.json(
                { error: "Missing required fields" },
                { status: 400 }
            );
        }

        // Only process messages from completed meetings
        const [existingMeeting] = await db
        .select()
        .from(meetings)
        .where(and(eq(meetings.id, channelId), eq(meetings.status, "completed")));

        if(!existingMeeting){
            return NextResponse.json({ error: "Meeting not found" }, { status: 404});
        }

        // Don't respond to the system agent's own messages
        if(userId !== SYSTEM_AGENT_ID){

        const instructions = `
      You are an AI assistant helping the user revisit a recently completed meeting.
      Below is a summary of the meeting, generated from the transcript:
      
      ${existingMeeting.summary}
      
      The following are your behavioral guidelines as you assist the user:
      
      ${SYSTEM_AGENT_INSTRUCTIONS}
      
      The user may ask questions about the meeting, request clarifications, or ask for follow-up actions.
      Always base your responses on the meeting summary above.
      
      You also have access to the recent conversation history between you and the user. Use the context of previous messages to provide relevant, coherent, and helpful responses. If the user's question refers to something discussed earlier, make sure to take that into account and maintain continuity in the conversation.
      
      If the summary does not contain enough information to answer a question, politely let the user know.
      
      Be concise, helpful, and focus on providing accurate information from the meeting and the ongoing conversation.
      `;

      const channel = streamChat.channel("messaging", channelId);
      await channel.watch();

      const previousMessages = channel.state.messages
      .slice(-5)
      .filter((msg) => msg.text && msg.text.trim() !== "")
      .map<ChatCompletionMessageParam>((message) => ({
        role: message.user?.id === SYSTEM_AGENT_ID ? "assistant": "user",
        content: message.text || "",
      }));

      const GPTResponse = await openaiClient.chat.completions.create({
        messages: [
            {role: "system", content: instructions },
            ...previousMessages,
            { role: "user", content: text },
        ],
        model: "gpt-4o"
      });

      const GPTResponseText = GPTResponse.choices[0].message.content;

      if(!GPTResponseText) {
        return NextResponse.json(
            { error: "No response from GPT"},
            { status: 400}
        );
      }

      const avatarUrl = generateAvatarUri({
        seed: SYSTEM_AGENT_NAME,
        variant: "botttsNeutral",
      });

      streamChat.upsertUser({
        id: SYSTEM_AGENT_ID,
        name: SYSTEM_AGENT_NAME,
        image: avatarUrl,
      });

        channel.sendMessage({
            text: GPTResponseText,
            user: {
               id: SYSTEM_AGENT_ID,
               name: SYSTEM_AGENT_NAME,
               image: avatarUrl,
            },
      });
      }
    }

    return NextResponse.json({status: "Ok"});

}

