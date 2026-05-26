/*
 * 개발할 때 DB 스키마를 시각적으로 확인하기 위한 참고용 스크립트입니다.
 * 실제 배포 시에는 db/erd-viewer 와 함께 삭제하세요.
 */

const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..");
const SCHEMA_PATH = path.join(__dirname, "schema.sql");
const OUTPUT_PATH = path.join(__dirname, "erd-viewer", "src", "erd-data.js");

const TABLE_LABELS = {
  users: "사용자",
  tags: "태그",
  spots: "스팟",
  courses: "코스",
  course_waypoints: "코스 경유지",
  taggings: "태깅",
  bookmarks: "북마크",
  walk_records: "산책 기록",
  course_reviews: "코스 후기",
  spot_reviews: "스팟 후기",
  reactions: "반응",
  reports: "신고",
  notifications: "알림",
  spot_ai_contents: "AI 음성 안내",
};

const COLUMN_LABELS = {
  user_id: "사용자 ID",
  tag_id: "태그 ID",
  spot_id: "스팟 ID",
  course_id: "코스 ID",
  bookmark_id: "북마크 ID",
  walk_record_id: "산책 기록 ID",
  course_review_id: "후기 ID",
  spot_review_id: "후기 ID",
  report_id: "신고 ID",
  notification_id: "알림 ID",
  owner_id: "등록자 ID",
  reporter_id: "신고자 ID",
  email: "이메일",
  password_hash: "비밀번호 해시",
  nickname: "닉네임",
  profile_image_url: "프로필 이미지",
  social_provider: "소셜 제공자",
  social_id: "소셜 ID",
  role: "역할",
  status: "상태",
  pref_conditions: "선호 조건",
  pref_tag_ids: "선호 태그",
  pref_categories: "선호 카테고리",
  name: "이름",
  type: "유형",
  is_active: "활성화 여부",
  location: "위치",
  address: "주소",
  category: "카테고리",
  categories: "카테고리 목록",
  content_place: "장소 안내 원본",
  content_history: "역사 해설 원본",
  content_tour: "관광 안내 원본",
  recommend_pct: "추천도",
  description: "설명",
  route_geometry: "경로 좌표",
  total_distance: "총 거리",
  estimated_duration: "예상 소요시간",
  is_public: "공개 여부",
  data_source: "데이터 출처",
  source_id: "원본 ID",
  seq: "순서",
  lat: "위도",
  lng: "경도",
  target_id: "대상 ID",
  target_type: "대상 유형",
  actual_route: "실제 경로",
  duration: "소요시간",
  is_completed: "완주 여부",
  started_at: "시작일시",
  ended_at: "종료일시",
  difficulty: "난이도",
  rating: "평점",
  photos: "사진 목록",
  is_recommended: "추천 여부",
  reaction: "반응 유형",
  report_category: "신고 분류",
  reason: "신고 사유",
  memo: "메모",
  photo_url: "사진 URL",
  message: "알림 메시지",
  is_read: "읽음 여부",
  content_type: "콘텐츠 유형",
  script: "AI 대본",
  audio_url: "음성 파일 URL",
  created_at: "생성일시",
  updated_at: "수정일시",
};

const TYPE_TO_TABLE = {
  course: "courses",
  spot: "spots",
  course_review: "course_reviews",
  spot_review: "spot_reviews",
  user: "users",
  report: "reports",
};

const MAX_DOMAIN_VALUES = 8;
const TABLE_CONSTRAINT_START = /^(CONSTRAINT|PRIMARY|FOREIGN|UNIQUE|CHECK)\b/i;
const CONTINUATION_START = /^(AND|OR|ON|WHERE|REFERENCES|DEFERRABLE|INITIALLY)\b/i;

function normalizeSql(sql) {
  return sql.replace(/\r\n/g, "\n");
}

