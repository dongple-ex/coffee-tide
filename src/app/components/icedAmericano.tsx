// 아이스아메리카노 로고 아이콘 (src/app/icon.svg와 동일 도안)

export default function IcedAmericano({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="아이스아메리카노"
    >
      <rect x="35" y="1" width="6" height="24" rx="3" fill="var(--accent)" transform="rotate(14 38 13)" />
      <rect x="12" y="14" width="40" height="6" rx="3" fill="#9fb2c8" />
      <path
        d="M15 20 L49 20 L45.5 57 Q45 61 41 61 L23 61 Q19 61 18.5 57 Z"
        fill="rgba(159,178,200,0.12)"
        stroke="#9fb2c8"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path
        d="M18 31 L46 31 L43.8 55.5 Q43.5 58 41 58 L23 58 Q20.5 58 20.2 55.5 Z"
        fill="#7a4b2a"
      />
      <rect x="22" y="34" width="9" height="9" rx="2" fill="#e8f4ff" opacity="0.92" transform="rotate(-9 26.5 38.5)" />
      <rect x="33" y="41" width="9" height="9" rx="2" fill="#d8ecff" opacity="0.88" transform="rotate(11 37.5 45.5)" />
      <rect x="24" y="47" width="8" height="8" rx="2" fill="#eef7ff" opacity="0.82" />
    </svg>
  );
}
