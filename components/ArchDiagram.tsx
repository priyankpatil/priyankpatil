interface ArchNode {
  label: string;
  sublabel: string;
}

interface ArchDiagramProps {
  nodes: ArchNode[];
}

export default function ArchDiagram({ nodes }: ArchDiagramProps) {
  return (
    <div style={{ overflowX: "auto", paddingBottom: "0.5rem" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          minWidth: "max-content",
        }}
      >
        {nodes.map((node, i) => {
          const isFirst = i === 0;
          const isLast = i === nodes.length - 1;

          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div
                style={{
                  border: isLast ? "none" : "1px solid var(--border)",
                  borderLeft: isFirst
                    ? "3px solid var(--accent)"
                    : isLast
                    ? "none"
                    : "1px solid var(--border)",
                  background: isLast ? "var(--accent-soft)" : "var(--surface-muted)",
                  borderRadius: "14px",
                  padding: "12px 16px",
                  minWidth: "110px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  textAlign: "center",
                  ...(isLast
                    ? {
                        border: "1px solid transparent",
                        background: "var(--accent-soft)",
                      }
                    : {}),
                }}
              >
                <span
                  style={{
                    fontSize: "13px",
                    fontWeight: 600,
                    color: "var(--text)",
                  }}
                >
                  {node.label}
                </span>
                <span
                  style={{
                    fontSize: "11px",
                    color: "var(--soft)",
                    marginTop: "3px",
                  }}
                >
                  {node.sublabel}
                </span>
              </div>

              {i < nodes.length - 1 && (
                <div
                  style={{
                    color: "var(--soft)",
                    fontSize: "18px",
                    flexShrink: 0,
                  }}
                >
                  →
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