function getCreateTableBlocks(sql) {
  const blocks = [];
  const tableRegex = /CREATE TABLE\s+([a-zA-Z_][\w]*)\s*\(/g;
  let match;

  while ((match = tableRegex.exec(sql)) !== null) {
    const tableName = match[1];
    let index = tableRegex.lastIndex;
    let depth = 1;

    while (index < sql.length && depth > 0) {
      const char = sql[index];
      if (char === "(") depth += 1;
      if (char === ")") depth -= 1;
      index += 1;
    }

    blocks.push({
      name: tableName,
      body: sql.slice(tableRegex.lastIndex, index - 1),
    });
  }

  return blocks;
}

function cleanIdentifier(identifier) {
  return identifier.replace(/"/g, "").trim();
}

function splitTopLevelCommaItems(text) {
  const items = [];
  let current = "";
  let depth = 0;
  let inSingleQuote = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (char === "'" && nextChar === "'") {
      current += char + nextChar;
      index += 1;
      continue;
    }

    if (char === "'") {
      inSingleQuote = !inSingleQuote;
      current += char;
      continue;
    }

    if (!inSingleQuote) {
      if (char === "(") depth += 1;
      if (char === ")") depth -= 1;

      if (char === "," && depth === 0) {
        if (current.trim()) items.push(current.trim());
        current = "";
        continue;
      }
    }

    current += char;
  }

  if (current.trim()) items.push(current.trim());
  return items;
}

function parseColumnLine(line) {
  const trimmed = line.trim().replace(/,$/, "");
  if (
    !trimmed ||
    trimmed.startsWith("--") ||
    TABLE_CONSTRAINT_START.test(trimmed) ||
    CONTINUATION_START.test(trimmed) ||
    trimmed.startsWith(")") ||
    trimmed.startsWith("(")
  ) {
    return null;
  }

  const match = trimmed.match(/^"?([a-zA-Z_][\w]*)"?\s+(.+)$/);
  if (!match) return null;

  const name = cleanIdentifier(match[1]);
  const rest = match[2].trim();
  const type = rest.split(/\s+(?:NOT\s+NULL|NULL|DEFAULT|CONSTRAINT|CHECK|PRIMARY|UNIQUE|REFERENCES)\b/i)[0].trim();
  const nullable = /\bNOT\s+NULL\b/i.test(rest) ? "NN" : "NULL";
  const defaultMatch = rest.match(/\bDEFAULT\s+(.+?)(?:\s+CONSTRAINT|\s+CHECK|\s+PRIMARY|\s+UNIQUE|\s+REFERENCES|$)/i);

  return {
    name,
    type,
    nullable,
    defaultValue: defaultMatch ? defaultMatch[1].trim() : "",
    comments: [],
  };
}

function parsePrimaryKeyColumns(body) {
  const pkColumns = new Set();
  const regex = /PRIMARY KEY\s*\(([^)]+)\)/gi;
  let match;

  while ((match = regex.exec(body)) !== null) {
    match[1]
      .split(",")
      .map(cleanIdentifier)
      .forEach((column) => pkColumns.add(column));
  }

  return pkColumns;
}

function parseForeignKeys(body) {
  const foreignKeys = [];
  const regex = /FOREIGN KEY\s*\(([^)]+)\)\s+REFERENCES\s+([a-zA-Z_][\w]*)\s*\(([^)]+)\)(?:\s+ON\s+DELETE\s+(CASCADE|SET NULL|RESTRICT|NO ACTION|SET DEFAULT))?/gi;
  let match;

  while ((match = regex.exec(body)) !== null) {
    const fromColumns = match[1].split(",").map(cleanIdentifier);
    const toColumns = match[3].split(",").map(cleanIdentifier);
    foreignKeys.push({
      fromColumns,
      toTable: match[2],
      toColumns,
      onDelete: match[4] || "",
    });
  }

  return foreignKeys;
}

