export type ConversationServerMode = "off" | "shadow" | "pilot" | "on";

export interface ConversationFeatureAccess {
  serverMode: ConversationServerMode;
  killSwitchActive: boolean;
  cohortEligible: boolean;
  userEnabled: boolean;
  active: boolean;
  shadow: boolean;
}

export function parseConversationServerMode(
  rawMode?: string | null,
  nodeEnv: string | undefined = process.env.NODE_ENV
): ConversationServerMode {
  const normalized = rawMode?.trim().toLowerCase();
  if (normalized === "off" || normalized === "shadow" || normalized === "pilot" || normalized === "on") {
    return normalized;
  }
  // 로컬 개발에서는 별도 환경 설정 없이 시험할 수 있고, 배포 환경은 명시적으로 열어야 한다.
  return nodeEnv === "development" ? "pilot" : "off";
}

export function conversationKillSwitchActive(
  rawValue?: string | null,
  nodeEnv: string | undefined = process.env.NODE_ENV
): boolean {
  if (rawValue === undefined || rawValue === null || rawValue.trim() === "") {
    return nodeEnv !== "development";
  }
  return !["false", "0", "off"].includes(rawValue.trim().toLowerCase());
}

export function getConversationFeatureAccess(options: {
  userId: string;
  userEnabled: boolean;
  nodeEnv?: string;
  envMode?: string | null;
  envKillSwitch?: string | null;
  envPilotUserIds?: string | null;
}): ConversationFeatureAccess {
  const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV;
  const serverMode = parseConversationServerMode(
    options.envMode ?? process.env.COMPANION_CONVERSATION_MODE,
    nodeEnv
  );
  const killSwitchActive = conversationKillSwitchActive(
    options.envKillSwitch ?? process.env.DISABLE_COMPANION_CONVERSATION,
    nodeEnv
  );
  const pilotIds = (options.envPilotUserIds ?? process.env.COMPANION_CONVERSATION_PILOT_USER_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const cohortEligible =
    serverMode === "on" ||
    (serverMode === "pilot" && (nodeEnv === "development" || pilotIds.includes(options.userId)));
  const active =
    !killSwitchActive &&
    serverMode !== "off" &&
    serverMode !== "shadow" &&
    cohortEligible &&
    options.userEnabled;

  return {
    serverMode,
    killSwitchActive,
    cohortEligible,
    userEnabled: options.userEnabled,
    active,
    shadow: !killSwitchActive && serverMode === "shadow",
  };
}
