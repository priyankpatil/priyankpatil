export const countryFlags = [
  { code: "in", label: "India" },
  { code: "us", label: "United States" },
] as const;

export function CountryFlag({ code }: { code: (typeof countryFlags)[number]["code"] }) {
  if (code === "in") {
    return (
      <svg viewBox="0 0 24 16" className="h-4 w-6 overflow-hidden rounded-[2px]" aria-hidden>
        <rect width="24" height="16" fill="#fff" />
        <rect width="24" height="5.33" y="0" fill="#FF9933" />
        <rect width="24" height="5.33" y="10.67" fill="#138808" />
        <circle cx="12" cy="8" r="1.75" fill="none" stroke="#000080" strokeWidth="0.8" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 16" className="h-4 w-6 overflow-hidden rounded-[2px]" aria-hidden>
      <rect width="24" height="16" fill="#fff" />
      <g fill="#B22234">
        <rect width="24" height="1.23" y="0" />
        <rect width="24" height="1.23" y="2.46" />
        <rect width="24" height="1.23" y="4.92" />
        <rect width="24" height="1.23" y="7.38" />
        <rect width="24" height="1.23" y="9.84" />
        <rect width="24" height="1.23" y="12.3" />
        <rect width="24" height="1.23" y="14.76" />
      </g>
      <rect width="10.2" height="8.6" fill="#3C3B6E" />
    </svg>
  );
}