function parseUniqueColumns(body) {
  const uniqueColumns = new Map();
  const constraints = splitTopLevelCommaItems(body);

  for (const constraint of constraints) {
    const match = constraint.match(/\bUNIQUE\s*\(([^)]+)\)/i);
    if (!match) continue;

    const columns = match[1].split(",").map(cleanIdentifier);
    const label = columns.length === 1 ? "UNIQUE" : `UNIQUE(${columns.join(", ")})`;

    for (const column of columns) {
      const constraints = uniqueColumns.get(column) || [];
      constraints.push(label);
      uniqueColumns.set(column, constraints);
    }
  }

  return uniqueColumns;
}

function parseUniqueIndexColumns(sql) {
  const uniqueColumnsByTable = new Map();
  const regex = /CREATE UNIQUE INDEX\s+\w+\s+ON\s+([a-zA-Z_][\w]*)\s*\(([^)]+)\)(?:\s+WHERE\s+([^;]+))?/gi;
  let match;

  while ((match = regex.exec(sql)) !== null) {
    const tableName = match[1];
    const columns = match[2].split(",").map((column) => cleanIdentifier(column.trim().split(/\s+/)[0]));
    const whereClause = match[3]?.replace(/\s+/g, " ").trim();
    const labelBase = columns.length === 1 ? "UNIQUE" : `UNIQUE(${columns.join(", ")})`;
    const label = whereClause ? `${labelBase} WHERE ${whereClause}` : labelBase;
    const tableMap = uniqueColumnsByTable.get(tableName) || new Map();

    for (const column of columns) {
      const constraints = tableMap.get(column) || [];
      constraints.push(label);
      tableMap.set(column, constraints);
    }

    uniqueColumnsByTable.set(tableName, tableMap);
  }

  return uniqueColumnsByTable;
}

