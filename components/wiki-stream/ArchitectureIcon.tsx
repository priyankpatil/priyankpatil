import brands from "./brand-icons.json";

export type ArchitectureIconKind = "wikipedia" | "apachekafka" | "supabase" | "render" | "githubactions" | "nvidia" | "github"
  | "ingest" | "enrich" | "aggregate" | "dashboard" | "reject" | "chats" | "validate" | "judge" | "scores" | "alert";

/** Brand paths are local CC0 Simple Icons assets; processing symbols are native SVG. */
export default function ArchitectureIcon({ kind }: { kind: ArchitectureIconKind }) {
  if (kind in brands) return <>{brands[kind as keyof typeof brands].map((path, index) => <path key={index} d={path} fill="currentColor" />)}</>;
  const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (kind) {
    case "ingest": return <g {...stroke}><path d="M4 3h16v5H4zM4 16h16v5H4z" /><path d="M12 8v8m-3-3 3 3 3-3" /><circle cx="7" cy="5.5" r=".6" fill="currentColor" stroke="none" /><circle cx="7" cy="18.5" r=".6" fill="currentColor" stroke="none" /></g>;
    case "enrich": return <g {...stroke}><path d="M8 4H4v16h4m8-16h4v16h-4M9 9l-3 3 3 3m6-6 3 3-3 3m-3-8-2 10" /><path d="m13 3 1-2 1 2 2 1-2 1-1 2-1-2-2-1z" fill="currentColor" stroke="none" /></g>;
    case "aggregate": return <g {...stroke}><path d="M3 21h19M5 17v-5h3v5m3 0V7h3v10m3 0V3h3v14" /><path d="m3 7 4-4m-4 0h4v4" /></g>;
    case "dashboard": return <g {...stroke}><rect x="1.5" y="3" width="21" height="16" rx="2" /><path d="M2 7h20m-13 16h6m-3-4v4" /><circle cx="4.5" cy="5" r=".5" fill="currentColor" stroke="none" /><path d={brands.vercel[0]} transform="translate(7 9) scale(.42)" fill="currentColor" stroke="none" /></g>;
    case "chats": return <g {...stroke}><path d="M3 4h12v8H8l-3 3v-3H3z" /><path d="M15 8h6v8h-2v3l-3-3h-5v-4" /></g>;
    case "validate": return <g {...stroke}><path d="M12 2 4 5v6c0 5 3.4 9 8 11 4.6-2 8-6 8-11V5z" /><path d="m8.5 12 2.5 2.5 4.5-5" /></g>;
    case "judge": return <g {...stroke}><path d="M12 3v18m-6 0h12M5 7h14M12 3l-1 1h2z" /><path d="M5 7 2 14h6zm14 0-3 7h6zM2 14a3 2 0 0 0 6 0m8 0a3 2 0 0 0 6 0" /></g>;
    case "scores": return <g {...stroke}><ellipse cx="12" cy="5" rx="8" ry="2.5" /><path d="M4 5v14c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5V5M4 12c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5" /></g>;
    case "alert": return <g {...stroke}><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20.5a2 2 0 0 0 4 0" /><path d="M12 2v1.5" /></g>;
    case "reject": return <g {...stroke}><path d="M4 10 7 3h10l3 7v10H4zM4 12h5l1 3h4l1-3h5m-8-7v4" /><circle cx="12" cy="11" r=".6" fill="currentColor" stroke="none" /></g>;
  }
}
