interface ArchNode {
  label: string;
  sublabel: string;
}

interface ArchDiagramProps {
  nodes: ArchNode[];
}

export default function ArchDiagram({ nodes }: ArchDiagramProps) {
  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex min-w-max items-center gap-2.5">
        {nodes.map((node, i) => {
          const isFirst = i === 0;
          const isLast = i === nodes.length - 1;

          const nodeTone = isLast
            ? "border border-transparent bg-accent-soft"
            : `border border-border bg-surface-muted ${isFirst ? "border-l-[3px] border-l-accent" : ""}`;

          return (
            <div key={i} className="flex items-center gap-2.5">
              <div
                className={`flex min-w-[110px] flex-col items-center rounded-[14px] px-4 py-3 text-center ${nodeTone}`}
              >
                <span className="text-[13px] font-semibold text-text">{node.label}</span>
                <span className="mt-[3px] text-[11px] text-soft">{node.sublabel}</span>
              </div>

              {!isLast && <div className="shrink-0 text-[18px] text-soft">→</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ArchFigure({
  nodes,
  className = "",
  children,
}: ArchDiagramProps & { className?: string; children: React.ReactNode }) {
  return (
    <figure className={`panel p-8 ${className}`}>
      <ArchDiagram nodes={nodes} />
      <figcaption className="mt-5 text-center text-[0.78rem] italic text-soft">{children}</figcaption>
    </figure>
  );
}
