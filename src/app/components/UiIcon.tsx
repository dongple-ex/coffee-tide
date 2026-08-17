"use client";

import type { SVGProps } from "react";

export type UiIconName =
  | "tasks"
  | "assistant"
  | "coffee"
  | "widgets"
  | "weather"
  | "finance"
  | "route"
  | "timer"
  | "calculator"
  | "bookmark"
  | "video"
  | "plus"
  | "inbox"
  | "brain"
  | "spark"
  | "clipboard"
  | "refresh"
  | "expand"
  | "popup"
  | "close"
  | "link"
  | "chapters"
  | "microphone"
  | "pencil"
  | "trash"
  | "check"
  | "pause"
  | "play"
  | "paperclip"
  | "download"
  | "external-link";

interface UiIconProps extends Omit<SVGProps<SVGSVGElement>, "name"> {
  name: UiIconName;
  size?: number;
}

export function UiIcon({ name, size = 18, ...props }: UiIconProps) {
  const paths: Record<UiIconName, React.ReactNode> = {
    tasks: <><path d="M9 6h11M9 12h11M9 18h11" /><path d="m3.5 6 1.2 1.2L7 4.8M3.5 12l1.2 1.2L7 10.8M3.5 18l1.2 1.2L7 16.8" /></>,
    assistant: <><path d="M12 3a6 6 0 0 0-6 6v2a4 4 0 0 0 4 4h1l3.5 3v-3H15a4 4 0 0 0 4-4V9a6 6 0 0 0-7-6Z" /><path d="M9.5 9.5h.01M14.5 9.5h.01" /></>,
    coffee: <><path d="M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9Z" /><path d="M17 11h1.5a2.5 2.5 0 0 1 0 5H17M3 21h15" /><path d="M8 6c-1-1 1-2 0-3M12 6c-1-1 1-2 0-3" /></>,
    widgets: <><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /></>,
    weather: <><path d="M8 16a4 4 0 1 1 .8-7.9A5 5 0 0 1 18 10a3 3 0 0 1 0 6H8Z" /><path d="M6 4V2M3.2 5.2 1.8 3.8M10.8 5.2l1.4-1.4" /></>,
    finance: <><path d="M4 19V9M10 19V5M16 19v-7M22 19H2" /><path d="m4 6 5-3 6 4 6-4" /></>,
    route: <><circle cx="6" cy="18" r="2" /><circle cx="18" cy="6" r="2" /><path d="M8 18h3a3 3 0 0 0 3-3v-6a3 3 0 0 1 3-3" /></>,
    timer: <><circle cx="12" cy="13" r="8" /><path d="M12 9v4l3 2M9 2h6" /></>,
    calculator: <><rect x="4" y="2" width="16" height="20" rx="2" /><path d="M8 6h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 19h.01M12 19h4" /></>,
    bookmark: <path d="M6 3h12v18l-6-4-6 4V3Z" />,
    video: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m10 9 5 3-5 3V9Z" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    inbox: <><path d="M4 4h16v14H4z" /><path d="M4 13h4l2 3h4l2-3h4" /></>,
    brain: <><path d="M9.5 4.5A3 3 0 0 0 5 7a3 3 0 0 0 0 5 3 3 0 0 0 4.5 3.5V4.5ZM14.5 4.5A3 3 0 0 1 19 7a3 3 0 0 1 0 5 3 3 0 0 1-4.5 3.5V4.5Z" /><path d="M9.5 9H7M14.5 9H17M9.5 13H8M14.5 13H16" /></>,
    spark: <path d="m13 2-8 12h7l-1 8 8-12h-7l1-8Z" />,
    clipboard: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V2h6v2M9 10h6M9 14h6" /></>,
    refresh: <><path d="M20 7v5h-5" /><path d="M4 17v-5h5" /><path d="M6.1 8a7 7 0 0 1 11.6-2L20 8M4 16l2.3 2a7 7 0 0 0 11.6-2" /></>,
    expand: <><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" /><path d="m3 8 5-5M21 8l-5-5M3 16l5 5M21 16l-5 5" /></>,
    popup: <><rect x="3" y="6" width="13" height="14" rx="2" /><path d="M9 4h12v12M14 4h7v7" /></>,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    link: <><path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1" /><path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1" /></>,
    chapters: <><path d="M5 4h14v16H5z" /><path d="M9 8h6M9 12h6M9 16h4" /></>,
    microphone: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8" /></>,
    pencil: <><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></>,
    trash: <><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6" /></>,
    check: <polyline points="20 6 9 17 4 12" />,
    pause: <><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></>,
    play: <polygon points="5 3 19 12 5 21 5 3" />,
    paperclip: <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l7.07-7.07" />,
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></>,
    "external-link": <><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></>,
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