function parseAllowedTargetTypes(body) {
  const match = body.match(/target_type\s+IN\s*\(([^)]+)\)/i);
  if (!match) return [];

  return match[1]
    .split(",")
    .map((value) => value.replace(/'/g, "").trim())
    .filter(Boolean);
}

function mergeDomainInfo(current, next) {
  const merged = current || {};

  if (next.allowedValues?.length) {
    merged.allowedValues = [...new Set([...(merged.allowedValues || []), ...next.allowedValues])];
  }

  if (next.range) {
    merged.range = next.range;
  }

  if (next.checks?.length) {
    merged.checks = [...new Set([...(merged.checks || []), ...next.checks])];
  }

  return merged;
}

function getSqlWithoutLineComments(sql) {
  return sql
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
}

function parseColumnDomains(body) {
  const domains = new Map();
  const sql = getSqlWithoutLineComments(body).replace(/\s+/g, " ");
  const inRegex = /\b([a-zA-Z_][\w]*)\s+IN\s*\(([^()]+)\)/gi;
  const arraySubsetRegex = /\b([a-zA-Z_][\w]*)\s*<@\s*ARRAY\s*\[([\s\S]*?)\]\s*::\s*TEXT\[\]/gi;
  const betweenRegex = /\b([a-zA-Z_][\w]*)\s+BETWEEN\s+([^\s)]+)\s+AND\s+([^\s)]+)/gi;
  const equalityRegex = /\b([a-zA-Z_][\w]*)\s*=\s*'([^']+)'/gi;
  const numericRegex = /\b([a-zA-Z_][\w]*)\s*(>=|<=|>|<)\s*([0-9.]+)/gi;
  const arrayLengthRegex = /array_length\s*\(\s*([a-zA-Z_][\w]*)\s*,\s*1\s*\)\s*(>=|<=|>|<)\s*([0-9]+)/gi;
  const charLengthRegex = /char_length\s*\(\s*([a-zA-Z_][\w]*)\s*\)\s*(>=|<=|>|<)\s*([0-9]+)/gi;
  let match;

  while ((match = inRegex.exec(sql)) !== null) {
    const column = cleanIdentifier(match[1]);
    const allowedValues = (match[2].match(/'([^']*)'/g) || [])
      .map((value) => value.slice(1, -1))
      .filter(Boolean);

    if (allowedValues.length > 0) {
      domains.set(column, mergeDomainInfo(domains.get(column), { allowedValues }));
    }
  }

  while ((match = arraySubsetRegex.exec(sql)) !== null) {
    const column = cleanIdentifier(match[1]);
    const allowedValues = (match[2].match(/'([^']*)'/g) || [])
      .map((value) => value.slice(1, -1))
      .filter(Boolean);

    if (allowedValues.length > 0) {
      domains.set(column, mergeDomainInfo(domains.get(column), { allowedValues }));
    }
  }

  while ((match = betweenRegex.exec(sql)) !== null) {
    const column = cleanIdentifier(match[1]);
    domains.set(column, mergeDomainInfo(domains.get(column), {
      range: `${match[2]}~${match[3]}`,
    }));
  }

  while ((match = equalityRegex.exec(sql)) !== null) {
    const column = cleanIdentifier(match[1]);
    domains.set(column, mergeDomainInfo(domains.get(column), {
      allowedValues: [match[2]],
    }));
  }

  while ((match = numericRegex.exec(sql)) !== null) {
    const column = cleanIdentifier(match[1]);
    domains.set(column, mergeDomainInfo(domains.get(column), {
      checks: [`CHECK ${match[2]} ${match[3]}`],
    }));
  }

  while ((match = charLengthRegex.exec(sql)) !== null) {
    const column = cleanIdentifier(match[1]);
    domains.set(column, mergeDomainInfo(domains.get(column), {
      checks: [`길이 ${match[2]} ${match[3]}`],
    }));
  }

  while ((match = arrayLengthRegex.exec(sql)) !== null) {
    const column = cleanIdentifier(match[1]);
    domains.set(column, mergeDomainInfo(domains.get(column), {
      checks: [`array_length ${match[2]} ${match[3]}`],
    }));
  }

  if (/type\s*=\s*'spot'[\s\S]*spot_id\s+IS\s+NOT\s+NULL[\s\S]*lat\s+IS\s+NULL[\s\S]*lng\s+IS\s+NULL/i.test(sql)) {
    domains.set("type", mergeDomainInfo(domains.get("type"), {
      checks: ["spot: spot_id 필수, lat/lng NULL"],
    }));
    domains.set("spot_id", mergeDomainInfo(domains.get("spot_id"), {
      checks: ["spot일 때 필수, pin일 때 NULL"],
    }));
    domains.set("lat", mergeDomainInfo(domains.get("lat"), {
      checks: ["pin일 때 필수, spot일 때 NULL"],
    }));
    domains.set("lng", mergeDomainInfo(domains.get("lng"), {
      checks: ["pin일 때 필수, spot일 때 NULL"],
    }));
  }

  if (/target_id\s+IS\s+NOT\s+NULL[\s\S]*location\s+IS\s+NULL[\s\S]*target_id\s+IS\s+NULL[\s\S]*location\s+IS\s+NOT\s+NULL/i.test(sql)) {
    domains.set("target_id", mergeDomainInfo(domains.get("target_id"), {
      checks: ["target_id/location 중 하나만 필수"],
    }));
    domains.set("location", mergeDomainInfo(domains.get("location"), {
      checks: ["target_id/location 중 하나만 필수"],
    }));
  }

  if (/ended_at\s+IS\s+NULL\s+OR\s+ended_at\s*>=\s*started_at/i.test(sql)) {
    domains.set("ended_at", mergeDomainInfo(domains.get("ended_at"), {
      checks: ["ended_at >= started_at"],
    }));
  }

  if (/target_type\s*=\s*'location'\s+AND\s+location\s+IS\s+NOT\s+NULL/i.test(sql)) {
    domains.set("target_type", mergeDomainInfo(domains.get("target_type"), {
      checks: ["location은 위치 신고"],
    }));
  }

  return domains;
}

