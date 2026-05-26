/*
 * 개발할 때 DB 스키마를 시각적으로 확인하기 위한 참고용 React ERD 뷰어입니다.
 * 실제 배포 시에는 db/erd-viewer 와 함께 삭제하세요.
 */

import { useEffect, useMemo, useState } from "react";
import { GENERATED_AT, RELATIONS, TABLES } from "./erd-data.js";

const POSITION_STORAGE_KEY = "walkbuddy-dev-erd-positions-v2";

const COLORS = {
  pk: { bg: "#e8f2ff", text: "#13518f" },
  fk: { bg: "#eaf6e7", text: "#22621f" },
  pkfk: { bg: "#efedff", text: "#473aa3" },
};

const TBL_W = 960;
const ROW_MIN_H = 30;
const HEAD_H = 42;
const COL_H = 24;
const MEMO_CHARS_PER_LINE = 88;
const COLUMN_COUNT = 3;
const CANVAS_PADDING = 60;
const TABLE_GAP_X = 140;
const TABLE_GAP_Y = 70;

function fallbackPositions() {
  const columnHeights = Array(COLUMN_COUNT).fill(CANVAS_PADDING);
  const positions = {};

  for (const table of TABLES) {
    const col = columnHeights.indexOf(Math.min(...columnHeights));
    positions[table.id] = {
      x: CANVAS_PADDING + col * (TBL_W + TABLE_GAP_X),
      y: columnHeights[col],
    };
    columnHeights[col] += tableHeight(table) + TABLE_GAP_Y;
  }

  return positions;
}

function loadSavedPositions() {
  try {
    const saved = JSON.parse(localStorage.getItem(POSITION_STORAGE_KEY) || "{}");
    return { ...fallbackPositions(), ...saved };
  } catch (_) {
    return fallbackPositions();
  }
}

function savePositions(positions) {
  localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(positions));
}

function rowHeight(column) {
  const memoLength = (column.memo || "").length + (column.fkCheck ? 8 : 0);
  const memoLines = Math.max(1, Math.ceil(memoLength / MEMO_CHARS_PER_LINE));
  return Math.max(ROW_MIN_H, 16 + memoLines * 16);
}

function tableHeight(table) {
  return HEAD_H + COL_H + table.cols.reduce((sum, column) => sum + rowHeight(column), 0) + 2;
}

function Badge({ type }) {
  if (!type) return null;

  const color = type === "PK/FK" ? COLORS.pkfk : type === "PK" ? COLORS.pk : COLORS.fk;
  return (
    <span className="badge" style={{ background: color.bg, color: color.text }}>
      {type}
    </span>
  );
}

function TableNode({ table, pos, isSelected, connectionType, dim, onMouseDown, onClick }) {
  const className = [
    "table-node",
    isSelected ? "is-selected" : "",
    connectionType === "fk" ? "is-fk-connected" : "",
    connectionType === "check" ? "is-check-connected" : "",
    dim ? "is-dimmed" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <section
      className={className}
      style={{ left: pos.x, top: pos.y, width: TBL_W, height: tableHeight(table) }}
      onClick={onClick}
      onMouseDown={onMouseDown}
    >
      <header className="table-head">
        <strong>{table.ko}</strong>
        <code>{table.en}</code>
      </header>
      <div className="column-head">
        <span>키</span>
        <span>한글명</span>
        <span>영문명</span>
        <span>타입</span>
        <span>NULL</span>
        <span>메모</span>
      </div>
      {table.cols.map((col) => (
        <div className="column-row" key={`${table.id}-${col.en}`} style={{ minHeight: rowHeight(col) }}>
          <span><Badge type={col.key} /></span>
          <span>{col.ko}</span>
          <code>{col.en}</code>
          <code>{col.type}</code>
          <span className={col.null === "NN" ? "not-null" : ""}>
            {col.null === "NN" ? "NOT NULL" : "NULL"}
          </span>
          <span className="memo" title={col.memo}>
            {col.fkCheck && <em>FK불가</em>}
            {col.memo}
          </span>
        </div>
      ))}
    </section>
  );
}

function getAnchorPoints(pos, tableId) {
  const table = TABLES.find((item) => item.id === tableId);
  const height = tableHeight(table);
  const cx = pos.x + TBL_W / 2;
  const cy = pos.y + height / 2;

  return {
    top: { x: cx, y: pos.y },
    bottom: { x: cx, y: pos.y + height },
    left: { x: pos.x, y: cy },
    right: { x: pos.x + TBL_W, y: cy },
    cx,
    cy,
  };
}

function getBestAnchors(fromPos, toPos, fromId, toId) {
  const fromAnchors = getAnchorPoints(fromPos, fromId);
  const toAnchors = getAnchorPoints(toPos, toId);
  const dx = toAnchors.cx - fromAnchors.cx;
  const dy = toAnchors.cy - fromAnchors.cy;

  if (Math.abs(dx) > Math.abs(dy)) {
    return {
      fromAnchor: dx > 0 ? fromAnchors.right : fromAnchors.left,
      toAnchor: dx > 0 ? toAnchors.left : toAnchors.right,
    };
  }

  return {
    fromAnchor: dy > 0 ? fromAnchors.bottom : fromAnchors.top,
    toAnchor: dy > 0 ? toAnchors.top : toAnchors.bottom,
  };
}

