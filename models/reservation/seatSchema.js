import mongoose from "mongoose";
import { getCurrentTime } from "../../utils/utils.js";

const seatSchema = new mongoose.Schema({
  showId: { type: mongoose.Types.ObjectId, ref: "Show", required: true }, // 공연 ID (참조)
  date: { type: Date, required: true }, // 공연 날짜
  time: { type: String, required: true }, // 공연 시간
  seatNumbers: [{ type: String, required: true }], // 좌석 번호
  userId: { type: mongoose.Types.ObjectId, ref: "User", required: true }, // 예약한 사용자 ID
  createdAt: { type: String, default: getCurrentTime }, // 예약 시간
});

seatSchema.index(
  { showId: 1, date: 1, time: 1, seatNumbers: 1 },
  { unique: true }
);

export default mongoose.model("Seat", seatSchema, "seats");