function getDomainMemo(domainInfo) {
  if (!domainInfo) return "";

  const parts = [];
  if (domainInfo.allowedValues?.length) {
    const visibleValues = domainInfo.allowedValues.slice(0, MAX_DOMAIN_VALUES);
    const suffix = domainInfo.allowedValues.length > MAX_DOMAIN_VALUES
      ? ` / 외 ${domainInfo.allowedValues.length - MAX_DOMAIN_VALUES}개`
      : "";
    parts.push(`허용값: ${visibleValues.join(" / ")}${suffix}`);
  }
  if (domainInfo.range) {
    parts.push(`허용범위: ${domainInfo.range}`);
  }
  if (domainInfo.checks?.length) {
    parts.push(...domainInfo.checks);
  }

  return parts.join(". ");
}

function getColumnMemo(column, domainInfo, constraints) {
  const domainMemo = getDomainMemo(domainInfo);
  const memoParts = [];

  if (column.defaultValue) {
    memoParts.push(`DEFAULT ${column.defaultValue}`);
  }
  if (domainMemo) memoParts.push(domainMemo);
  memoParts.push(...constraints);

  return memoParts.join(". ");
}

function getAppValidationMemo(columnName, tableName) {
  if (tableName === "users" && columnName === "pref_tag_ids") {
    return "태그 ID/type 앱 검증";
  }

  if (tableName === "users" && columnName === "pref_categories") {
    return "카테고리 허용값 앱 검증";
  }

  if (["bookmarks", "reactions", "reports", "notifications", "taggings"].includes(tableName) && columnName === "target_id") {
    return "target_type별 대상 존재 앱 검증";
  }

  return "";
}

function getColumnLabel(columnName) {
  return COLUMN_LABELS[columnName] || columnName.replace(/_/g, " ");
}

function parseColumns(tableName, body, primaryKeyColumns, foreignKeys, uniqueColumns) {
  const columns = [];
  const columnDomains = parseColumnDomains(body);
  const foreignKeyColumns = new Set(foreignKeys.flatMap((fk) => fk.fromColumns));
  let currentColumn = null;

  for (const line of body.split("\n")) {
    const parsedColumn = parseColumnLine(line);

    if (parsedColumn) {
      if (currentColumn) columns.push(currentColumn);
      currentColumn = parsedColumn;
      continue;
    }

    const trimmed = line.trim();
    if (/^(CONSTRAINT|PRIMARY|FOREIGN|UNIQUE|CHECK)\b/i.test(trimmed)) {
      if (currentColumn) columns.push(currentColumn);
      currentColumn = null;
      continue;
    }

    if (currentColumn && trimmed.startsWith("--")) {
      currentColumn.comments.push(trimmed);
    }
  }

  if (currentColumn) columns.push(currentColumn);

  return columns.map((column) => {
    const isPk = primaryKeyColumns.has(column.name);
    const isFk = foreignKeyColumns.has(column.name);
    const constraints = [];
    let key = "";

    if (isPk && isFk) key = "PK/FK";
    else if (isPk) key = "PK";
    else if (isFk) key = "FK";

    const matchingForeignKey = foreignKeys.find((fk) => fk.fromColumns.includes(column.name));
    if (matchingForeignKey) {
      const onDelete = matchingForeignKey.onDelete ? ` ON DELETE ${matchingForeignKey.onDelete}` : "";
      constraints.push(`FK -> ${matchingForeignKey.toTable}(${matchingForeignKey.toColumns.join(", ")})${onDelete}`);
    }

    constraints.push(...(uniqueColumns.get(column.name) || []));

    const appValidationMemo = getAppValidationMemo(column.name, tableName);
    if (appValidationMemo) {
      constraints.push(appValidationMemo);
    }

    if (tableName === "notifications" && column.name === "target_type") {
      constraints.push("NULL 가능");
    }

    return {
      key,
      ko: getColumnLabel(column.name),
      en: column.name,
      type: column.type,
      null: column.nullable,
      memo: getColumnMemo(column, columnDomains.get(column.name), [...new Set(constraints)]),
      fkCheck: Boolean(appValidationMemo),
    };
  });
}

