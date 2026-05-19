import mongoose from "mongoose";
import { isSameDay, startOfDay, endOfDay } from "date-fns";
import Rental from "../../models/reservation/rentalSchema.js";

// 예약 생성
export const createReservation = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    console.log("Request Body:", req.body);
    const { userId, spaceId, name, location, rentalPeriod, img } = req.body;

    // rentalPeriod 날짜 변환
    const parsedRentalPeriod = rentalPeriod.map((period) => {
      const date = startOfDay(new Date(period.date));
      const timeSlots =
        period.timeSlots.length === 0
          ? Array.from({ length: 15 }, (_, i) => 8 + i)
          : period.timeSlots;
      return { date, timeSlots };
    });

    // 중복 예약 확인 (트랜잭션 세션 안에서 조회)
    for (let i = 0; i < parsedRentalPeriod.length; i++) {
      const period = parsedRentalPeriod[i];
      const existingReservations = await Rental.find({
        spaceId,
        "rentalPeriod.date": period.date,
      }).session(session);

      const conflictingSlots = [];
      existingReservations.forEach((rental) => {
        rental.rentalPeriod.forEach((existingPeriod) => {
          if (isSameDay(new Date(existingPeriod.date), new Date(period.date))) {
            period.timeSlots.forEach((slot) => {
              if (existingPeriod.timeSlots.includes(slot)) {
                conflictingSlots.push(slot);
              }
            });
          }
        });
      });

      if (conflictingSlots.length > 0) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          message: `이미 예약된 시간대입니다. 다른 시간대를 선택해주세요. 겹치는 시간대: ${conflictingSlots.join(", ")}`,
        });
      }
    }

    const newRental = new Rental({
      spaceId,
      name,
      location,
      rentalPeriod: parsedRentalPeriod,
      img,
      userId,
    });

    await newRental.save({ session });
    await session.commitTransaction();
    session.endSession();

    res.status(201).json({ message: "Rental created successfully", rental: newRental });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    if (error.codeName === 'WriteConflict' || error.code === 112) {
      return res.status(400).json({ message: "동시 요청이 많아 예약에 실패했습니다. 다시 시도해주세요." });
    }
    console.error("Failed to create rental:", error);
    res.status(500).json({ message: "Failed to create rental", error: error.message });
  }
};

// 예약된 시간 조회
export const getReservedTimes = async (req, res) => {
  try {
    const { spaceId, date } = req.query;
    const startDate = startOfDay(new Date(date));
    const endDate = endOfDay(new Date(date));

    const rentals = await Rental.find({
      spaceId,
      "rentalPeriod.date": { $gte: startDate, $lte: endDate },
    });

    const reservedTimes = rentals.flatMap((rental) =>
      rental.rentalPeriod
        .filter((period) => isSameDay(new Date(period.date), startDate))
        .flatMap((period) =>
          period.timeSlots.map((slot) => {
            const reservedTime = new Date(startDate);
            reservedTime.setHours(slot, 0, 0, 0);
            return reservedTime;
          })
        )
    );
    console.log("서버에서 반환된 예약된 시간대:", reservedTimes);
    res.status(200).json(reservedTimes);
  } catch (error) {
    console.error("Failed to retrieve reserved times:", error);
    res.status(500).json({
      message: "Failed to retrieve reserved times",
      error: error.message,
    });
  }
};

// 잔여 대여 시간 조회
export const getAvailableTimes = async (req, res) => {
  try {
    const { spaceId, date } = req.query;
    const startDate = startOfDay(new Date(date));
    const endDate = endOfDay(new Date(date));

    const rentals = await Rental.find({
      spaceId,
      "rentalPeriod.date": { $gte: startDate, $lte: endDate },
    });

    const reservedTimes = rentals.flatMap((rental) =>
      rental.rentalPeriod
        .filter((period) => isSameDay(new Date(period.date), startDate))
        .flatMap((period) => period.timeSlots)
    );

    const allTimes = [];
    for (let i = 8; i <= 22; i++) {
      const time = new Date(startDate);
      time.setHours(i, 0, 0, 0);
      allTimes.push(time);
    }

    const availableTimes = allTimes.filter(
      (time) =>
        !reservedTimes.some(
          (reservedTime) => reservedTime.getHours() === time.getHours()
        )
    );

    res.status(200).json(availableTimes);
  } catch (error) {
    console.error("Failed to retrieve available times:", error);
    res.status(500).json({
      message: "Failed to retrieve available times",
      error: error.message,
    });
  }
};