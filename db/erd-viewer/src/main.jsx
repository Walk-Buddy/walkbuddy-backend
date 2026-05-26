/*
 * 개발할 때 DB 스키마를 시각적으로 확인하기 위한 참고용 진입 파일입니다.
 * 실제 배포 시에는 db/erd-viewer 와 함께 삭제하세요.
 */

import React from "react";
import { createRoot } from "react-dom/client";
import ERD from "./ERD.jsx";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ERD />
  </React.StrictMode>
);
