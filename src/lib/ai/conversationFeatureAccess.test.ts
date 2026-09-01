import { describe, expect, it } from "vitest";
import {
  conversationKillSwitchActive,
  getConversationFeatureAccess,
  parseConversationServerMode,
} from "./conversationFeatureAccess";

describe("conversation feature access", () => {
  it("defaults to pilot and an open kill switch only in development", () => {
    expect(parseConversationServerMode(undefined, "development")).toBe("pilot");
    expect(conversationKillSwitchActive(undefined, "development")).toBe(false);
    expect(parseConversationServerMode(undefined, "production")).toBe("off");
    expect(conversationKillSwitchActive(undefined, "production")).toBe(true);
  });

  it("requires both server access and the user toggle", () => {
    const base = {
      userId: "user-1",
      nodeEnv: "production",
      envMode: "on",
      envKillSwitch: "false",
    };
    expect(getConversationFeatureAccess({ ...base, userEnabled: false }).active).toBe(false);
    expect(getConversationFeatureAccess({ ...base, userEnabled: true }).active).toBe(true);
  });

  it("keeps shadow mode out of the response path", () => {
    const access = getConversationFeatureAccess({
      userId: "user-1",
      userEnabled: true,
      nodeEnv: "production",
      envMode: "shadow",
      envKillSwitch: "false",
    });
    expect(access.active).toBe(false);
    expect(access.shadow).toBe(true);
  });

  it("restricts pilot mode to configured users outside development", () => {
    const denied = getConversationFeatureAccess({
      userId: "user-2",
      userEnabled: true,
      nodeEnv: "production",
      envMode: "pilot",
      envKillSwitch: "false",
      envPilotUserIds: "user-1",
    });
    expect(denied.active).toBe(false);
    expect(denied).not.toHaveProperty("userId");

    expect(
      getConversationFeatureAccess({
        userId: "user-1",
        userEnabled: true,
        nodeEnv: "production",
        envMode: "pilot",
        envKillSwitch: "false",
        envPilotUserIds: "user-1",
      }).active
    ).toBe(true);
  });
});
