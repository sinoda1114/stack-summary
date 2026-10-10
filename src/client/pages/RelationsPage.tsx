import { Stack, Text, Title } from "@mantine/core";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import type { RelationKind } from "../../shared/relations";
import { requestJson } from "../api";

type RelationGraph = {
  nodes: { id: string; name: string }[];
  edges: { fromId: string; toId: string; kind: RelationKind }[];
};

const COLUMN_WIDTH = 180;
const ROW_HEIGHT = 88;

export function RelationsPage() {
  const [graph, setGraph] = useState<RelationGraph | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    void requestJson<RelationGraph>("/api/relations").then((result) => {
      if (!current) {
        return;
      }
      if (!result.success) {
        setGraph(null);
        setLoadError(result.error.message);
        return;
      }
      setLoadError(null);
      setGraph(result.data);
    });
    return () => {
      current = false;
    };
  }, []);

  return (
    <Stack gap="lg">
      <Title order={1}>関係</Title>
      {loadError === null ? null : <Text className="note">{loadError}</Text>}
      {graph === null || graph.nodes.length === 0 ? (
        loadError === null && graph !== null ? <Text>関係はまだありません</Text> : null
      ) : (
        <RelationMap graph={graph} />
      )}
    </Stack>
  );
}

function RelationMap(props: { graph: RelationGraph }) {
  const columns = Math.max(1, Math.ceil(Math.sqrt(props.graph.nodes.length)));
  const rows = Math.ceil(props.graph.nodes.length / columns);
  const width = columns * COLUMN_WIDTH;
  const height = rows * ROW_HEIGHT;
  const points = new Map(
    props.graph.nodes.map((node, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      return [
        node.id,
        {
          x: column * COLUMN_WIDTH + COLUMN_WIDTH / 2,
          y: row * ROW_HEIGHT + ROW_HEIGHT / 2,
        },
      ];
    }),
  );

  return (
    <div className="section-card">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="技術の関係"
        style={{ display: "block", width: "100%", height: "auto" }}
      >
        <defs>
          <marker
            id="relation-arrow"
            markerWidth="8"
            markerHeight="8"
            refX="8"
            refY="4"
            orient="auto"
          >
            <path d="M0,0 L8,4 L0,8 Z" fill="currentColor" />
          </marker>
        </defs>
        {props.graph.edges.map((edge) => {
          const from = points.get(edge.fromId);
          const to = points.get(edge.toId);
          if (from === undefined || to === undefined) {
            return null;
          }
          const end = stopBefore(from, to, 36);
          const labelX = (from.x + end.x) / 2;
          const labelY = (from.y + end.y) / 2 - 8;
          return (
            <g key={`${edge.fromId}:${edge.toId}`}>
              <line
                x1={from.x}
                y1={from.y}
                x2={end.x}
                y2={end.y}
                stroke="currentColor"
                strokeWidth="1"
                markerEnd="url(#relation-arrow)"
              />
              <text x={labelX} y={labelY} textAnchor="middle" fontSize="12">
                {edge.kind}
              </text>
            </g>
          );
        })}
        {props.graph.nodes.map((node) => {
          const point = points.get(node.id);
          if (point === undefined) {
            return null;
          }
          return (
            <Link key={node.id} to={`/techs/${node.id}`}>
              <text
                x={point.x}
                y={point.y}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="14"
              >
                {node.name}
              </text>
            </Link>
          );
        })}
      </svg>
    </div>
  );
}

function stopBefore(
  from: { x: number; y: number },
  to: { x: number; y: number },
  gap: number,
): { x: number; y: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length <= gap) {
    return to;
  }
  const scale = (length - gap) / length;
  return { x: from.x + dx * scale, y: from.y + dy * scale };
}
