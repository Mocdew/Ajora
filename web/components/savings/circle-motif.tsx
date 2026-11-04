/** The circle is a visual metaphor, not a representation of account activity. */
export function CircleMotif({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 440 300"
      fill="none"
      className={className}
    >
      <circle cx="220" cy="150" r="130" stroke="currentColor" strokeOpacity=".06" />
      <circle cx="220" cy="150" r="108" stroke="currentColor" strokeOpacity=".13" strokeDasharray="2 7" />
      <circle cx="220" cy="150" r="82" stroke="currentColor" strokeOpacity=".2" />
      <ellipse cx="220" cy="150" rx="132" ry="50" stroke="currentColor" strokeOpacity=".1" transform="rotate(-28 220 150)" />
      <path d="m220 68 78 57-30 92h-96l-30-92 78-57Z" stroke="currentColor" strokeOpacity=".07" />
      <circle cx="220" cy="155" r="49" fill="currentColor" fillOpacity=".05" />
      <circle cx="220" cy="150" r="49" fill="hsl(var(--motif-surface, var(--card)))" stroke="currentColor" strokeOpacity=".2" />
      <circle cx="220" cy="150" r="42" stroke="currentColor" strokeOpacity=".08" />
      <text x="220" y="156" textAnchor="middle" fill="currentColor" className="font-mono text-[16px] tracking-[.22em]">AJO</text>
      {[
        [220, 68],
        [298, 125],
        [268, 217],
        [172, 217],
        [142, 125],
      ].map(([x, y], index) => (
        <g key={index}>
          <circle cx={x} cy={y + 3} r="17" fill="currentColor" fillOpacity=".04" />
          <circle cx={x} cy={y} r="17" fill="hsl(var(--motif-surface, var(--card)))" stroke="currentColor" strokeOpacity=".18" />
          <circle cx={x} cy={y - 3.5} r="3.5" fill="currentColor" fillOpacity=".65" />
          <path d={`M${x - 6} ${y + 7}a6 6 0 0 1 12 0`} stroke="currentColor" strokeOpacity=".65" strokeWidth="1.4" strokeLinecap="round" />
        </g>
      ))}
      <circle cx="335" cy="83" r="3" fill="currentColor" fillOpacity=".2" />
      <circle cx="103" cy="200" r="2" fill="currentColor" fillOpacity=".3" />
      <path d="M329 221h8m-4-4v8M108 75h6m-3-3v6" stroke="currentColor" strokeOpacity=".25" strokeLinecap="round" />
    </svg>
  );
}
