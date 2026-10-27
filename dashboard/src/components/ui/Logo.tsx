export default function Logo({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="#0f1c17" />
      <path d="M9 9L23 23M23 9L9 23" stroke="#3ddc97" strokeWidth="2" strokeLinecap="round" />
      {[[9, 9], [23, 9], [23, 23], [9, 23]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="4" stroke="#3ddc97" strokeWidth="1.6" fill="#0f1c17" />
      ))}
      <path d="M16 19.5c-2.6 0-3.6-2.2-3.6-4.2 2.2 0 3.6 1 3.6 4.2Zm0 0c2.6 0 3.6-2.2 3.6-4.2-2.2 0-3.6 1-3.6 4.2Z"
            fill="#3ddc97" />
      <path d="M16 19.5v-6" stroke="#3ddc97" strokeWidth="1.2" />
    </svg>
  );
}
