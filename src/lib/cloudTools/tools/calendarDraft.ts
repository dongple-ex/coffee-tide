import { normalizeCalendarEventDraft } from "@/lib/calendar/types";
import type { CalendarRecurrence, CalendarWeekday } from "@/lib/calendar/types";
import type { CalendarCloudDraft } from "../drafts";
import type { CloudToolDefinition } from "../types";
import { CloudToolInputError } from "../validation";

const WEEKDAYS = new Set<CalendarWeekday>(["MO", "TU", "WE", "TH", "FR", "SA", "SU"]);

function optionalString(value: string | number | boolean | undefined): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function recurrenceFromInput(
  input: Record<string, string | number | boolean>
): CalendarRecurrence | undefined {
  const frequency = optionalString(input.recurrenceFrequency);
  if (!frequency || frequency === "NONE") return undefined;
  const byWeekday = optionalString(input.recurrenceWeekdays)
    ?.split(",")
    .map((day) => day.trim().toUpperCase() as CalendarWeekday)
    .filter((day) => WEEKDAYS.has(day));
  return {
    frequency: frequency as CalendarRecurrence["frequency"],
    ...(typeof input.recurrenceInterval === "number"
      ? { interval: input.recurrenceInterval }
      : {}),
    ...(byWeekday?.length ? { byWeekday: [...new Set(byWeekday)] } : {}),
    ...(typeof input.recurrenceCount === "number"
      ? { count: input.recurrenceCount }
      : optionalString(input.recurrenceUntil)
        ? { until: optionalString(input.recurrenceUntil) }
        : {}),
  };
}

export const calendarDraftTool: CloudToolDefinition = {
  id: "calendar.event_draft",
  version: 1,
  name: "일정 초안 작성",
  description:
    "자연어 요청을 편집 가능한 일정 초안으로 구성합니다. Calendar에는 저장하지 않습니다.",
  inputSchema: {
    type: "object",
    properties: {
      title: { type: "string", description: "일정 제목입니다.", maxLength: 120 },
      description: { type: "string", description: "일정 설명입니다.", maxLength: 2_000 },
      timezone: { type: "string", description: "IANA 타임존입니다. 예: Asia/Seoul", maxLength: 100 },
      allDay: { type: "boolean", description: "종일 일정 여부입니다.", default: false },
      startDateTime: {
        type: "string",
        description: "시간 일정의 시작 ISO 8601 일시입니다. 예: 2026-08-12T15:00:00+09:00",
        maxLength: 50,
      },
      endDateTime: {
        type: "string",
        description: "시간 일정의 종료 ISO 8601 일시입니다.",
        maxLength: 50,
      },
      startDate: { type: "string", description: "종일 일정 시작일 YYYY-MM-DD입니다.", maxLength: 10 },
      endDate: {
        type: "string",
        description: "종일 일정 종료 다음 날(exclusive) YYYY-MM-DD입니다.",
        maxLength: 10,
      },
      recurrenceFrequency: {
        type: "string",
        description: "반복 주기입니다.",
        enum: ["NONE", "DAILY", "WEEKLY", "MONTHLY", "YEARLY"],
        default: "NONE",
      },
      recurrenceInterval: {
        type: "integer",
        description: "반복 간격입니다.",
        minimum: 1,
        maximum: 365,
        default: 1,
      },
      recurrenceWeekdays: {
        type: "string",
        description: "주간 반복 요일을 MO,TU처럼 쉼표로 구분합니다.",
        maxLength: 30,
      },
      recurrenceUntil: {
        type: "string",
        description: "반복 종료일 YYYY-MM-DD입니다.",
        maxLength: 10,
      },
      recurrenceCount: {
        type: "integer",
        description: "반복 횟수입니다. 종료일과 동시에 사용하지 않습니다.",
        minimum: 1,
        maximum: 500,
      },
    },
    required: ["title"],
    additionalProperties: false,
  },
  effect: "draft",
  confirmation: "result_review",
  timeoutMs: 2_000,
  maxOutputBytes: 32 * 1024,
  async execute(input, context) {
    const allDay = input.allDay === true;
    const draft = normalizeCalendarEventDraft(
      {
        title: input.title,
        description: optionalString(input.description),
        timezone: optionalString(input.timezone) ?? context.timezone,
        allDay,
        ...(allDay
          ? { startDate: input.startDate, endDate: input.endDate }
          : { startDateTime: input.startDateTime, endDateTime: input.endDateTime }),
        recurrence: recurrenceFromInput(input),
      },
      context.timezone
    );
    if (!draft) {
      throw new CloudToolInputError(
        allDay
          ? "종일 일정 초안에는 제목과 시작일이 필요합니다."
          : "일정 초안에는 제목과 시작 시간이 필요합니다."
      );
    }
    const data: CalendarCloudDraft = { kind: "calendar_event", draft };
    return {
      success: true,
      summary: `### 📝 일정 초안\n- **${draft.title}**\n- 외부 캘린더에는 아직 저장하지 않았습니다. 아래 검토 카드에서 수정하거나 복사하세요.`,
      data,
      sources: [{ label: "사용자 요청과 현재 CoffeeTide 대화" }],
      warnings: ["Phase C 초안이며 Google Calendar를 변경하지 않았습니다."],
    };
  },
};
