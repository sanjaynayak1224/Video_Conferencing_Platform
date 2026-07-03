import { Schema, model } from "mongoose";

const meetingSchema = new Schema(
    {
        user_id: { type: String },
        meetingCode: { type: String, required: true, trim: true },
        date: { type: Date, default: Date.now, required: true },
        joinedAt: { type: Date },
        leftAt: { type: Date },
        duration: { type: Number } // milliseconds
    },
    { timestamps: true }
);

const Meeting = model("Meeting", meetingSchema);

export { Meeting };