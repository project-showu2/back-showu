import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';

// ================================================================
// ShowU 프로젝트 Race Condition 부하테스트
// 테스트 대상:
//   1) 티켓 좌석 예약: POST /reservation/reserve
//   2) 공간 대여 예약: POST /reservation/reservations
// ================================================================

const seatSuccess   = new Counter('seat_reservation_success');
const seatRejected  = new Counter('seat_reservation_rejected');
const seatDuplicate = new Counter('seat_duplicate_detected');
const rentalSuccess  = new Counter('rental_reservation_success');
const rentalRejected = new Counter('rental_reservation_rejected');
const seatTrend     = new Trend('seat_response_time');
const rentalTrend   = new Trend('rental_response_time');

export const options = {
  scenarios: {
    seat_race_condition: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '20s', target: 5   },
        { duration: '10s', target: 5   },
        { duration: '20s', target: 50  },
        { duration: '10s', target: 50  },
        { duration: '20s', target: 200 },
        { duration: '10s', target: 0   },
      ],
      exec: 'testSeatReservation',
    },
    rental_race_condition: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '20s', target: 5   },
        { duration: '10s', target: 5   },
        { duration: '20s', target: 50  },
        { duration: '10s', target: 50  },
        { duration: '20s', target: 200 },
        { duration: '10s', target: 0   },
      ],
      exec: 'testRentalReservation',
      startTime: '100s',
    },
  },
  thresholds: {
    http_req_duration:       ['p(95)<500', 'p(99)<1000'],
    http_req_failed:         ['rate<0.1'],
    seat_duplicate_detected: ['count<1'],
  },
};

const BASE_URL = 'http://localhost:8000/reservation';

// 5명의 실제 유저 ID (VU 번호 % 5 로 순환)
const USER_IDS = [
  '6a06e518db00f340fe8f0d85', // test@test.com
  '6a06e69f20d2c3af5aabc114', // test2@test.com
  '6a06e69f20d2c3af5aabc115', // test3@test.com
  '6a06e69f20d2c3af5aabc116', // test4@test.com
  '6a06e69f20d2c3af5aabc117', // test5@test.com
];

const SHOW_ID  = '6a06df6a4749518e59abc114'; // 뮤지컬 <위키드>
const SPACE_ID = '6a06df8d4749518e59abc115'; // 스튜디오 A
const headers  = { 'Content-Type': 'application/json' };

// ================================================================
// 시나리오 A: 티켓 좌석 예약 Race Condition
//   5명의 다른 유저가 같은 좌석 "1-1" 동시 예약 시도
//   개선 전: 여러 명 201 → 중복 예약 발생
//   개선 후: 1명만 201, 나머지 400
// ================================================================
export function testSeatReservation() {
  const userId = USER_IDS[__VU % USER_IDS.length];

  const payload = JSON.stringify({
    showId:      SHOW_ID,
    date:        '2025-07-15T00:00:00.000Z',
    time:        '14:00',
    seatNumbers: ['1-1'],   // 모든 VU가 같은 좌석!
    userId:      userId,
  });

  const res = http.post(`${BASE_URL}/reserve`, payload, { headers });

  seatTrend.add(res.timings.duration);

  check(res, {
    '좌석 201 성공':       (r) => r.status === 201,
    '좌석 400 거절(정상)': (r) => r.status === 400,
    '좌석 서버 오류 없음': (r) => r.status < 500,
  });

  if (res.status === 201) {
    seatSuccess.add(1);
    seatDuplicate.add(1); // 201이 여러 건 = 중복 예약!
  } else if (res.status === 400) {
    seatRejected.add(1);
  }

  sleep(0.5);
}

// ================================================================
// 시나리오 B: 공간 대여 예약 Race Condition
//   5명의 다른 유저가 같은 날짜/시간대 동시 예약 시도
//   개선 전: 여러 명 201 → 중복 예약 발생
//   개선 후: 1건만 201, 나머지 400
// ================================================================
export function testRentalReservation() {
  const userId = USER_IDS[__VU % USER_IDS.length];

  const payload = JSON.stringify({
    spaceId:  SPACE_ID,
    name:     `테스트사용자-${__VU}`,
    location: '서울시 강남구',
    userId:   userId,
    img:      'http://example.com/studio_a.jpg',
    rentalPeriod: [
      {
        date:      '2025-07-20T00:00:00.000Z',
        timeSlots: [10, 11, 12], // 모든 VU가 같은 시간대!
      },
    ],
  });

  const res = http.post(`${BASE_URL}/reservations`, payload, { headers });

  rentalTrend.add(res.timings.duration);

  check(res, {
    '공간 201 성공':       (r) => r.status === 201,
    '공간 400 거절(정상)': (r) => r.status === 400,
    '공간 서버 오류 없음': (r) => r.status < 500,
  });

  if (res.status === 201) {
    rentalSuccess.add(1);
  } else if (res.status === 400) {
    rentalRejected.add(1);
  }

  sleep(0.5);
}