function addRelation(relations, relation) {
  const relationKey = `${relation.from}->${relation.to}:${relation.label}:${relation.fk}`;
  if (relations.some((item) => `${item.from}->${item.to}:${item.label}:${item.fk}` === relationKey)) {
    return;
  }

  relations.push(relation);
}

function buildErdData(sql) {
  const tables = [];
  const relations = [];
  const blocks = getCreateTableBlocks(sql);
  const uniqueIndexColumnsByTable = parseUniqueIndexColumns(sql);

  for (const block of blocks) {
    const primaryKeyColumns = parsePrimaryKeyColumns(block.body);
    const foreignKeys = parseForeignKeys(block.body);
    const uniqueColumns = parseUniqueColumns(block.body);
    const uniqueIndexColumns = uniqueIndexColumnsByTable.get(block.name);

    if (uniqueIndexColumns) {
      for (const [column, constraints] of uniqueIndexColumns.entries()) {
        uniqueColumns.set(column, [
          ...(uniqueColumns.get(column) || []),
          ...constraints,
        ]);
      }
    }

    tables.push({
      id: block.name,
      ko: TABLE_LABELS[block.name] || block.name,
      en: block.name,
      cols: parseColumns(block.name, block.body, primaryKeyColumns, foreignKeys, uniqueColumns),
    });

    for (const foreignKey of foreignKeys) {
      addRelation(relations, {
        from: foreignKey.toTable,
        to: block.name,
        label: "1:N",
        fk: true,
      });
    }

    for (const targetType of parseAllowedTargetTypes(block.body)) {
      const targetTable = TYPE_TO_TABLE[targetType];
      if (!targetTable || targetTable === block.name) continue;

      addRelation(relations, {
        from: block.name,
        to: targetTable,
        label: "1:N",
        fk: false,
      });
    }
  }

  const usersTable = tables.find((table) => table.id === "users");
  if (usersTable) {
    addRelation(relations, { from: "users", to: "tags", label: "N:M", fk: false });
    addRelation(relations, { from: "users", to: "spots", label: "pref_categories", fk: false });
    addRelation(relations, { from: "users", to: "courses", label: "pref_categories", fk: false });
  }

  return { tables, relations };
}

function writeErdData(data) {
  const generatedAt = new Date().toISOString();
  const source = `/*
 * 개발할 때 DB 스키마를 시각적으로 확인하기 위한 참고용 자동 생성 파일입니다.
 * 실제 배포 시에는 db/erd-viewer 와 함께 삭제하세요.
 * 직접 수정하지 말고 db/schema.sql 수정 후 npm run erd:gen 또는 npm run db 를 실행하세요.
 */

export const GENERATED_AT = ${JSON.stringify(generatedAt)};
export const TABLES = ${JSON.stringify(data.tables, null, 2)};
export const RELATIONS = ${JSON.stringify(data.relations, null, 2)};
`;

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, source);
}

function main() {
  const sql = normalizeSql(fs.readFileSync(SCHEMA_PATH, "utf8"));
  const data = buildErdData(sql);
  writeErdData(data);

  const relativeOutput = path.relative(ROOT_DIR, OUTPUT_PATH);
  console.log(`ERD data generated: ${relativeOutput}`);
  console.log(`Tables: ${data.tables.length}, relations: ${data.relations.length}`);
  console.log("ERD 데이터 갱신 완료. 화면 서버가 실행되면 터미널의 Local URL을 브라우저에서 여세요.");
}

main();
