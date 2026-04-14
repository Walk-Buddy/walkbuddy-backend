-- ============================================================
-- WALKBUDDY DB SCHEMA (테이블 생성 순서 수정본 v8 기준)
-- 원본: 260410_WALKBUDDY_DB.sql
-- 수정: course_reviews가 activity_records를 참조하므로
--       activity_records 생성 이후로 순서 조정
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- ── 공통 트리거 함수 ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ── [1] users ─────────────────────────────────────────────────
CREATE TABLE users (
    user_id             UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    username            VARCHAR(20)     NOT NULL UNIQUE,
    email               VARCHAR(255)    NOT NULL,
    password_hash       VARCHAR(255),
    login_type          VARCHAR(20)     NOT NULL DEFAULT 'local',
    oauth_provider_id   VARCHAR(255),
    nickname            VARCHAR(12)     NOT NULL UNIQUE,
    profile_image_url   TEXT,
    bio                 VARCHAR(200),
    settings_json       JSONB           NOT NULL DEFAULT '{}',
    is_active           BOOLEAN         NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_username_format  CHECK (username ~ '^[a-zA-Z0-9]{6,20}$'),
    CONSTRAINT chk_nickname_format  CHECK (nickname ~ '^[a-zA-Z0-9가-힣]{2,12}$'),
    CONSTRAINT chk_login_type       CHECK (login_type IN ('local', 'kakao')),
    CONSTRAINT uq_email_per_provider UNIQUE (login_type, email),
    CONSTRAINT uq_oauth_provider     UNIQUE (login_type, oauth_provider_id)
);
CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ── [2] email_verifications ───────────────────────────────────
CREATE TABLE email_verifications (
    verification_id UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    email           VARCHAR(255) NOT NULL,
    code            VARCHAR(6)   NOT NULL,
    is_verified     BOOLEAN      NOT NULL DEFAULT FALSE,
    expires_at      TIMESTAMPTZ  NOT NULL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_email_verif_email   ON email_verifications(email);
CREATE INDEX idx_email_verif_expires ON email_verifications(expires_at);


-- ── [3] master_tags ───────────────────────────────────────────
CREATE TABLE master_tags (
    tag_id      UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    tag_name    VARCHAR(30)  NOT NULL UNIQUE,
    category    VARCHAR(20),
    status      VARCHAR(20)  NOT NULL DEFAULT 'approved',
    user_id     UUID         REFERENCES users(user_id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_tag_status CHECK (status IN ('pending', 'approved', 'rejected', 'inactive'))
);
CREATE INDEX idx_master_tags_status ON master_tags(status, created_at DESC);


-- ── [4] user_preferences ─────────────────────────────────────
CREATE TABLE user_preferences (
    user_preference_id UUID      PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id            UUID      NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    tag_id             UUID      NOT NULL REFERENCES master_tags(tag_id) ON DELETE CASCADE,
    preference_score   SMALLINT  NOT NULL DEFAULT 3,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_user_preference_tag UNIQUE (user_id, tag_id),
    CONSTRAINT chk_preference_score   CHECK (preference_score BETWEEN 1 AND 5)
);
CREATE INDEX idx_user_pref_user ON user_preferences(user_id);
CREATE INDEX idx_user_pref_tag  ON user_preferences(tag_id);
CREATE TRIGGER trg_user_preferences_updated_at
    BEFORE UPDATE ON user_preferences
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ── [5] courses ───────────────────────────────────────────────
CREATE TABLE courses (
    course_id           UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID         REFERENCES users(user_id) ON DELETE SET NULL,
    title               VARCHAR(100) NOT NULL,
    description         TEXT,
    creation_type       VARCHAR(10)  NOT NULL DEFAULT 'manual',
    total_distance_km   FLOAT        NOT NULL DEFAULT 0,
    estimated_minutes   INT          NOT NULL DEFAULT 0,
    difficulty          SMALLINT     NOT NULL DEFAULT 1,
    visibility          VARCHAR(10)  NOT NULL DEFAULT 'public',
    is_deleted          BOOLEAN      NOT NULL DEFAULT FALSE,
    is_hidden           BOOLEAN      NOT NULL DEFAULT FALSE,
    report_count        INT          NOT NULL DEFAULT 0,
    full_route          GEOMETRY(LineString, 4326),
    bookmark_count      INT          NOT NULL DEFAULT 0,
    avg_rating          FLOAT        NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_creation_type  CHECK (creation_type IN ('manual', 'auto')),
    CONSTRAINT chk_visibility     CHECK (visibility IN ('public', 'private')),
    CONSTRAINT chk_difficulty     CHECK (difficulty BETWEEN 1 AND 3),
    CONSTRAINT chk_distance       CHECK (total_distance_km >= 0),
    CONSTRAINT chk_estimated_min  CHECK (estimated_minutes >= 0),
    CONSTRAINT chk_report_count   CHECK (report_count >= 0),
    CONSTRAINT chk_bookmark_count CHECK (bookmark_count >= 0),
    CONSTRAINT chk_avg_rating     CHECK (avg_rating BETWEEN 0 AND 5)
);
CREATE INDEX idx_courses_stats ON courses(bookmark_count DESC, avg_rating DESC, created_at DESC)
    WHERE is_deleted = FALSE;
CREATE INDEX idx_courses_user ON courses(user_id)
    WHERE is_deleted = FALSE;
CREATE TRIGGER trg_courses_updated_at
    BEFORE UPDATE ON courses
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ── [6] course_tags ───────────────────────────────────────────
CREATE TABLE course_tags (
    course_tag_id UUID NOT NULL PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id     UUID NOT NULL REFERENCES courses(course_id) ON DELETE CASCADE,
    tag_id        UUID NOT NULL REFERENCES master_tags(tag_id) ON DELETE CASCADE,
    CONSTRAINT uq_course_tag_mapping UNIQUE (course_id, tag_id)
);
CREATE INDEX idx_course_tags_tag ON course_tags(tag_id);


-- ── [7] nodes ─────────────────────────────────────────────────
CREATE TABLE nodes (
    node_id       UUID                  PRIMARY KEY DEFAULT uuid_generate_v4(),
    node_type     VARCHAR(10)           NOT NULL,
    location      GEOMETRY(Point, 4326) NOT NULL,
    label         VARCHAR(50),
    user_id       UUID                  REFERENCES users(user_id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ           NOT NULL DEFAULT NOW(),
    name          VARCHAR(100),
    description   TEXT,
    content_types JSONB,
    is_deleted    BOOLEAN,
    is_hidden     BOOLEAN,
    report_count  INT,
    updated_at    TIMESTAMPTZ,
    CONSTRAINT chk_node_type CHECK (node_type IN ('spot', 'pin')),
    CONSTRAINT chk_spot_name_required CHECK (node_type != 'spot' OR name IS NOT NULL),
    CONSTRAINT chk_pin_name_null      CHECK (node_type != 'pin' OR name IS NULL),
    CONSTRAINT chk_pin_cols_null      CHECK (
        node_type != 'pin' OR (
            description IS NULL AND content_types IS NULL AND
            is_deleted IS NULL AND is_hidden IS NULL AND
            report_count IS NULL AND updated_at IS NULL
        )
    ),
    CONSTRAINT chk_spot_flags_not_null CHECK (node_type != 'spot' OR (
        is_deleted IS NOT NULL AND is_hidden IS NOT NULL AND report_count IS NOT NULL
    )),
    CONSTRAINT chk_node_report_count CHECK (report_count IS NULL OR report_count >= 0)
);
CREATE INDEX idx_nodes_location    ON nodes USING GIST(location);
CREATE INDEX idx_nodes_spot_active ON nodes(user_id)
    WHERE node_type = 'spot' AND is_deleted = FALSE;
CREATE INDEX idx_nodes_type ON nodes(node_type);

CREATE OR REPLACE FUNCTION set_nodes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.node_type = 'spot' THEN
        NEW.updated_at = NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_nodes_updated_at
    BEFORE UPDATE ON nodes
    FOR EACH ROW EXECUTE FUNCTION set_nodes_updated_at();


-- ── [8] spot_images ───────────────────────────────────────────
CREATE TABLE spot_images (
    spot_image_id  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    node_id        UUID        NOT NULL REFERENCES nodes(node_id) ON DELETE CASCADE,
    image_url      TEXT        NOT NULL,
    caption        TEXT,
    display_order  SMALLINT    NOT NULL DEFAULT 0,
    user_id        UUID        REFERENCES users(user_id) ON DELETE SET NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_spot_images_node ON spot_images(node_id);


-- ── [9] course_path ───────────────────────────────────────────
CREATE TABLE course_path (
    course_path_id UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id      UUID          NOT NULL REFERENCES courses(course_id) ON DELETE CASCADE,
    node_id        UUID          NOT NULL REFERENCES nodes(node_id)    ON DELETE CASCADE,
    node_order     NUMERIC(10,4) NOT NULL,
    CONSTRAINT uq_course_path_node UNIQUE (course_id, node_id)
);
CREATE INDEX idx_course_path_order ON course_path(course_id, node_order ASC);
CREATE INDEX idx_course_path_node  ON course_path(node_id);


-- ── [10] activity_records ─────────────────────────────────────
CREATE TABLE activity_records (
    activity_record_id  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID        NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    course_id           UUID        REFERENCES courses(course_id) ON DELETE SET NULL,
    started_at          TIMESTAMPTZ NOT NULL,
    ended_at            TIMESTAMPTZ,
    duration_seconds    INT         NOT NULL DEFAULT 0,
    actual_distance_km  FLOAT       NOT NULL DEFAULT 0,
    step_count          INT         NOT NULL DEFAULT 0,
    actual_route        GEOMETRY(LineString, 4326),
    is_completed        BOOLEAN     NOT NULL DEFAULT FALSE,
    status              VARCHAR(20) NOT NULL DEFAULT 'active',
    pause_count         INT         NOT NULL DEFAULT 0,
    paused_seconds      INT         NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_activity_status CHECK (status IN ('active', 'paused', 'completed')),
    CONSTRAINT chk_actual_distance CHECK (actual_distance_km >= 0),
    CONSTRAINT chk_duration        CHECK (duration_seconds >= 0),
    CONSTRAINT chk_paused_seconds  CHECK (paused_seconds >= 0),
    CONSTRAINT chk_pause_count     CHECK (pause_count >= 0),
    CONSTRAINT chk_step_count      CHECK (step_count >= 0),
    CONSTRAINT chk_activity_time   CHECK (ended_at IS NULL OR ended_at > started_at)
);
CREATE INDEX idx_activity_user ON activity_records(user_id, started_at DESC);


-- ── [11] reports ──────────────────────────────────────────────
CREATE TABLE reports (
    report_id          UUID                  PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id            UUID                  NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    course_id          UUID                  REFERENCES courses(course_id) ON DELETE CASCADE,
    node_id            UUID                  REFERENCES nodes(node_id) ON DELETE CASCADE,
    activity_record_id UUID                  REFERENCES activity_records(activity_record_id) ON DELETE SET NULL,
    location           GEOMETRY(Point, 4326) NOT NULL,
    report_type        VARCHAR(20)           NOT NULL,
    description        TEXT,
    status             VARCHAR(20)           NOT NULL DEFAULT 'active',
    created_at         TIMESTAMPTZ           NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_report_target CHECK (course_id IS NOT NULL OR node_id IS NOT NULL),
    CONSTRAINT chk_report_type   CHECK (report_type IN ('공사중','통행불가','위험구간','정보오류','기타')),
    CONSTRAINT chk_report_status CHECK (status IN ('active','reviewed','resolved'))
);
CREATE INDEX idx_reports_course   ON reports(course_id)   WHERE course_id IS NOT NULL;
CREATE INDEX idx_reports_node     ON reports(node_id)     WHERE node_id   IS NOT NULL;
CREATE INDEX idx_reports_status   ON reports(status, created_at DESC);
CREATE INDEX idx_reports_location ON reports USING GIST(location);


-- ── [12] course_reviews ───────────────────────────────────────
CREATE TABLE course_reviews (
    course_review_id    UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    activity_record_id  UUID        NOT NULL UNIQUE
        REFERENCES activity_records(activity_record_id) ON DELETE CASCADE,
    user_id             UUID        NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    course_id           UUID        NOT NULL REFERENCES courses(course_id) ON DELETE CASCADE,
    rating              SMALLINT    NOT NULL,
    content             VARCHAR(500),
    visibility          VARCHAR(10) NOT NULL DEFAULT 'public',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_rating            CHECK (rating BETWEEN 1 AND 5),
    CONSTRAINT chk_review_visibility CHECK (visibility IN ('public', 'private'))
);
CREATE INDEX idx_reviews_course ON course_reviews(course_id);
CREATE TRIGGER trg_course_reviews_updated_at
    BEFORE UPDATE ON course_reviews
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ── [13] review_tag_selections ────────────────────────────────
CREATE TABLE review_tag_selections (
    selection_id     UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_review_id UUID        NOT NULL REFERENCES course_reviews(course_review_id) ON DELETE CASCADE,
    course_id        UUID        NOT NULL REFERENCES courses(course_id) ON DELETE CASCADE,
    user_id          UUID        NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    tag_id           UUID        NOT NULL REFERENCES master_tags(tag_id) ON DELETE CASCADE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_review_tag UNIQUE (course_review_id, tag_id)
);
CREATE INDEX idx_rts_course_tag ON review_tag_selections(course_id, tag_id);


-- ── [14] course_tag_summary ───────────────────────────────────
CREATE TABLE course_tag_summary (
    course_id        UUID NOT NULL REFERENCES courses(course_id) ON DELETE CASCADE,
    tag_id           UUID NOT NULL REFERENCES master_tags(tag_id) ON DELETE CASCADE,
    selection_count  INT  NOT NULL DEFAULT 0,
    last_selected_at TIMESTAMPTZ,
    PRIMARY KEY (course_id, tag_id)
);

CREATE OR REPLACE FUNCTION fn_update_tag_summary()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO course_tag_summary(course_id, tag_id, selection_count, last_selected_at)
        VALUES (NEW.course_id, NEW.tag_id, 1, NEW.created_at)
        ON CONFLICT (course_id, tag_id) DO UPDATE SET
            selection_count  = course_tag_summary.selection_count + 1,
            last_selected_at = NEW.created_at;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE course_tag_summary SET
            selection_count = GREATEST(0, selection_count - 1)
        WHERE course_id = OLD.course_id AND tag_id = OLD.tag_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_tag_summary
    AFTER INSERT OR DELETE ON review_tag_selections
    FOR EACH ROW EXECUTE FUNCTION fn_update_tag_summary();


-- ── [15] review_likes ─────────────────────────────────────────
CREATE TABLE review_likes (
    review_like_id   UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_review_id UUID        NOT NULL REFERENCES course_reviews(course_review_id) ON DELETE CASCADE,
    user_id          UUID        NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    is_like          BOOLEAN     NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_review_like UNIQUE (course_review_id, user_id)
);
CREATE INDEX idx_review_likes_review ON review_likes(course_review_id);


-- ── [16] spot_reviews ─────────────────────────────────────────
CREATE TABLE spot_reviews (
    spot_review_id UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    node_id        UUID        NOT NULL REFERENCES nodes(node_id) ON DELETE CASCADE,
    user_id        UUID        NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    is_recommended BOOLEAN     NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_spot_review UNIQUE (node_id, user_id)
);
CREATE INDEX idx_spot_reviews_node ON spot_reviews(node_id);


-- ── [17] bookmarks ────────────────────────────────────────────
CREATE TABLE bookmarks (
    bookmark_id UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID        NOT NULL REFERENCES users(user_id)     ON DELETE CASCADE,
    course_id   UUID        NOT NULL REFERENCES courses(course_id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_bookmark UNIQUE (user_id, course_id)
);
CREATE INDEX idx_bookmarks_course ON bookmarks(course_id);


-- ── [18] notifications ────────────────────────────────────────
CREATE TABLE notifications (
    notification_id UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID        NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    type            VARCHAR(30) NOT NULL,
    target_type     VARCHAR(20),
    target_id       UUID,
    message         TEXT,
    is_read         BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_notifications_user ON notifications(user_id, is_read, created_at DESC);


-- ── [19] weather_cache ────────────────────────────────────────
CREATE TABLE weather_cache (
    weather_cache_id  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    location          GEOMETRY(Point, 4326) NOT NULL,
    weather_condition VARCHAR(50),
    temperature       FLOAT,
    description       TEXT,
    fetched_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at        TIMESTAMPTZ NOT NULL,
    CONSTRAINT chk_cache_expiry CHECK (expires_at > fetched_at)
);
CREATE INDEX idx_weather_location ON weather_cache USING GIST(location);
CREATE INDEX idx_weather_expires  ON weather_cache(expires_at);


-- ── [20] tts_audio_files ─────────────────────────────────────
CREATE TABLE tts_audio_files (
    tts_audio_file_id UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    cache_key         VARCHAR(64) NOT NULL UNIQUE,
    content_type      VARCHAR(20) NOT NULL,
    spot_content_type VARCHAR(20),
    content_id        UUID        NOT NULL,
    voice_type        VARCHAR(10) NOT NULL DEFAULT 'default',
    source_text       TEXT        NOT NULL,
    spoken_text       TEXT,
    audio_url         TEXT,
    status            VARCHAR(20) NOT NULL DEFAULT 'pending',
    retry_count       SMALLINT    NOT NULL DEFAULT 0,
    error_message     TEXT,
    expires_at        TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_tts_status       CHECK (status IN ('pending','processing','done','failed')),
    CONSTRAINT chk_tts_content_type CHECK (content_type IN ('course','spot','weather')),
    CONSTRAINT chk_tts_voice_type   CHECK (voice_type IN ('default','male','female')),
    CONSTRAINT chk_tts_spot_content_type CHECK (
        spot_content_type IS NULL OR
        spot_content_type IN ('역사','수필','음악','명소','주변시설')
    ),
    CONSTRAINT chk_tts_spot_content_type_scope CHECK (
        spot_content_type IS NULL OR content_type = 'spot'
    ),
    CONSTRAINT chk_tts_retry_count CHECK (retry_count >= 0)
);
CREATE INDEX idx_tts_content           ON tts_audio_files(content_type, content_id);
CREATE INDEX idx_tts_spot_content_type ON tts_audio_files(content_id, spot_content_type)
    WHERE content_type = 'spot';


-- ── 뷰: effective_course_tags ─────────────────────────────────
CREATE VIEW effective_course_tags AS
WITH total_reviews AS (
    SELECT course_id, COUNT(*) AS total
    FROM course_reviews
    WHERE visibility = 'public'
    GROUP BY course_id
)
SELECT
    ct.course_id, mt.tag_id, mt.tag_name, mt.category, 'owner' AS source,
    CASE
        WHEN COALESCE(tr.total, 0) < 10 THEN GREATEST(0.6, COALESCE(cts.selection_count::float / NULLIF(tr.total, 0), 0))
        WHEN COALESCE(tr.total, 0) < 50 THEN GREATEST(0.3, COALESCE(cts.selection_count::float / NULLIF(tr.total, 0), 0))
        ELSE COALESCE(cts.selection_count::float / NULLIF(tr.total, 0), 0)
    END AS final_score
FROM course_tags ct
JOIN master_tags mt ON mt.tag_id = ct.tag_id
LEFT JOIN course_tag_summary cts ON cts.course_id = ct.course_id AND cts.tag_id = ct.tag_id
LEFT JOIN total_reviews tr ON tr.course_id = ct.course_id
WHERE mt.status = 'approved'
UNION ALL
SELECT
    cts.course_id, mt.tag_id, mt.tag_name, mt.category, 'review' AS source,
    (cts.selection_count::float * (cts.selection_count::float / NULLIF(tr.total, 0)) + 10 * 0.25)
    / (cts.selection_count + 10) AS final_score
FROM course_tag_summary cts
JOIN master_tags mt ON mt.tag_id = cts.tag_id
JOIN total_reviews tr ON tr.course_id = cts.course_id
WHERE mt.status = 'approved'
  AND cts.selection_count >= 3
  AND NOT EXISTS (
      SELECT 1 FROM course_tags ct
      WHERE ct.course_id = cts.course_id AND ct.tag_id = cts.tag_id
  );


-- ── 트리거: 북마크/평점 통계 ──────────────────────────────────
CREATE OR REPLACE FUNCTION update_course_stats()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE courses SET
        bookmark_count = (SELECT COUNT(*) FROM bookmarks WHERE course_id = COALESCE(NEW.course_id, OLD.course_id)),
        avg_rating     = (SELECT COALESCE(AVG(rating), 0) FROM course_reviews WHERE course_id = COALESCE(NEW.course_id, OLD.course_id))
    WHERE course_id = COALESCE(NEW.course_id, OLD.course_id);
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_bookmark_stats
    AFTER INSERT OR DELETE ON bookmarks
    FOR EACH ROW EXECUTE FUNCTION update_course_stats();

CREATE TRIGGER trg_update_review_stats
    AFTER INSERT OR UPDATE OR DELETE ON course_reviews
    FOR EACH ROW EXECUTE FUNCTION update_course_stats();


-- ── 트리거: 노드 신고 수 ──────────────────────────────────────
CREATE OR REPLACE FUNCTION update_node_report_count()
RETURNS TRIGGER AS $$
BEGIN
    IF COALESCE(NEW.node_id, OLD.node_id) IS NOT NULL THEN
        UPDATE nodes SET
            report_count = (
                SELECT COUNT(*) FROM reports
                WHERE node_id = COALESCE(NEW.node_id, OLD.node_id) AND status = 'active'
            )
        WHERE node_id = COALESCE(NEW.node_id, OLD.node_id) AND node_type = 'spot';
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_node_report_count
    AFTER INSERT OR UPDATE OR DELETE ON reports
    FOR EACH ROW EXECUTE FUNCTION update_node_report_count();

-- ============================================================
-- EOF
-- ============================================================
