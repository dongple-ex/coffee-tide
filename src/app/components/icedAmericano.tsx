export type IcedAmericanoTextMode = "lid" | "straw" | "straw-inside" | "edge" | "none";

export interface IcedAmericanoProps {
  size?: number;
  withText?: boolean;
  textMode?: IcedAmericanoTextMode;
  className?: string;
}

export default function IcedAmericano({
  size = 24,
  withText = false,
  textMode,
  className,
}: IcedAmericanoProps) {
  // textMode 미지정 시 withText가 true이면 'lid'를 기본 모드로 적용
  const resolvedMode: IcedAmericanoTextMode = textMode ?? (withText ? "lid" : "lid");

  const isLid = resolvedMode === "lid";
  const isEdge = resolvedMode === "edge";
  const isStrawText = resolvedMode === "straw";
  const isStrawInside = resolvedMode === "straw-inside";

  const viewBox = isEdge ? "0 0 92 64" : "0 0 64 64";
  const width = isEdge ? Math.round((size * 92) / 64) : size;

  return (
    <svg
      width={width}
      height={size}
      viewBox={viewBox}
      role="img"
      aria-label="coffeeTide 아이스아메리카노 로고"
      className={className}
    >
      <defs>
        {/* 컵 오른쪽 가장자리 상승 곡선 (edge 모드용) */}
        {isEdge && (
          <path id="cupRightEdgePath" d="M 42 61.5 Q 48.5 57.5 49.5 39 L 53 16" fill="none" />
        )}
        {/* 빨대 사선 방향 경로 (straw 모드용) */}
        {isStrawText && (
          <path id="strawTextPath" d="M 38 15 L 43.5 -1" fill="none" />
        )}
      </defs>

      {/* 1. 빨대 레이어 */}
      {/* 1-A: 원본 파란 빨대 (lid, edge, none 모드) */}
      {(resolvedMode === "none" || isEdge || isLid) && (
        <rect x="35" y="1" width="6" height="24" rx="3" fill="var(--accent, #00d2ff)" transform="rotate(14 38 13)" />
      )}

      {/* 1-B: 빨대 내 인쇄형 (straw-inside 모드) */}
      {isStrawInside && (
        <>
          <rect x="34" y="0" width="7.5" height="26" rx="3.75" fill="var(--accent, #00d2ff)" transform="rotate(14 38 13)" />
          <g transform="translate(39.5, 17) rotate(-76)">
            <text fontFamily="Pretendard, system-ui, sans-serif" fontSize="4.2" fontWeight="900" fill="#ffffff" letterSpacing="0.2px">
              coffee<tspan fill="#0f172a">Tide</tspan>
            </text>
          </g>
        </>
      )}

      {/* 1-C: 텍스트 빨대 (straw 모드) */}
      {isStrawText && (
        <text
          fontFamily="Pretendard, system-ui, sans-serif"
          fontSize="5.2"
          fontWeight="800"
          letterSpacing="0.4px"
        >
          <textPath href="#strawTextPath" startOffset="0%">
            <tspan fill="#5a3825">coffee</tspan>
            <tspan dx="1.5" fill="var(--accent, #00d2ff)" fontWeight="900">
              Tide
            </tspan>
          </textPath>
        </text>
      )}

      {/* 2. 뚜껑 바 */}
      <rect x="11" y="13.5" width="42" height="6.5" rx="3" fill="#9fb2c8" />

      {/* 2-A: 뚜껑 내부 타이포그래피 (lid 모드) */}
      {isLid && (
        <text
          x="32"
          y="18.3"
          textAnchor="middle"
          fontFamily="Pretendard, system-ui, sans-serif"
          fontSize="4.2"
          fontWeight="900"
          letterSpacing="0.3px"
        >
          <tspan fill="#ffffff">coffee</tspan>
          <tspan fill="#0f172a">Tide</tspan>
        </text>
      )}

      {/* 3. 컵 투명 바디 */}
      <path
        d="M15 20 L49 20 L45.5 57 Q45 61 41 61 L23 61 Q19 61 18.5 57 Z"
        fill="rgba(159,178,200,0.12)"
        stroke="#9fb2c8"
        strokeWidth="3"
        strokeLinejoin="round"
      />

      {/* 4. 커피 액체 */}
      <path
        d="M18 31 L46 31 L43.8 55.5 Q43.5 58 41 58 L23 58 Q20.5 58 20.2 55.5 Z"
        fill="#7a4b2a"
      />

      {/* 5. 얼음 */}
      <rect x="22" y="34" width="9" height="9" rx="2" fill="#e8f4ff" opacity="0.92" transform="rotate(-9 26.5 38.5)" />
      <rect x="33" y="41" width="9" height="9" rx="2" fill="#d8ecff" opacity="0.88" transform="rotate(11 37.5 45.5)" />
      <rect x="24" y="47" width="8" height="8" rx="2" fill="#eef7ff" opacity="0.82" />

      {/* 6. 컵 우측 가장자리 타이포그래피 (edge 모드) */}
      {isEdge && (
        <text
          fontFamily="Pretendard, system-ui, -apple-system, sans-serif"
          fontSize="6.8"
          fontWeight="700"
          letterSpacing="0.6px"
        >
          <textPath href="#cupRightEdgePath" startOffset="3%">
            <tspan fill="#5a3825">coffee</tspan>
            <tspan dx="2.5" fill="var(--accent, #00a8e8)" fontWeight="800">
              Tide
            </tspan>
          </textPath>
        </text>
      )}
    </svg>
  );
}

