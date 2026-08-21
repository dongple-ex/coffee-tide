import { describe, expect, it } from "vitest";
import { extractRegistrationIntent } from "./intents";

describe("extractRegistrationIntent", () => {
  it("extracts widget registration with name and url", () => {
    const result = extractRegistrationIntent("요즘IT https://yozm.wishket.com 위젯 등록해줘");
    expect(result).toEqual({
      type: "widget",
      name: "요즘IT",
      url: "https://yozm.wishket.com",
    });
  });

  it("extracts widget registration with parentheses and www url", () => {
    const result = extractRegistrationIntent("네이버(www.naver.com) 위젯 칩 추가해줘");
    expect(result).toEqual({
      type: "widget",
      name: "네이버",
      url: "https://www.naver.com",
    });
  });

  it("requests clarification when widget url is missing", () => {
    const result = extractRegistrationIntent("요즘IT 위젯 등록해줘");
    expect(result?.type).toBe("clarification");
    if (result?.type === "clarification") {
      expect(result.targetType).toBe("widget");
    }
  });

  it("extracts shortcut registration with custom protocol", () => {
    const result = extractRegistrationIntent("카카오톡 kakaotalk:// 바로가기 등록해줘");
    expect(result).toEqual({
      type: "shortcut",
      keyword: "카카오톡",
      target: "kakaotalk://",
    });
  });

  it("extracts shortcut registration with url", () => {
    const result = extractRegistrationIntent("깃허브 https://github.com 바로가기 추가해줘");
    expect(result).toEqual({
      type: "shortcut",
      keyword: "깃허브",
      target: "https://github.com",
    });
  });

  it("returns null for non-registration queries", () => {
    expect(extractRegistrationIntent("오늘 할 일 알려줘")).toBeNull();
    expect(extractRegistrationIntent("내일 3시 회의 일정 등록해줘")).toBeNull();
  });
});
