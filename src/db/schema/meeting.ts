import { pgTable, text, timestamp, pgEnum, unique, boolean } from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";
import { user } from "./user";

export const meetingStatus = pgEnum("meeting_status", [
  "upcoming",
  "active",
  "completed",
  "processing",
  "cancelled"
]);

export const meetings = pgTable("meetings", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => nanoid()),
  name: text("name").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  status: meetingStatus("status").notNull().default("upcoming"),
  startedAt: timestamp("started_at"),
  endedAt: timestamp("ended_at"),
  transcriptUrl: text("transcript_url"),
  recordingUrl: text("recording_url"),
  summary: text("summary"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const meetingParticipants = pgTable("meeting_participants", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => nanoid()),
  meetingId: text("meeting_id")
    .notNull()
    .references(() => meetings.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
  isKicked: boolean("is_kicked").notNull().default(false),
  isBlocked: boolean("is_blocked").notNull().default(false),
}, (t) => [
  unique("meeting_user_unique").on(t.meetingId, t.userId)
]);

export const meetingCoHosts = pgTable("meeting_co_hosts", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => nanoid()),
  meetingId: text("meeting_id")
    .notNull()
    .references(() => meetings.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  addedAt: timestamp("added_at").notNull().defaultNow(),
}, (t) => [
  unique("meeting_cohost_unique").on(t.meetingId, t.userId)
]);