function RelationLine({ relation, positions, selected, dim, onSelect }) {
  const fromPos = positions[relation.from];
  const toPos = positions[relation.to];
  if (!fromPos || !toPos) return null;

  const { fromAnchor, toAnchor } = getBestAnchors(fromPos, toPos, relation.from, relation.to);
  const x1 = fromAnchor.x;
  const y1 = fromAnchor.y;
  const x2 = toAnchor.x;
  const y2 = toAnchor.y;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const stroke = selected ? (relation.fk ? "#22a35a" : "#d97706") : "#85827b";
  const pathD = `M${x1},${y1} C${x1 + dx * 0.5},${y1} ${x2 - dx * 0.5},${y2} ${x2},${y2}`;

  return (
    <g className={dim ? "relation is-dimmed" : "relation"}>
      <path d={pathD} fill="none" stroke="transparent" strokeWidth="18" onClick={onSelect} />
      <path
        d={pathD}
        fill="none"
        stroke={stroke}
        strokeWidth={selected ? 2.6 : 1.5}
        strokeDasharray={relation.fk ? "none" : "5 4"}
      />
      <circle cx={x1} cy={y1} r="4" fill={stroke} />
      <path d={`M${x2 - 10},${y2 - 6} L${x2},${y2} L${x2 - 10},${y2 + 6}`} fill="none" stroke={stroke} strokeWidth="2" />
      <rect
        x={mx - 45}
        y={my - 12}
        width="90"
        height="22"
        rx="4"
        fill={selected ? (relation.fk ? "#dcfce7" : "#fef3c7") : "#fffdf8"}
        stroke={selected ? stroke : "#dfd9cf"}
        onClick={onSelect}
      />
      <text x={mx} y={my + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill={stroke}>
        {relation.label}
      </text>
    </g>
  );
}

export default function ERD() {
  const [selectedTable, setSelectedTable] = useState("");
  const [selectedRelation, setSelectedRelation] = useState(null);
  const [showCheckRelations, setShowCheckRelations] = useState(true);
  const [positions, setPositions] = useState(loadSavedPositions);
  const [dragging, setDragging] = useState(null);

  const visibleRelations = showCheckRelations ? RELATIONS : RELATIONS.filter((relation) => relation.fk);

  const connected = useMemo(() => {
    const result = new Map();
    if (!selectedTable) return result;

    for (const relation of visibleRelations) {
      if (relation.from === selectedTable) result.set(relation.to, relation.fk ? "fk" : "check");
      if (relation.to === selectedTable) result.set(relation.from, relation.fk ? "fk" : "check");
    }

    return result;
  }, [selectedTable, visibleRelations]);

  useEffect(() => {
    if (!dragging) return undefined;

    function handleMouseMove(event) {
      setPositions((current) => ({
        ...current,
        [dragging.tableId]: {
          x: Math.max(20, dragging.startX + event.clientX - dragging.pointerX),
          y: Math.max(20, dragging.startY + event.clientY - dragging.pointerY),
        },
      }));
    }

    function handleMouseUp() {
      setPositions((current) => {
        savePositions(current);
        return current;
      });
      setDragging(null);
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragging]);

  const canvas = useMemo(() => {
    const values = Object.values(positions);
    return {
      width: Math.max(...values.map((pos) => pos.x)) + TBL_W + 120,
      height: Math.max(...TABLES.map((table) => (positions[table.id]?.y || 0) + tableHeight(table))) + 120,
    };
  }, [positions]);

  return (
    <main>
      <aside className="toolbar">
        <div>
          <strong>WalkBuddy ERD</strong>
          <span>schema.sql 기준 자동 생성</span>
        </div>
        <div className="legend" aria-label="관계선 의미">
          <span><i className="legend-dot fk" />초록: DB FK 관계</span>
          <span><i className="legend-dot check" />주황: 앱/CHECK 검증 관계</span>
        </div>
        <label>
          <input
            type="checkbox"
            checked={showCheckRelations}
            onChange={(event) => setShowCheckRelations(event.target.checked)}
          />
          FK 불가 관계 표시
        </label>
        <span className="meta">
          {TABLES.length} tables · {RELATIONS.length} relations · {new Date(GENERATED_AT).toLocaleString("ko-KR")}
        </span>
        <button
          type="button"
          className="reset-button"
          onClick={() => {
            const nextPositions = fallbackPositions();
            setPositions(nextPositions);
            savePositions(nextPositions);
          }}
        >
          배치 초기화
        </button>
      </aside>

      <div className="canvas-wrap" onClick={() => { setSelectedTable(""); setSelectedRelation(null); }}>
        <div className="canvas" style={{ width: canvas.width, height: canvas.height }}>
          <svg width={canvas.width} height={canvas.height}>
            {visibleRelations.map((relation, index) => {
              const selected = selectedRelation === index;
              const relatedToSelectedTable = selectedTable
                && (relation.from === selectedTable || relation.to === selectedTable);
              const dim = selectedTable && !relatedToSelectedTable;
              return (
                <RelationLine
                  key={`${relation.from}-${relation.to}-${relation.label}-${index}`}
                  relation={relation}
                  positions={positions}
                  selected={selected || relatedToSelectedTable}
                  dim={dim}
                  onSelect={(event) => {
                    event.stopPropagation();
                    setSelectedRelation(index);
                    setSelectedTable("");
                  }}
                />
              );
            })}
          </svg>

          {TABLES.map((table) => (
            <TableNode
              key={table.id}
              table={table}
              pos={positions[table.id]}
              isSelected={selectedTable === table.id}
              connectionType={connected.get(table.id)}
              dim={selectedTable && selectedTable !== table.id && !connected.has(table.id)}
              onClick={(event) => {
                event.stopPropagation();
                setSelectedTable(table.id);
                setSelectedRelation(null);
              }}
              onMouseDown={(event) => {
                if (event.button !== 0) return;
                setDragging({
                  tableId: table.id,
                  pointerX: event.clientX,
                  pointerY: event.clientY,
                  startX: positions[table.id].x,
                  startY: positions[table.id].y,
                });
              }}
            />
          ))}
        </div>
      </div>
    </main>
  );
}
