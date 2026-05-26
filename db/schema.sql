-- ================================================
-- DB ?¤í‚¤ë§??¤ê³„??
-- ?œë¹„?? ?°ì±… ì½”ìŠ¤ ì¶”ì²œ ??
-- DB: PostgreSQL
-- ?‘ì„± ê¸°ì?: ê¸°ëŠ¥ëª…ì„¸??v1
-- ================================================


-- ================================================
-- PostGIS ?•ì¥ ?œì„±??
-- ?„ì¹˜ ê¸°ë°˜ ê²€?‰Â·ê±°ë¦?ê³„ì‚°Â·ê³µê°„ ?¸ë±??ì§€??
-- ================================================
CREATE EXTENSION IF NOT EXISTS postgis;


-- ================================================
-- ê³µí†µ ?¨ìˆ˜: updated_at ?ë™ ê°±ì‹ 
-- ëª¨ë“  ?Œì´ë¸”ì˜ UPDATE ?¸ë¦¬ê±°ì—???¬ì‚¬??
-- ================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ================================================
-- TABLE: users
-- ?œë¹„?¤ì˜ ëª¨ë“  ?Œì› ?•ë³´ ?€??
-- ?¼ë°˜ ë¡œê·¸??+ ?Œì…œ(ì¹´ì¹´?? ë¡œê·¸???µí•© ê´€ë¦?
-- pref_conditions(?œì´?„Â·ê±°ë¦?·ì‹œê°? + pref_tag_ids(? í˜¸ ?œê·¸) ë¥?ë³„ë„ ?Œì´ë¸??†ì´ ?µí•©
--
-- [?´ë©”???¸ì¦ ?ë¦„]
-- 1. ?¬ìš©?ê? ?´ë©”???…ë ¥ + ì¤‘ë³µ ?•ì¸ + ?¸ì¦ ì½”ë“œ ë°œì†¡ ?”ì²­
-- 2. ?œë²„: 6?ë¦¬ ì½”ë“œ ?ì„±, JWT(payload: email, code, exp 3ë¶?ë¡??œë²„ ë³´ê?
-- 3. ì½”ë“œë§??´ë©”??ë°œì†¡, users INSERT ???„ì§ ?†ìŒ
-- 4. ?¬ìš©??ì½”ë“œ ?…ë ¥ ???œë²„?ì„œ JWT ê²€ì¦?
-- 5. ë¹„ë?ë²ˆí˜¸Â·?‰ë„¤?„Â·ì„ ???…ë ¥ ?„ë£Œ ???Œì›ê°€???„ë£Œ ë²„íŠ¼
-- 6. users INSERT (status = 'active' ë¡?ì¦‰ì‹œ ?œì„±??
-- ???´ë©”???¸ì¦??INSERT ?„ì— ?ë‚˜ë¯€ë¡?users ?Œì´ë¸”ì—
--   email_verify ê´€??ì»¬ëŸ¼Â·pending ?íƒœ ë¶ˆí•„??
--
-- [ì¹´ì¹´??ë¡œê·¸???ë¦„]
-- 1. ì¹´ì¹´??OAuth ë¡œê·¸????social_id ë°›ìŒ
-- 2. users ?ì„œ (social_provider='kakao', social_id) ì¡°íšŒ
-- 3. ì¡´ì¬?˜ë©´ ë¡œê·¸??/ ?†ìœ¼ë©?? ê·œ ê°€??
-- ??ì¹´ì¹´???¬ìš©???ë³„ ?¤ëŠ” email ???„ë‹Œ social_id
-- ???´ë©”???œê³µ ë¯¸ë™????email NULL ?ˆìš©
-- ================================================
CREATE TABLE IF NOT EXISTS users (
    user_id                 UUID            NOT NULL DEFAULT gen_random_uuid(),
    -- PK: UUID ?¬ìš© (auto-increment ?€ë¹?ë¶„ì‚° ?˜ê²½Â·ë³´ì•ˆ??? ë¦¬)

    email                   VARCHAR(320)    NULL,
    -- RFC 5321 ê¸°ì? ?´ë©”??ìµœë? 320??
    -- ë¡œê·¸???„ì´?”ë¡œ ?¬ìš©, ë³€ê²?ë¶ˆê?
    -- ?¼ë°˜ ë¡œê·¸?? ?„ìˆ˜ (chk_users_auth ë¡?ë³´ì¥)
    --              ?´ë©”???¸ì¦ ?„ë£Œ ?„ì—ë§?INSERT ?˜ë?ë¡?ë¯¸ì¸ì¦????†ìŒ
    -- ì¹´ì¹´??ë¡œê·¸?? ?´ë©”???œê³µ ë¯¸ë™????NULL ?ˆìš©
    --              ?ë³„?€ social_id ë¡?ì²˜ë¦¬

    password_hash           VARCHAR(255)    NULL,
    -- bcrypt ?´ì‹œ ?€??
    -- ?Œì…œ ?„ìš© ê³„ì •?€ NULL

    nickname                VARCHAR(12)     NOT NULL,
    -- ëª…ì„¸ ê¸°ì? 2~12?? ì¤‘ë³µ ë¶ˆê?
    -- ?±ë‹¨?ì„œ ê¸¸ì´ validation ë³‘í–‰

    profile_image_url       TEXT            NULL,
    -- ? íƒ ?…ë ¥
    -- ê¸°ë³¸ ?„ë¡œ???´ë?ì§€???±ë‹¨?ì„œ ì²˜ë¦¬

    social_provider         VARCHAR(20)     NULL,
    -- ?Œì…œ ë¡œê·¸???œê³µ???ë³„ (?? 'kakao')
    -- ?¼ë°˜ ê°€?…ì? NULL

    social_id               TEXT            NULL,
    -- ?Œì…œ ?œê³µ?ì˜ ê³ ìœ  ?¬ìš©???ë³„??
    -- ?¼ë°˜ ê°€?…ì? NULL
    -- ?Œì…œ ë¡œê·¸?????„ìˆ˜ (chk_users_auth ë¡?ë³´ì¥)

    role                    VARCHAR(20)     NOT NULL DEFAULT 'user',
    -- ê³„ì • ê¶Œí•œ êµ¬ë¶„
    -- 'user': ?¼ë°˜ ?¬ìš©??
    -- 'admin': ê´€ë¦¬ì (?œë¹„???œê³µ ì½”ìŠ¤ ?±ë¡, ? ê³  ì²˜ë¦¬ ??

    status                  VARCHAR(20)     NOT NULL DEFAULT 'active',
    -- ê³„ì • ?íƒœ ê´€ë¦?(?Œí”„???œë¦¬??ë°©ì‹)
    -- 'active': ?•ìƒ
    -- 'suspended': ? ê³  ?„ì  ?•ì?
    -- 'deleted': ?ˆí‡´ (???? œ ?†ì´ status ë¡?ê´€ë¦?

    pref_conditions         JSONB           NULL,
    -- ? í˜¸ ì¡°ê±´ ?•ë³´ ?€??(? í˜¸ ??ª© ì¶”ê? ??ì»¬ëŸ¼ ë³€ê²?ë¶ˆí•„??
    -- pref_tag_ids(? í˜¸ ?œê·¸)?€ êµ¬ë¶„: ??ì»¬ëŸ¼?€ ?œì´?„Â·ê±°ë¦?·ì‹œê°?ì¡°ê±´ë§??€??
    -- ?? {
    --   "difficulty": "easy",        -- ? í˜¸ ?œì´?? easy / normal / hard
    --   "distance": [1000, 5000],    -- ? í˜¸ ê±°ë¦¬ ë²”ìœ„ (ë¯¸í„° ?¨ìœ„)
    --   "duration": [30, 90]         -- ? í˜¸ ?Œìš” ?œê°„ ë²”ìœ„ (ë¶??¨ìœ„)
    -- }
    -- ë¯¸ì„¤????NULL, ?±ë‹¨?ì„œ ê°?ë²”ìœ„Â·?•ì‹ validation ?„ìš”

    pref_tag_ids            JSONB           NULL,
    -- ? í˜¸ ?œê·¸ ID ëª©ë¡ (tags ?Œì´ë¸”ì˜ tag_id ì°¸ì¡°)
    -- ?¤íŒŸ ?œê·¸Â·ì½”ìŠ¤ ?œê·¸ë¥?êµ¬ë¶„?˜ì—¬ ?€?¥í•˜ê¸??„í•´ UUID[] ??JSONB ë¡?ë³€ê²?
    -- ?? {
    --   "spot":   ["uuid1", "uuid2"],   -- ? í˜¸ ?¤íŒŸ ?œê·¸ ID ëª©ë¡
    --   "course": ["uuid3", "uuid4"]    -- ? í˜¸ ì½”ìŠ¤ ?œê·¸ ID ëª©ë¡
    -- }
    -- ë¯¸ì„¤????NULL, key ?ëµ ê°€??(spot ë§??¤ì •?˜ê³  course ?ëµ ?ˆìš©)
    -- [ì£¼ì˜] tags ?Œì´ë¸”ì— FK ?œì•½ ë¶ˆê? (JSONB ?€?…ì? FK ë¯¸ì???
    --        ì¡´ì¬?˜ì? ?ŠëŠ” tag_id ê°€ ?¤ì–´?€??DB?¨ì—??ì°¨ë‹¨ ë¶ˆê?
    --        ë°˜ë“œ???±ë‹¨ validation ?¼ë¡œ tag_id ? íš¨?±Â·type ?¼ì¹˜ ê²€ì¦??„ìš”
    -- GIN ?¸ë±?¤ë¡œ JSONB ê²€???±ëŠ¥ ë³´ì™„ (?˜ë‹¨ ?¸ë±??ì°¸ê³ )

    pref_categories         JSONB           NULL,
    -- ? í˜¸ ì¹´í…Œê³ ë¦¬ ëª©ë¡ (spots.category Â· courses.category ê°?ì°¸ì¡°)
    -- ?¤íŒŸ ì¹´í…Œê³ ë¦¬Â·ì½”ìŠ¤ ì¹´í…Œê³ ë¦¬ë¥?êµ¬ë¶„?˜ì—¬ ?€??
    -- ?? {
    --   "spot":   ["ê³µì›", "ê°?, "?¸ìˆ˜"],  -- ? í˜¸ ?¤íŒŸ ì¹´í…Œê³ ë¦¬ ëª©ë¡
    --   "course": ["?˜ë ˆê¸?, "?²ê¸¸"]       -- ? í˜¸ ì½”ìŠ¤ ì¹´í…Œê³ ë¦¬ ëª©ë¡
    -- }
    -- ë¯¸ì„¤????NULL, key ?ëµ ê°€??(spot ë§??¤ì •?˜ê³  course ?ëµ ?ˆìš©)
    -- [ì£¼ì˜] spots.category Â· courses.category ???ìœ  ë¬¸ì?´ì´ë¯€ë¡?
    --        ?ˆìš© ì¹´í…Œê³ ë¦¬ ëª©ë¡ ê´€ë¦?ë°?? íš¨??ê²€ì¦ì? ?±ë‹¨?ì„œ ì²˜ë¦¬ ?„ìš”
    -- GIN ?¸ë±?¤ë¡œ JSONB ê²€???±ëŠ¥ ë³´ì™„ (?˜ë‹¨ ?¸ë±??ì°¸ê³ )

    created_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    -- updated_at: ?¸ë¦¬ê±°ë¡œ ?ë™ ê°±ì‹  (?˜ë‹¨ ?¸ë¦¬ê±?ì°¸ê³ )

    CONSTRAINT pk_users
        PRIMARY KEY (user_id),

    CONSTRAINT uq_users_email
        UNIQUE (email),
    -- ?´ë©”??ì¤‘ë³µ ê°€??ë°©ì?
    -- PostgreSQL UNIQUE ??NULL ??ì¤‘ë³µ?¼ë¡œ ë³´ì? ?Šìœ¼ë¯€ë¡?
    -- ì¹´ì¹´???´ë©”??ë¯¸ë™???¬ìš©??email NULL) ?¬ëŸ¬ ëª?ê°€??

    CONSTRAINT uq_users_nickname
        UNIQUE (nickname),
    -- ?‰ë„¤??ì¤‘ë³µ ë°©ì?

    CONSTRAINT chk_users_nickname_length
        CHECK (char_length(nickname) >= 2),
    -- ?‰ë„¤??ìµœì†Œ 2??ë³´ì¥
    -- ìµœë? 12?ëŠ” VARCHAR(12) ë¡?ë³´ì¥

    CONSTRAINT chk_users_role
        CHECK (role IN ('user', 'admin')),
    -- role ?ˆìš©ê°????…ë ¥ ì°¨ë‹¨

    CONSTRAINT chk_users_status
        CHECK (status IN ('active', 'suspended', 'deleted')),
    -- status ?ˆìš©ê°????…ë ¥ ì°¨ë‹¨

    CONSTRAINT chk_users_auth
        CHECK (
            (social_provider IS NULL
                AND email IS NOT NULL
                AND password_hash IS NOT NULL)
            OR
            (social_provider IS NOT NULL
                AND social_id IS NOT NULL)
        )
    -- ?¸ì¦ ë°©ì‹ ë¬´ê²°??ë³´ì¥
    -- ?¼ë°˜ ë¡œê·¸?? email + password_hash ?????„ìˆ˜
    -- ?Œì…œ ë¡œê·¸?? social_provider + social_id ?????„ìˆ˜
    --             email ?€ ì¹´ì¹´??ë¯¸ë™????NULL ?ˆìš©
);

-- ?Œì…œ ë¡œê·¸??ì¤‘ë³µ ë°©ì?
-- Partial Index: social_provider ê°€ ?ˆëŠ” ?‰ì—ë§??ìš©
-- ?™ì¼ ?œê³µ?ì—??ê°™ì? social_id ì¤‘ë³µ ê°€??ì°¨ë‹¨
CREATE UNIQUE INDEX IF NOT EXISTS uix_users_social
    ON users (social_provider, social_id)
    WHERE social_provider IS NOT NULL;

-- ê³„ì • ?íƒœ ?„í„° ì¡°íšŒ??
-- ê´€ë¦¬ì ?˜ì´ì§€, ?•ì? ê³„ì • ì²´í¬ ??status ì¡°íšŒ ë¹ˆë„ ?’ìŒ
CREATE INDEX IF NOT EXISTS ix_users_status
    ON users (status);

-- ê´€ë¦¬ì ê³„ì • ì¡°íšŒ??Partial Index
-- ?œë¹„???œê³µ ì½”ìŠ¤ ì¡°íšŒ, ? ê³  ì²˜ë¦¬ ê¶Œí•œ ì²´í¬ ???¬ìš©
CREATE INDEX IF NOT EXISTS ix_users_admin
    ON users (user_id)
    WHERE role = 'admin';

-- ? í˜¸ ?œê·¸ JSONB ê²€?‰ìš© GIN ?¸ë±??
-- ?¹ì • tag_id ë¥??¬í•¨??? ì? ì¡°íšŒ ???¬ìš©
-- ?? WHERE pref_tag_ids @> '{"spot": ["uuid1"]}'
CREATE INDEX IF NOT EXISTS ix_users_pref_tag_ids
    ON users USING GIN (pref_tag_ids);

-- ? í˜¸ ì¹´í…Œê³ ë¦¬ JSONB ê²€?‰ìš© GIN ?¸ë±??
-- ?¹ì • ì¹´í…Œê³ ë¦¬ë¥?? í˜¸?˜ëŠ” ? ì? ì¡°íšŒ ???¬ìš©
-- ?? WHERE pref_categories @> '{"spot": ["ê³µì›"]}'
CREATE INDEX IF NOT EXISTS ix_users_pref_categories
    ON users USING GIN (pref_categories);

-- updated_at ?ë™ ê°±ì‹  ?¸ë¦¬ê±?
CREATE OR REPLACE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ================================================
-- TABLE: tags
-- ì½”ìŠ¤Â·?¤íŒŸ???¬ìš©?˜ëŠ” ?œê·¸ ?œë²„ ê´€ë¦??Œì´ë¸?
-- ?¬ìš©??ì§ì ‘ ?…ë ¥ ë¶ˆê?, ?œë²„?ì„œë§??±ë¡Â·ê´€ë¦?
-- ================================================
CREATE TABLE IF NOT EXISTS tags (
    tag_id      UUID            NOT NULL DEFAULT gen_random_uuid(),
    -- PK: UUID ?¬ìš©

    name        VARCHAR(20)     NOT NULL,
    -- ?œê·¸ëª?(?? '?ì—°', '?„ì‹œ', 'ê³ ìš”??ë¶„ìœ„ê¸?)
    -- ?¬ìš©??ì§ì ‘ ?…ë ¥ ë¶ˆê?, ?œë²„?ì„œë§?ê´€ë¦?

    type        VARCHAR(10)     NOT NULL,
    -- ?œê·¸ ?ìš© ?€??êµ¬ë¶„
    -- 'course': ì½”ìŠ¤ ?œê·¸ / 'spot': ?¤íŒŸ ?œê·¸

    is_active   BOOLEAN         NOT NULL DEFAULT TRUE,
    -- ?œê·¸ ?œì„±???¬ë?
    -- TRUE: ?œì„±??(?¬ìš©??? íƒ ê°€??
    -- FALSE: ë¹„í™œ?±í™” (? íƒ ë¶ˆê?, ëª©ë¡?ì„œ ?¨ê?)
    -- ê³„ì ˆ ?œê·¸ ê´€ë¦¬ìš© (?? #ë²šê½ƒ ë´????œì¦Œ ë¹„í™œ?±í™”, #?¨í’ ê°€????ë¹„í™œ?±í™”)

    created_at  TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT pk_tags
        PRIMARY KEY (tag_id),

    CONSTRAINT uq_tags_name_type
        UNIQUE (name, type),
    -- ê°™ì? type ???œê·¸ëª?ì¤‘ë³µ ë°©ì?
    -- (ì½”ìŠ¤Â·?¤íŒŸ ê°??™ì¼ ?œê·¸ëª…ì? ?ˆìš©)

    CONSTRAINT chk_tags_type
        CHECK (type IN ('course', 'spot'))
    -- type ?ˆìš©ê°????…ë ¥ ì°¨ë‹¨
);

-- ?œê·¸ type ë³?ì¡°íšŒ??
-- ì½”ìŠ¤ ?±ë¡Â·?¤íŒŸ ?±ë¡ ???´ë‹¹ type ?œê·¸ ëª©ë¡ ì¡°íšŒ ë¹ˆë„ ?’ìŒ
CREATE INDEX IF NOT EXISTS ix_tags_type
    ON tags (type);
-- [ì£¼ì˜] tags ?? œ ??users.pref_tag_ids ë°°ì—´???¨ì•„?ˆëŠ”
--        tag_id ?•ë¦¬???±ë‹¨?ì„œ ì²˜ë¦¬ ?„ìš” (ë°°ì—´ ?€??FK ë¯¸ì???


-- ================================================
-- TABLE: spots
-- ?œë¹„???œê³µ ?¤íŒŸ (?œë²„ ?Œìœ , ?„ì²´ ê³µê°œ)
-- AI ?Œì„± ?ˆë‚´ ì½˜í…ì¸?? í˜• ê³ ì • 3ê°?(?¥ì†Œ ?ˆë‚´ / ??‚¬ ?´ì„¤ / ê´€ê´??ˆë‚´)
-- ================================================
CREATE TABLE IF NOT EXISTS spots (
    spot_id             UUID            NOT NULL DEFAULT gen_random_uuid(),
    -- PK: UUID ?¬ìš©

    name                VARCHAR(100)    NOT NULL,
    -- ?¤íŒŸëª?(?¤ì´ë²?ì§€??API ?¥ì†Œ ê²€?‰ì—???ë™ ?…ë ¥)

    location            GEOGRAPHY(POINT, 4326)  NOT NULL,
    -- ?¤íŒŸ ?„ì¹˜ (?„ê²½???µí•©)
    -- ?? ST_Point(126.97, 37.56)::GEOGRAPHY  (ê²½ë„, ?„ë„ ?œì„œ)
    -- ?¤ì´ë²?ì§€??API ì¢Œí‘œ ê²€?‰ì—???ë™ ?…ë ¥
    -- GEOGRAPHY ?€?…ì´ ì¢Œí‘œ ? íš¨???ë™ ê²€ì¦?(ë³„ë„ CHECK ë¶ˆí•„??

    address             TEXT            NULL,
    -- ì£¼ì†Œ (?¤ì´ë²?ì§€??API ????¤ì½”?©ìœ¼ë¡??ë™ ?…ë ¥)

    category            VARCHAR(20)     NULL,
    -- ì§€???œê³µ ë¶„ë¥˜ ì¹´í…Œê³ ë¦¬ (?? 'ê°?, '?¸ìˆ˜', 'ê³µì›')

    content_place       TEXT            NULL,
    -- ?¥ì†Œ ?ˆë‚´ ?´ì„¤ ?ìŠ¤??
    -- NULL ?´ë©´ ?´ë‹¹ ?¤íŒŸ?€ ?¥ì†Œ ?ˆë‚´ ë¶ˆê?

    content_history     TEXT            NULL,
    -- ??‚¬ ?´ì„¤ ?ìŠ¤??
    -- NULL ?´ë©´ ?´ë‹¹ ?¤íŒŸ?€ ??‚¬ ?´ì„¤ ë¶ˆê?

    content_tour        TEXT            NULL,
    -- ê´€ê´??ˆë‚´ ?´ì„¤ ?ìŠ¤??
    -- NULL ?´ë©´ ?´ë‹¹ ?¤íŒŸ?€ ê´€ê´??ˆë‚´ ë¶ˆê?

    recommend_pct       DECIMAL(5,2)    NULL,
    -- ì¶”ì²œ???¼ì„¼??ìºì‹œê°?
    -- spot_reviews.is_recommended TRUE ë¹„ìœ¨
    -- ?? 85.50 (85.5%)
    -- ?„ê¸° ?±ë¡Â·?˜ì •Â·?? œ ???¸ë¦¬ê±??ëŠ” ?±ë‹¨?ì„œ ?…ë°?´íŠ¸
    -- ?„ê¸° ?†ì„ ??NULL

    status              VARCHAR(20)     NOT NULL DEFAULT 'active',
    -- 'active': ?•ìƒ / 'hidden': ? ê³ ë¡??¨ê?

    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT pk_spots
        PRIMARY KEY (spot_id),

    CONSTRAINT chk_spots_status
        CHECK (status IN ('active', 'hidden')),

    CONSTRAINT chk_spots_recommend_pct
        CHECK (recommend_pct IS NULL OR recommend_pct BETWEEN 0 AND 100)
    -- ì¶”ì²œ??0~100% ë²”ìœ„ ê²€ì¦?
);

-- ?„ì¹˜ ê¸°ë°˜ ë°˜ê²½ ê²€?‰Â·ê±°ë¦??•ë ¬??GiST ?¸ë±??
-- ST_DWithin(), ST_Distance() ??PostGIS ?¨ìˆ˜?€ ?¨ê»˜ ?¬ìš©
CREATE INDEX IF NOT EXISTS ix_spots_location
    ON spots USING GIST (location);

-- ?íƒœ ?„í„° ì¡°íšŒ??
CREATE INDEX IF NOT EXISTS ix_spots_status
    ON spots (status);

-- ì½˜í…ì¸?? í˜•ë³?Partial Index
-- NULL ???„ë‹Œ ?‰ë§Œ ?¸ë±?±í•˜???´ì„¤ ê°€???¤íŒŸ ê²€???±ëŠ¥ ë³´ì™„
CREATE INDEX IF NOT EXISTS ix_spots_content_place
    ON spots (spot_id) WHERE content_place IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_spots_content_history
    ON spots (spot_id) WHERE content_history IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_spots_content_tour
    ON spots (spot_id) WHERE content_tour IS NOT NULL;

-- updated_at ?ë™ ê°±ì‹  ?¸ë¦¬ê±?
CREATE OR REPLACE TRIGGER trg_spots_updated_at
    BEFORE UPDATE ON spots
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ================================================
-- TABLE: courses
-- ?œë¹„???œê³µ ì½”ìŠ¤ + ?¬ìš©???±ë¡ ì½”ìŠ¤ ?µí•© ê´€ë¦?
-- ê²½ìœ ì§€(?¤íŒŸÂ·?€) ?œì„œ??course_waypoints ?Œì´ë¸”ë¡œ ë¶„ë¦¬ ê´€ë¦?
--
-- [?œë¹„???œê³µ ì½”ìŠ¤ êµ¬ë¶„]
-- is_service ì»¬ëŸ¼ ?†ì´ owner_id ??users.role = 'admin' ì¡°ì¸?¼ë¡œ êµ¬ë¶„
-- ?œë¹„???œê³µ ì½”ìŠ¤: owner_id ??role = 'admin'
-- ?¬ìš©???±ë¡ ì½”ìŠ¤: owner_id ??role = 'user'
--
-- [difficultyÂ·rating ?†ìŒ]
-- ì½”ìŠ¤ ?ì²´??difficultyÂ·rating ?†ìŒ
-- ëª¨ë“  ?„ê¸°(?ì‘???¬í•¨)??difficultyÂ·rating ?‰ê· ê°’ìœ¼ë¡??œì‹œ
-- course_reviews ?¨ì¼ ?Œì´ë¸”ì—??ì§‘ê³„
--
-- [?ì‘???ë¦„]
-- ê²½ë¡œë§?ê·¸ë ¤???±ë¡ ??courses + course_waypoints INSERT (walk_records ?†ìŒ)
-- ?¤ì œë¡?ê±·ê³  ?˜ì„œ ??walk_records INSERT ??course_reviews INSERT
-- ================================================
CREATE TABLE IF NOT EXISTS courses (
    course_id           UUID            NOT NULL DEFAULT gen_random_uuid(),
    -- PK: UUID ?¬ìš©

    owner_id            UUID            NOT NULL,
    -- ì½”ìŠ¤ ?±ë¡?? users.user_id ì°¸ì¡°
    -- ?œë¹„???œê³µ ì½”ìŠ¤???œë¹„??ê´€ë¦¬ì ê³„ì • user_id ?¬ìš©

    name                VARCHAR(100)    NOT NULL,
    -- ì½”ìŠ¤ëª?

    description         TEXT            NULL,
    -- ì½”ìŠ¤ ?Œê°œ ?ìŠ¤??(? íƒ ?…ë ¥)

    category            VARCHAR(20)     NULL,
    -- ì½”ìŠ¤ ë¶„ë¥˜ ì¹´í…Œê³ ë¦¬ (?? '?˜ë ˆê¸?)
    -- ? íƒ ?…ë ¥. ì½”ìŠ¤ ?±ë¡ ??ì¹´í…Œê³ ë¦¬ ? íƒ ê°€??

    route_geometry      GEOGRAPHY(LINESTRING, 4326)  NOT NULL,
    -- DB ê³µê°„ ?°ì‚° ?„ìš© ì»¬ëŸ¼
    -- course_waypoints ??ëª¨ë“  ê²½ìœ ì§€(?¤íŒŸÂ·?€) ì¢Œí‘œë¥?seq ?œì„œ?€ë¡?ì¶”ì¶œ??LINESTRING
    -- ?¤íŒŸ ì¢Œí‘œ: spots.location ê¸°ì? / ?€ ì¢Œí‘œ: course_waypoints.latÂ·lng ê¸°ì?
    --
    -- [?©ë„ 1] ì´?ê±°ë¦¬ ?ë™ ê³„ì‚°
    --   ST_Length(route_geometry) ??ë¯¸í„° ?¨ìœ„ ê±°ë¦¬ ë°˜í™˜
    --   estimated_duration ê³„ì‚° ê¸°ì??¼ë¡œ???¬ìš©
    --
    -- [?©ë„ 2] ê°€ê¹Œìš´???•ë ¬
    --   ST_Distance(route_geometry, ST_Point(:lng, :lat)::GEOGRAPHY)
    --   ê²½ìœ ì§€ ?¬í•¨ ê°€??ê°€ê¹Œìš´ ì§€??ê¸°ì??¼ë¡œ ?•ë ¬
    --
    -- [?©ë„ 3] ë°˜ê²½ ??ì½”ìŠ¤ ê²€??
    --   ST_DWithin(route_geometry, ST_Point(:lng, :lat)::GEOGRAPHY, 5000)
    --   ê²½ë¡œê°€ ?¬ìš©???„ì¹˜ ë°˜ê²½ 5km ?´ë‚´ë¥?ì§€?˜ëŠ” ì½”ìŠ¤ ê²€??
    --
    -- [?©ë„ 4] ê²½ë¡œ ???¤íŒŸ ?ë™ ê°ì?
    --   ST_DWithin(spots.location, route_geometry, 50)
    --   ê²½ë¡œ ë°˜ê²½ 50m ?´ë‚´ ?¤íŒŸ ?ë™ ê°ì? ë°?ì¶”ê? ?œì•ˆ
    --
    -- [ì£¼ì˜] ?¤íŒŸ ì¢Œí‘œ(spots.location) ?˜ì • ??route_geometry ???¨ê»˜ ?…ë°?´íŠ¸ ?„ìš”
    --        (?±ë‹¨ ?ëŠ” ?¸ë¦¬ê±°ë¡œ ì²˜ë¦¬)
    -- [ì£¼ì˜] ?´ìš©?ì˜ ?¤ì œ ?´ë™ ê²½ë¡œ ?œì‹œ????ì»¬ëŸ¼???„ë‹Œ
    --        walk_records.actual_route ë¥??¬ìš©?´ì•¼ ??
    --        (route_geometry = ì½”ìŠ¤ ê³„íš ê²½ë¡œ / actual_route = ?¤ì œ ?´ë™ ê²½ë¡œ)

    total_distance      INT             NOT NULL,
    -- ì´?ê±°ë¦¬ (ë¯¸í„° ?¨ìœ„)
    -- route_geometry ?•ì • ??ST_Length(route_geometry) ë¡??ë™ ê³„ì‚° ???€??
    -- ê²½ë¡œ ?˜ì • ???…ë°?´íŠ¸ ?„ìš”

    estimated_duration  INT             NOT NULL,
    -- ?ˆìƒ ?Œìš” ?œê°„ (ë¶??¨ìœ„, ?„ë³´ ?‰ê·  ?ë„ ê¸°ë°˜ ?ë™ ê³„ì‚°)

    is_public           BOOLEAN         NOT NULL DEFAULT TRUE,
    -- ê³µê°œ/ë¹„ê³µê°??¤ì •
    -- ë¹„ê³µê°?ì½”ìŠ¤??ë³¸ì¸ë§??´ëŒ ê°€??

    -- [?œë¹„???œê³µ ì½”ìŠ¤ êµ¬ë¶„]
    -- owner_id ??users.role = 'admin' ?´ë©´ ?œë¹„???œê³µ ì½”ìŠ¤
    -- owner_id ??users.role = 'user' ?´ë©´ ?¬ìš©???±ë¡ ì½”ìŠ¤
    -- is_service ì»¬ëŸ¼ ?†ì´ users.role ì¡°ì¸?¼ë¡œ êµ¬ë¶„

    data_source         VARCHAR(100)    NULL,
    -- ê³µê³µ ?°ì´??ì¶œì²˜
    -- ?? '?œìš¸??ê³µê³µ?°ì´?°í¬??, 'êµ??ê³µê°„?•ë³´?¬í„¸'
    -- ?¬ìš©???±ë¡ ì½”ìŠ¤??NULL

    source_id           VARCHAR(100)    NULL,
    -- ê³µê³µ ?°ì´???ë³¸ ID (ì¤‘ë³µ ?±ë¡ ë°©ì???
    -- ?? ?œìš¸ ?˜ë ˆê¸?ì½”ìŠ¤ ê³ ìœ  ID
    -- ?¬ìš©???±ë¡ ì½”ìŠ¤??NULL

    status              VARCHAR(20)     NOT NULL DEFAULT 'active',
    -- 'active': ?•ìƒ
    -- 'hidden': ? ê³  ?„ì ?¼ë¡œ ?ë™ ?¨ê?
    -- 'deleted': ?? œ (?Œí”„???œë¦¬??

    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT pk_courses
        PRIMARY KEY (course_id),

    CONSTRAINT fk_courses_owner
        FOREIGN KEY (owner_id) REFERENCES users (user_id)
        ON DELETE RESTRICT,
    -- ì½”ìŠ¤ ?±ë¡???ˆí‡´ ???? œ ì°¨ë‹¨
    -- ?ˆí‡´ ì²˜ë¦¬ ??ì½”ìŠ¤ ì²˜ë¦¬ ë°©ì‹ ê²°ì • ?„ìš” (?±ë‹¨?ì„œ ì²˜ë¦¬)

    CONSTRAINT chk_courses_status
        CHECK (status IN ('active', 'hidden', 'deleted')),

    CONSTRAINT chk_courses_total_distance
        CHECK (total_distance > 0),
    -- ì´?ê±°ë¦¬??0ë³´ë‹¤ ì»¤ì•¼ ??

    CONSTRAINT chk_courses_duration
        CHECK (estimated_duration > 0)
);

-- ?±ë¡??ê¸°ì? ì½”ìŠ¤ ì¡°íšŒ??
-- ë§ˆì´?˜ì´ì§€ '?´ê? ?±ë¡??ì½”ìŠ¤' ì¡°íšŒ ???¬ìš©
CREATE INDEX IF NOT EXISTS ix_courses_owner_id
    ON courses (owner_id);

-- ê³µê³µ ?°ì´??ì¤‘ë³µ ?±ë¡ ë°©ì???Partial Index
-- source_id ê°€ ?ˆëŠ” ?‰ì—ë§??ìš©
CREATE UNIQUE INDEX IF NOT EXISTS uix_courses_source_id
    ON courses (source_id)
    WHERE source_id IS NOT NULL;

-- ê³µê°œ ?¬ë? + ?íƒœ ë³µí•© ?¸ë±??
-- ì½”ìŠ¤ ëª©ë¡ ì¡°íšŒ ????ƒ ?¨ê»˜ ?„í„°ë§ë¨
CREATE INDEX IF NOT EXISTS ix_courses_public_status
    ON courses (is_public, status);

-- ì½”ìŠ¤ ?„ì²´ ê²½ë¡œ ê³µê°„ ê²€?‰Â·ê?ê¹Œìš´???•ë ¬??GiST ?¸ë±??
-- ST_Distance(route_geometry, ST_Point(:lng,:lat)::GEOGRAPHY) ë¡?ê°€ê¹Œìš´???•ë ¬
-- ST_DWithin() ?¼ë¡œ ë°˜ê²½ ??ì½”ìŠ¤ ê²€??
-- ê²½ìœ ì§€ ?¬í•¨ ê°€??ê°€ê¹Œìš´ ì§€??ê¸°ì??¼ë¡œ ?•ë ¬ (ë°©ë²• 2)
-- ?¹ì • ?„ì¹˜ ë°˜ê²½ ??ê²½ë¡œê°€ ì§€?˜ê???ì½”ìŠ¤ ê²€??ê°€??
CREATE INDEX IF NOT EXISTS ix_courses_route_geometry
    ON courses USING GIST (route_geometry);

-- updated_at ?ë™ ê°±ì‹  ?¸ë¦¬ê±?
CREATE OR REPLACE TRIGGER trg_courses_updated_at
    BEFORE UPDATE ON courses
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ================================================
-- TABLE: course_waypoints
-- ì½”ìŠ¤ ê²½ìœ ì§€ ?œì„œ ê´€ë¦?(?¤íŒŸÂ·?€ ?µí•©)
--
-- [ê²½ìœ ì§€ ? í˜•]
-- 'spot': ?˜ë??ˆëŠ” ê²½ìœ ì§€ ??spot_id FK ë¡?spots ?Œì´ë¸?ì°¸ì¡°
--         ì¢Œí‘œ??spots.location ?ì„œ JOIN ?¼ë¡œ ì¡°íšŒ (ì¤‘ë³µ ?€???†ìŒ)
-- 'pin' : ê²½ë¡œ ì¡°ì •???¨ìˆœ ì¢Œí‘œ ê²½ìœ ì§€ ??latÂ·lng ì§ì ‘ ?€??
--
-- [?œì„œ ê´€ë¦?
-- seq: ì½”ìŠ¤ ???„ì²´ ê²½ìœ ì§€ ?œì„œ (?¤íŒŸÂ·?€ ?µí•© ?œë²ˆ)
-- ?? spot1(seq=1) ??spot2(seq=2) ??pin1(seq=3) ??spot2(seq=4) ??pin2(seq=5)
-- ?™ì¼ ?¤íŒŸ ?¬ë°©ë¬?ê°€??(PK ê°€ course_id + seq ?´ë?ë¡?spot_id ì¤‘ë³µ ?ˆìš©)
--
-- [route_geometry ?™ê¸°??
-- course_waypoints INSERTÂ·UPDATEÂ·DELETE ??
-- courses.route_geometry ??ë°˜ë“œ???¨ê»˜ ?…ë°?´íŠ¸ ?„ìš” (?±ë‹¨ ë³´ì¥)
-- ?¤íŒŸ ì¢Œí‘œ ë³€ê²?spots.location UPDATE) ?œì—???™ê¸°???„ìš”
-- ================================================
CREATE TABLE IF NOT EXISTS course_waypoints (
    course_id   UUID            NOT NULL,
    -- FK: courses.course_id ì°¸ì¡°
    -- ì½”ìŠ¤ ?? œ ??ê²½ìœ ì§€???¨ê»˜ ?? œ

    seq         SMALLINT        NOT NULL,
    -- ì½”ìŠ¤ ??ê²½ìœ ì§€ ?œì„œ (1ë¶€???œì‘, ?¤íŒŸÂ·?€ ?µí•© ?œë²ˆ)
    -- ?œì„œ ë³€ê²???seq ?…ë°?´íŠ¸

    type        VARCHAR(10)     NOT NULL,
    -- ê²½ìœ ì§€ ? í˜•
    -- 'spot': ?¤íŒŸ ê²½ìœ ì§€ (spot_id ?„ìˆ˜, latÂ·lng NULL)
    -- 'pin' : ?¨ìˆœ ì¢Œí‘œ ê²½ìœ ì§€ (latÂ·lng ?„ìˆ˜, spot_id NULL)

    spot_id     UUID            NULL,
    -- type = 'spot' ???Œë§Œ ?¬ìš©: spots.spot_id ì°¸ì¡°
    -- type = 'pin'  ????NULL

    lat         DECIMAL(9,6)    NULL,
    -- type = 'pin' ???Œë§Œ ?¬ìš©: ?„ë„
    -- type = 'spot' ????NULL (ì¢Œí‘œ??spots.location ?ì„œ ì¡°íšŒ)

    lng         DECIMAL(9,6)    NULL,
    -- type = 'pin' ???Œë§Œ ?¬ìš©: ê²½ë„
    -- type = 'spot' ????NULL (ì¢Œí‘œ??spots.location ?ì„œ ì¡°íšŒ)

    CONSTRAINT pk_course_waypoints
        PRIMARY KEY (course_id, seq),
    -- ë³µí•© PK: ?™ì¼ ì½”ìŠ¤ ??seq ? ì¼ ë³´ì¥
    -- spot_id ì¤‘ë³µ ?ˆìš© ???™ì¼ ?¤íŒŸ ?¬ë°©ë¬?ê°€??

    CONSTRAINT fk_course_waypoints_course
        FOREIGN KEY (course_id) REFERENCES courses (course_id)
        ON DELETE CASCADE,
    -- ì½”ìŠ¤ ?? œ ??ê²½ìœ ì§€???¨ê»˜ ?? œ

    CONSTRAINT fk_course_waypoints_spot
        FOREIGN KEY (spot_id) REFERENCES spots (spot_id)
        ON DELETE RESTRICT,
    -- ê²½ìœ ì§€ë¡??¬ìš© ì¤‘ì¸ ?¤íŒŸ ?? œ ì°¨ë‹¨
    -- ?? œ ???°ê²° ì½”ìŠ¤ ?•ì¸ ?„ìš” (?±ë‹¨?ì„œ ì²˜ë¦¬)

    CONSTRAINT chk_course_waypoints_type
        CHECK (type IN ('spot', 'pin')),

    CONSTRAINT chk_course_waypoints_columns
        CHECK (
            (type = 'spot' AND spot_id IS NOT NULL AND lat IS NULL     AND lng IS NULL    )
            OR
            (type = 'pin'  AND spot_id IS NULL     AND lat IS NOT NULL AND lng IS NOT NULL)
        ),
    -- type ë³?ì»¬ëŸ¼ ?¬ìš© ê°•ì œ
    -- spot: spot_id ?„ìˆ˜ / latÂ·lng ê¸ˆì?
    -- pin : latÂ·lng ?„ìˆ˜ / spot_id ê¸ˆì?

    CONSTRAINT chk_course_waypoints_seq
        CHECK (seq >= 1)
    -- seq ??1 ?´ìƒ
);

-- ì½”ìŠ¤ë³?ê²½ìœ ì§€ ?œì„œ ì¡°íšŒ??
-- ì½”ìŠ¤ ?ì„¸ ì¡°íšŒ ??seq ?œìœ¼ë¡?ê²½ìœ ì§€ ëª©ë¡ ì¡°íšŒ
CREATE INDEX IF NOT EXISTS ix_course_waypoints_course_seq
    ON course_waypoints (course_id, seq);

-- ?¤íŒŸ ??°©??ì¡°íšŒ??
-- ?¹ì • ?¤íŒŸ???¬í•¨??ì½”ìŠ¤ ëª©ë¡ ì¡°íšŒ
-- ?¤íŒŸ ?? œÂ·?¨ê? ì²˜ë¦¬ ???í–¥ ì½”ìŠ¤ ?•ì¸???¬ìš©
CREATE INDEX IF NOT EXISTS ix_course_waypoints_spot_id
    ON course_waypoints (spot_id)
    WHERE spot_id IS NOT NULL;


-- ================================================
-- TABLE: taggings
-- ì½”ìŠ¤Â·?¤íŒŸ ?œê·¸ ?µí•© ?Œì´ë¸?
-- user_id ë¡??„ê? ???œê·¸?¸ì? êµ¬ë¶„
--
-- [ì½”ìŠ¤ ?œê·¸ ì§‘ê³„]
-- ì½”ìŠ¤ ?ì„¸ top 5 (????:
--   WHERE target_type = 'course' AND target_id = course_id
--   ???ì‘??+ ëª¨ë“  ?„ê¸° ?‘ì„±???œê·¸ ?©ì‚°
--
-- ë§ˆì´?˜ì´ì§€ (ë³¸ì¸ ?œê·¸ë§?:
--   WHERE target_type = 'course' AND target_id = course_id AND user_id = :user_id
--
-- [?¤íŒŸ ?œê·¸ ì§‘ê³„]
-- ?¤íŒŸ ?ì„¸ top 5:
--   WHERE target_type = 'spot' AND target_id = spot_id
--   ???„ê¸° ?‘ì„±???œê·¸ë§?ì§‘ê³„ (?¤íŒŸ ?ì‘???†ìŒ)
--
-- ë§ˆì´?˜ì´ì§€ (ë³¸ì¸ ?œê·¸ë§?:
--   WHERE target_type = 'spot' AND target_id = spot_id AND user_id = :user_id
-- ================================================
CREATE TABLE IF NOT EXISTS taggings (
    tag_id          UUID            NOT NULL,
    -- tags.tag_id ì°¸ì¡°

    target_id       UUID            NOT NULL,
    -- ?œê·¸ ?€??ID
    -- target_type = 'course' -> courses.course_id
    -- target_type = 'spot'   -> spots.spot_id

    target_type     VARCHAR(20)     NOT NULL,
    -- ?œê·¸ ?€??êµ¬ë¶„
    -- 'course': ì½”ìŠ¤ ?œê·¸ (?ì‘?Â·í›„ê¸??µí•©)

    user_id         UUID            NOT NULL,
    -- ?œê·¸ë¥????¬ìš©?? users.user_id ì°¸ì¡°
    -- ?ì‘?? ì½”ìŠ¤ ?±ë¡??
    -- ?„ê¸° ?‘ì„±?? ?„ê¸° ?‘ì„± ???¨ê»˜ ?€??
    -- ë§ˆì´?˜ì´ì§€?ì„œ ë³¸ì¸?????œê·¸ ?„í„°ë§ì— ?¬ìš©

    CONSTRAINT pk_taggings
        PRIMARY KEY (tag_id, target_id, target_type, user_id),
    -- ë³µí•© PK: ê°™ì? ?¬ìš©?ê? ê°™ì? ?€?ì— ?™ì¼ ?œê·¸ ì¤‘ë³µ ë°©ì?

    CONSTRAINT fk_taggings_tag
        FOREIGN KEY (tag_id) REFERENCES tags (tag_id)
        ON DELETE CASCADE,
    -- ?œê·¸ ?? œ ???°ê²° ?°ì´?°ë„ ?¨ê»˜ ?? œ

    CONSTRAINT fk_taggings_user
        FOREIGN KEY (user_id) REFERENCES users (user_id)
        ON DELETE CASCADE,
    -- ?Œì› ?ˆí‡´ ???œê·¸ ?°ê²°???¨ê»˜ ?? œ

    CONSTRAINT chk_taggings_target_type
        CHECK (target_type IN ('course', 'spot'))
    -- 'course': ì½”ìŠ¤ ?œê·¸ (?ì‘?Â·í›„ê¸??µí•©)
    -- 'spot': ?¤íŒŸ ?„ê¸° ?œê·¸ (?ì‘???†ìŒ, ?„ê¸° ?‘ì„±?ë§Œ)
);

-- ì½”ìŠ¤ ?œê·¸ top 5 ì§‘ê³„Â·ëª©ë¡ ì¡°íšŒ??
-- WHERE target_type = 'course' AND target_id = course_id
CREATE INDEX IF NOT EXISTS ix_taggings_target
    ON taggings (target_type, target_id);

-- ë§ˆì´?˜ì´ì§€ ë³¸ì¸ ?œê·¸ ì¡°íšŒ??
-- WHERE target_type = 'course' AND target_id = course_id AND user_id = :user_id
CREATE INDEX IF NOT EXISTS ix_taggings_user_target
    ON taggings (user_id, target_type, target_id);

-- ?œê·¸ ê¸°ì? ì½”ìŠ¤ ê²€?‰ìš©
-- ?¹ì • ?œê·¸ê°€ ?¬ë¦° ì½”ìŠ¤ ëª©ë¡ ì¡°íšŒ ???¬ìš©
CREATE INDEX IF NOT EXISTS ix_taggings_tag_id
    ON taggings (tag_id);

-- ì½”ìŠ¤ ?? œ ??taggings ?ë™ ?? œ ?¸ë¦¬ê±?
CREATE OR REPLACE FUNCTION delete_course_taggings()
RETURNS TRIGGER AS $$
BEGIN
    DELETE FROM taggings
    WHERE target_id = OLD.course_id
    AND target_type = 'course';
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_delete_course_taggings
    AFTER DELETE ON courses
    FOR EACH ROW EXECUTE FUNCTION delete_course_taggings();

-- ?¤íŒŸ ?? œ ??taggings ?ë™ ?? œ ?¸ë¦¬ê±?
-- target_type = 'spot' ???œê·¸ ?°ê²° ?? œ
CREATE OR REPLACE FUNCTION delete_spot_taggings()
RETURNS TRIGGER AS $$
BEGIN
    DELETE FROM taggings
    WHERE target_id = OLD.spot_id
    AND target_type = 'spot';
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_delete_spot_taggings
    AFTER DELETE ON spots
    FOR EACH ROW EXECUTE FUNCTION delete_spot_taggings();


-- ================================================
-- TABLE: bookmarks
-- ì½”ìŠ¤Â·?¤íŒŸ ë¶ë§ˆ???µí•© ?Œì´ë¸?
-- target_type ?¼ë¡œ ì½”ìŠ¤Â·?¤íŒŸ êµ¬ë¶„
-- [ì£¼ì˜] target_id FK ë¶ˆê? ???¸ë¦¬ê±°ë¡œ ë¬´ê²°??ë³´ì™„
-- ================================================
CREATE TABLE IF NOT EXISTS bookmarks (
    bookmark_id     UUID            NOT NULL DEFAULT gen_random_uuid(),
    -- PK: UUID ?¬ìš©

    user_id         UUID            NOT NULL,
    -- ë¶ë§ˆ?¬í•œ ?¬ìš©?? users.user_id ì°¸ì¡°

    target_id       UUID            NOT NULL,
    -- ë¶ë§ˆ???€??ID
    -- target_type = 'course' -> courses.course_id
    -- target_type = 'spot'   -> spots.spot_id

    target_type     VARCHAR(10)     NOT NULL,
    -- ë¶ë§ˆ???€??êµ¬ë¶„: 'course' / 'spot'

    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT pk_bookmarks
        PRIMARY KEY (bookmark_id),

    CONSTRAINT uq_bookmarks
        UNIQUE (user_id, target_id, target_type),
    -- ê°™ì? ?¬ìš©?ê? ê°™ì? ?€??ì¤‘ë³µ ë¶ë§ˆ??ë°©ì?

    CONSTRAINT fk_bookmarks_user
        FOREIGN KEY (user_id) REFERENCES users (user_id)
        ON DELETE CASCADE,
    -- ?Œì› ?ˆí‡´ ??ë¶ë§ˆ?¬ë„ ?¨ê»˜ ?? œ

    CONSTRAINT chk_bookmarks_target_type
        CHECK (target_type IN ('course', 'spot'))
    -- [ì£¼ì˜] target_id FK ë¶ˆê? (target_type ???°ë¼ ì°¸ì¡° ?Œì´ë¸??¬ë¼ì§?
    --        ?¸ë¦¬ê±°ë¡œ ë¬´ê²°??ë³´ì™„ (?˜ë‹¨ ?¸ë¦¬ê±?ì°¸ê³ )
);

-- ?¬ìš©?ë³„ ë¶ë§ˆ??ëª©ë¡ ì¡°íšŒ??
-- ë§ˆì´?˜ì´ì§€ ë¶ë§ˆ????ì¡°íšŒ ???¬ìš©
CREATE INDEX IF NOT EXISTS ix_bookmarks_user_type
    ON bookmarks (user_id, target_type);

-- ì½”ìŠ¤ ?? œ ??bookmarks ?ë™ ?? œ ?¸ë¦¬ê±?
CREATE OR REPLACE FUNCTION delete_course_bookmarks()
RETURNS TRIGGER AS $$
BEGIN
    DELETE FROM bookmarks
    WHERE target_id = OLD.course_id
    AND target_type = 'course';
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_delete_course_bookmarks
    AFTER DELETE ON courses
    FOR EACH ROW EXECUTE FUNCTION delete_course_bookmarks();

-- ?¤íŒŸ ?? œ ??bookmarks ?ë™ ?? œ ?¸ë¦¬ê±?
CREATE OR REPLACE FUNCTION delete_spot_bookmarks()
RETURNS TRIGGER AS $$
BEGIN
    DELETE FROM bookmarks
    WHERE target_id = OLD.spot_id
    AND target_type = 'spot';
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_delete_spot_bookmarks
    AFTER DELETE ON spots
    FOR EACH ROW EXECUTE FUNCTION delete_spot_bookmarks();


-- ================================================
-- TABLE: walk_records
-- ?°ì±… ê¸°ë¡ ?Œì´ë¸?
-- ì½”ìŠ¤ ê¸°ë°˜ ?°ì±… + ?ìœ  ê²½ë¡œ ê¸°ë¡ ?µí•© ê´€ë¦?
-- ================================================
CREATE TABLE IF NOT EXISTS walk_records (
    walk_record_id      UUID            NOT NULL DEFAULT gen_random_uuid(),
    -- PK: UUID ?¬ìš©

    user_id             UUID            NOT NULL,
    -- ?°ì±…???¬ìš©?? users.user_id ì°¸ì¡°

    course_id           UUID            NULL,
    -- ?°ì±…??ì½”ìŠ¤: courses.course_id ì°¸ì¡°
    -- ?ìœ  ê²½ë¡œ ê¸°ë¡ ??NULL
    -- ì½”ìŠ¤ ?? œ ??NULL ë¡?ë³€ê²?(?°ì±… ê¸°ë¡?€ ? ì?)

    actual_route        GEOGRAPHY(LINESTRING, 4326)  NULL,
    -- ?¤ì œ ?´ë™ ê²½ë¡œ GPS ì¢Œí‘œ (LINESTRING)
    -- ?? ST_GeomFromText('LINESTRING(126.97 37.56, 126.98 37.57)', 4326)
    -- ST_Length() ë¡??¤ì œ ?´ë™ ê±°ë¦¬ ?ë™ ê³„ì‚°
    -- ë¯¸ì™„ì£¼Â·ì¤‘???œì—???´ë™??ë§Œí¼ ?€??
    -- ì§„í–‰ ì¤‘ì¼ ?ŒëŠ” NULL

    total_distance      INT             NULL,
    -- ?¤ì œ ?´ë™ ê±°ë¦¬ (ë¯¸í„° ?¨ìœ„)
    -- ?°ì±… ì¢…ë£Œ ??ST_Length(actual_route) ë¡??ë™ ê³„ì‚° ???€??

    duration            INT             NULL,
    -- ?¤ì œ ?Œìš” ?œê°„ (ë¶??¨ìœ„)
    -- ?°ì±… ì¢…ë£Œ ???ë™ ê³„ì‚°

    is_completed        BOOLEAN         NOT NULL DEFAULT FALSE,
    -- ?„ì£¼ ?¬ë?
    -- TRUE: ì½”ìŠ¤ ?„ì£¼ / FALSE: ì¤‘ë„ ì¢…ë£Œ

    started_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    -- ?°ì±… ?œì‘ ?œê°

    ended_at            TIMESTAMPTZ     NULL,
    -- ?°ì±… ì¢…ë£Œ ?œê°
    -- ì§„í–‰ ì¤‘ì¼ ?ŒëŠ” NULL

    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT pk_walk_records
        PRIMARY KEY (walk_record_id),

    CONSTRAINT fk_walk_records_user
        FOREIGN KEY (user_id) REFERENCES users (user_id)
        ON DELETE CASCADE,
    -- ?Œì› ?ˆí‡´ ???°ì±… ê¸°ë¡???¨ê»˜ ?? œ

    CONSTRAINT fk_walk_records_course
        FOREIGN KEY (course_id) REFERENCES courses (course_id)
        ON DELETE SET NULL,
    -- ì½”ìŠ¤ ?? œ ??course_id NULL ë¡?ë³€ê²?(?°ì±… ê¸°ë¡ ? ì?)

    CONSTRAINT chk_walk_records_ended
        CHECK (ended_at IS NULL OR ended_at >= started_at)
    -- ì¢…ë£Œ ?œê°?€ ?œì‘ ?œê°ë³´ë‹¤ ?´í›„?¬ì•¼ ??
);

-- ?¬ìš©?ë³„ ?°ì±… ê¸°ë¡ ìµœì‹ ??ì¡°íšŒ??
-- ë§ˆì´?˜ì´ì§€ ?´ìš© ê¸°ë¡, ìµœê·¼ ?°ì±… ì½”ìŠ¤ ì¡°íšŒ ???¬ìš©
CREATE INDEX IF NOT EXISTS ix_walk_records_user_started
    ON walk_records (user_id, started_at DESC);

-- ì½”ìŠ¤ë³??°ì±… ê¸°ë¡ ì¡°íšŒ??
-- ì½”ìŠ¤ ?ì„¸?ì„œ ?´ìš© ?Ÿìˆ˜ ì§‘ê³„ ???¬ìš©
CREATE INDEX IF NOT EXISTS ix_walk_records_course_id
    ON walk_records (course_id)
    WHERE course_id IS NOT NULL;

-- [?´ìš©???¤íŒŸ ì¡°íšŒ ë°©ë²•]
-- ì½”ìŠ¤ ê¸°ë°˜ ?°ì±…: courses.route JSONB ?Œì‹±?¼ë¡œ ?¤íŒŸ ëª©ë¡ ì¶”ì¶œ
-- ?ìœ  ê²½ë¡œ ?°ì±…: ST_DWithin(spots.location, actual_route, ë°˜ê²½) ?¼ë¡œ ê°ì?


-- ================================================
-- TABLE: course_reviews
-- ì½”ìŠ¤ ?„ê¸° ?Œì´ë¸?
-- ?°ì±… ì¢…ë£Œ ???ëŠ” ?¼ë“œ?ì„œ ì§ì ‘ ?‘ì„± ê°€??
-- ================================================
CREATE TABLE IF NOT EXISTS course_reviews (
    course_review_id    UUID            NOT NULL DEFAULT gen_random_uuid(),
    -- PK: UUID ?¬ìš©

    user_id             UUID            NOT NULL,
    -- ?„ê¸° ?‘ì„±?? users.user_id ì°¸ì¡°

    course_id           UUID            NOT NULL,
    -- ?„ê¸° ?€??ì½”ìŠ¤: courses.course_id ì°¸ì¡°

    walk_record_id      UUID            NOT NULL,
    -- ?°ê²°???°ì±… ê¸°ë¡: walk_records.walk_record_id ì°¸ì¡°
    -- ?ì‘?Â·í›„ê¸??¬ìš©??ëª¨ë‘ ?¤ì œë¡?ê±·ê³  ?????‘ì„±
    -- walk_records.total_distance, duration ?¼ë¡œ ?¤ì œ ?´ë™ ê¸°ë¡ ?°ê²°

    description         TEXT            NULL,
    -- ?„ê¸° ?´ìš© (? íƒ ?…ë ¥)

    difficulty          VARCHAR(10)     NULL,
    -- ?¤ì œ ê±¸ì–´ë³??œì´??
    -- 'easy' / 'normal' / 'hard' / NULL: ë¯¸ì…??
    -- ì½”ìŠ¤ ?ìƒ‰ ??ëª¨ë“  ?„ê¸°???‰ê· ê°’ìœ¼ë¡??œì‹œ
    -- easy=1, normal=2, hard=3 ?¼ë¡œ ?˜ì¹˜ ë³€?????‰ê·  ê³„ì‚°
    -- ?? AVG(CASE difficulty WHEN 'easy' THEN 1 WHEN 'normal' THEN 2 WHEN 'hard' THEN 3 END)

    rating              DECIMAL(2,1)    NULL,
    -- ?‰ì  (1.0 ~ 5.0, 0.5 ?¨ìœ„) / NULL: ë¯¸ì…??
    -- ì½”ìŠ¤ ?ìƒ‰ ??ëª¨ë“  ?„ê¸°???‰ê· ê°’ìœ¼ë¡??œì‹œ

    is_public           BOOLEAN         NOT NULL DEFAULT TRUE,
    -- ê³µê°œ/ë¹„ê³µê°??¤ì •

    status              VARCHAR(20)     NOT NULL DEFAULT 'active',
    -- 'active': ?•ìƒ / 'hidden': ? ê³ ë¡??¨ê?

    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT pk_course_reviews
        PRIMARY KEY (course_review_id),

    CONSTRAINT fk_course_reviews_user
        FOREIGN KEY (user_id) REFERENCES users (user_id)
        ON DELETE CASCADE,
    -- ?Œì› ?ˆí‡´ ???„ê¸°???¨ê»˜ ?? œ

    CONSTRAINT fk_course_reviews_course
        FOREIGN KEY (course_id) REFERENCES courses (course_id)
        ON DELETE CASCADE,
    -- ì½”ìŠ¤ ?? œ ???„ê¸°???¨ê»˜ ?? œ

    CONSTRAINT fk_course_reviews_walk
        FOREIGN KEY (walk_record_id) REFERENCES walk_records (walk_record_id)
        ON DELETE RESTRICT,
    -- walk_record_id NOT NULL ?´ë?ë¡??°ì±… ê¸°ë¡ ?? œ ì°¨ë‹¨
    -- ?„ê¸° ?? œ ??walk_records ?? œ ?„ìš” (?±ë‹¨?ì„œ ì²˜ë¦¬)

    CONSTRAINT uq_course_reviews_walk_record
        UNIQUE (walk_record_id),
    -- ?´ìš© ê¸°ë¡ 1ê±???ì½”ìŠ¤ ?„ê¸° 1ë²ˆë§Œ ?‘ì„± ê°€??
    -- ?™ì¼ walk_record_id ë¡?ì¤‘ë³µ ?„ê¸° INSERT ì°¨ë‹¨

    CONSTRAINT chk_course_reviews_difficulty
        CHECK (difficulty IS NULL OR difficulty IN ('easy', 'normal', 'hard')),
    -- NULL: ë¯¸ì…???ˆìš©

    CONSTRAINT chk_course_reviews_rating
        CHECK (rating IS NULL OR rating BETWEEN 1.0 AND 5.0),
    -- ?‰ì  ë²”ìœ„ ê²€ì¦?(ë¯¸ì…????NULL ?ˆìš©)

    CONSTRAINT chk_course_reviews_status
        CHECK (status IN ('active', 'hidden'))
);

-- ì½”ìŠ¤ë³??„ê¸° ìµœì‹ ??ì¡°íšŒ??
CREATE INDEX IF NOT EXISTS ix_course_reviews_course_id
    ON course_reviews (course_id, created_at DESC);

-- ?¬ìš©?ë³„ ?„ê¸° ì¡°íšŒ??
-- ë§ˆì´?˜ì´ì§€ ?˜ì˜ ?„ê¸° ëª©ë¡ ì¡°íšŒ ???¬ìš©
CREATE INDEX IF NOT EXISTS ix_course_reviews_user_id
    ON course_reviews (user_id, created_at DESC);

-- updated_at ?ë™ ê°±ì‹  ?¸ë¦¬ê±?
CREATE OR REPLACE TRIGGER trg_course_reviews_updated_at
    BEFORE UPDATE ON course_reviews
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ================================================
-- TABLE: spot_reviews
-- ?¤íŒŸ ?„ê¸° ?Œì´ë¸?
-- ë°˜ë“œ???°ì±… ê¸°ë¡(walk_record_id)ê³??°ê²°?˜ì—¬ ?‘ì„±
-- ì§ì ‘ ?‘ì„±(walk_record_id NULL) ë¶ˆí—ˆ: ?´ìš© ê¸°ë¡ 1ê±????¤íŒŸë³?1ë²ˆë§Œ ?‘ì„± ê°€??
--
-- [?¤íŒŸ ?œê·¸ ?€??ë°©ì‹]
-- ?„ê¸° ?‘ì„± ??? íƒ???œê·¸??taggings ?Œì´ë¸”ì— ?€??
--   target_type = 'spot', target_id = spot_id, user_id = ?„ê¸° ?‘ì„±??
-- ?¤íŒŸ ?œê·¸ top 5 ì§‘ê³„:
--   SELECT tag_id, COUNT(*) FROM taggings
--   WHERE target_type = 'spot' AND target_id = spot_id
--   GROUP BY tag_id ORDER BY COUNT(*) DESC LIMIT 5
-- ================================================
CREATE TABLE IF NOT EXISTS spot_reviews (
    spot_review_id      UUID            NOT NULL DEFAULT gen_random_uuid(),
    -- PK: UUID ?¬ìš©

    user_id             UUID            NOT NULL,
    -- ?„ê¸° ?‘ì„±?? users.user_id ì°¸ì¡°

    spot_id             UUID            NOT NULL,
    -- ?„ê¸° ?€???¤íŒŸ: spots.spot_id ì°¸ì¡°

    walk_record_id      UUID            NOT NULL,
    -- ?°ê²°???°ì±… ê¸°ë¡: walk_records.walk_record_id ì°¸ì¡°
    -- ë°˜ë“œ???°ì±… ì¢…ë£Œ ???‘ì„±, ì§ì ‘ ?‘ì„±(NULL) ë¶ˆí—ˆ
    -- walk_record_id + spot_id UNIQUE ë¡??´ìš© ê¸°ë¡ 1ê±????¤íŒŸë³?1ë²ˆë§Œ ?‘ì„± ê°€??

    description         TEXT            NULL,
    -- ?„ê¸° ?´ìš© (? íƒ ?…ë ¥)

    photos              TEXT[]          NULL,
    -- ì²¨ë? ?¬ì§„ URL ë°°ì—´ (ìµœë? 5?? S3 ???¤í† ë¦¬ì? URL ?€??
    -- [ì£¼ì˜] ?±ë‹¨?ì„œ ìµœë? 5???œí•œ validation ?„ìš”

    is_recommended      BOOLEAN         NULL,
    -- ì¶”ì²œ/ë¹„ì¶”ì²?
    -- TRUE: ì¶”ì²œ / FALSE: ë¹„ì¶”ì²?/ NULL: ë¯¸ì„ ??

    is_public           BOOLEAN         NOT NULL DEFAULT TRUE,
    -- ê³µê°œ/ë¹„ê³µê°??¤ì •

    status              VARCHAR(20)     NOT NULL DEFAULT 'active',
    -- 'active': ?•ìƒ / 'hidden': ? ê³ ë¡??¨ê?

    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT pk_spot_reviews
        PRIMARY KEY (spot_review_id),

    CONSTRAINT fk_spot_reviews_user
        FOREIGN KEY (user_id) REFERENCES users (user_id)
        ON DELETE CASCADE,
    -- ?Œì› ?ˆí‡´ ???„ê¸°???¨ê»˜ ?? œ

    CONSTRAINT fk_spot_reviews_spot
        FOREIGN KEY (spot_id) REFERENCES spots (spot_id)
        ON DELETE CASCADE,
    -- ?¤íŒŸ ?? œ ???„ê¸°???¨ê»˜ ?? œ

    CONSTRAINT fk_spot_reviews_walk
        FOREIGN KEY (walk_record_id) REFERENCES walk_records (walk_record_id)
        ON DELETE RESTRICT,
    -- walk_record_id NOT NULL ?´ë?ë¡??°ì±… ê¸°ë¡ ?? œ ì°¨ë‹¨
    -- ?„ê¸° ?? œ ??walk_records ?? œ ?„ìš” (?±ë‹¨?ì„œ ì²˜ë¦¬)

    CONSTRAINT uq_spot_reviews_walk_spot
        UNIQUE (walk_record_id, spot_id),
    -- ?´ìš© ê¸°ë¡ 1ê±????¤íŒŸë³??„ê¸° 1ë²ˆë§Œ ?‘ì„± ê°€??
    -- ?™ì¼ walk_record_id + spot_id ì¡°í•© ì¤‘ë³µ INSERT ì°¨ë‹¨

    CONSTRAINT chk_spot_reviews_status
        CHECK (status IN ('active', 'hidden')),

    CONSTRAINT chk_spot_reviews_photos
        CHECK (array_length(photos, 1) <= 5)
    -- ?¬ì§„ ìµœë? 5???œí•œ DB??ë³´ì™„
);

-- ?¤íŒŸë³??„ê¸° ìµœì‹ ??ì¡°íšŒ??
CREATE INDEX IF NOT EXISTS ix_spot_reviews_spot_id
    ON spot_reviews (spot_id, created_at DESC);

-- ?¬ìš©?ë³„ ?„ê¸° ì¡°íšŒ??
-- ë§ˆì´?˜ì´ì§€ ?˜ì˜ ?„ê¸° ëª©ë¡ ì¡°íšŒ ???¬ìš©
CREATE INDEX IF NOT EXISTS ix_spot_reviews_user_id
    ON spot_reviews (user_id, created_at DESC);

-- updated_at ?ë™ ê°±ì‹  ?¸ë¦¬ê±?
CREATE OR REPLACE TRIGGER trg_spot_reviews_updated_at
    BEFORE UPDATE ON spot_reviews
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ================================================
-- TABLE: reactions
-- ì½”ìŠ¤ ?„ê¸°Â·?¤íŒŸ ?„ê¸° ì¢‹ì•„???«ì–´???µí•© ?Œì´ë¸?
-- bookmarksÂ·taggings ?€ ?™ì¼???µí•© ë°©ì‹
-- [ì£¼ì˜] target_id FK ë¶ˆê? ???¸ë¦¬ê±°ë¡œ ë¬´ê²°??ë³´ì™„
-- ================================================
CREATE TABLE IF NOT EXISTS reactions (
    user_id         UUID            NOT NULL,
    -- ë°˜ì‘???¬ìš©?? users.user_id ì°¸ì¡°

    target_id       UUID            NOT NULL,
    -- ë°˜ì‘ ?€??ID
    -- target_type = 'course_review' -> course_reviews.course_review_id
    -- target_type = 'spot_review'   -> spot_reviews.spot_review_id

    target_type     VARCHAR(20)     NOT NULL,
    -- ë°˜ì‘ ?€??êµ¬ë¶„
    -- 'course_review' / 'spot_review'

    reaction        VARCHAR(10)     NOT NULL,
    -- 'like' / 'dislike'

    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT pk_reactions
        PRIMARY KEY (user_id, target_id, target_type),
    -- ë³µí•© PK: ê°™ì? ?¬ìš©?ê? ê°™ì? ?€?ì— ì¤‘ë³µ ë°˜ì‘ ë°©ì?

    CONSTRAINT fk_reactions_user
        FOREIGN KEY (user_id) REFERENCES users (user_id)
        ON DELETE CASCADE,
    -- ?Œì› ?ˆí‡´ ??ë°˜ì‘???¨ê»˜ ?? œ

    CONSTRAINT chk_reactions_target_type
        CHECK (target_type IN ('course_review', 'spot_review')),

    CONSTRAINT chk_reactions_reaction
        CHECK (reaction IN ('like', 'dislike'))
    -- [ì£¼ì˜] target_id FK ë¶ˆê? (target_type ???°ë¼ ì°¸ì¡° ?Œì´ë¸??¬ë¼ì§?
    --        ?¸ë¦¬ê±°ë¡œ ë¬´ê²°??ë³´ì™„ (?˜ë‹¨ ?¸ë¦¬ê±?ì°¸ê³ )
);

-- ?€?ë³„ ë°˜ì‘ ì§‘ê³„ ì¡°íšŒ??
-- ?„ê¸° ?ì„¸?ì„œ ì¢‹ì•„???«ì–´????ì§‘ê³„ ???¬ìš©
CREATE INDEX IF NOT EXISTS ix_reactions_target
    ON reactions (target_type, target_id);

-- ì½”ìŠ¤ ?„ê¸° ?? œ ??reactions ?ë™ ?? œ ?¸ë¦¬ê±?
CREATE OR REPLACE FUNCTION delete_course_review_reactions()
RETURNS TRIGGER AS $$
BEGIN
    DELETE FROM reactions
    WHERE target_id = OLD.course_review_id
    AND target_type = 'course_review';
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_delete_course_review_reactions
    AFTER DELETE ON course_reviews
    FOR EACH ROW EXECUTE FUNCTION delete_course_review_reactions();

-- ?¤íŒŸ ?„ê¸° ?? œ ??reactions ?ë™ ?? œ ?¸ë¦¬ê±?
CREATE OR REPLACE FUNCTION delete_spot_review_reactions()
RETURNS TRIGGER AS $$
BEGIN
    DELETE FROM reactions
    WHERE target_id = OLD.spot_review_id
    AND target_type = 'spot_review';
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_delete_spot_review_reactions
    AFTER DELETE ON spot_reviews
    FOR EACH ROW EXECUTE FUNCTION delete_spot_review_reactions();


-- ================================================
-- TABLE: reports
-- ê¸??˜ê²½ ?íƒœ ? ê³  + ?¬ìš©??ì½˜í…ì¸?? ê³  ?µí•© ?Œì´ë¸?
-- report_category ë¡?? ê³  ë¶„ë¥˜ êµ¬ë¶„
-- [ì£¼ì˜] target_id FK ë¶ˆê? ???±ë‹¨ validation ?„ìš”
-- ================================================
CREATE TABLE IF NOT EXISTS reports (
    report_id       UUID            NOT NULL DEFAULT gen_random_uuid(),
    -- PK: UUID ?¬ìš©

    reporter_id     UUID            NULL,
    -- ? ê³ ???¬ìš©?? users.user_id ì°¸ì¡°
    -- ? ê³ ???ˆí‡´ ??NULL ë¡?ë³€ê²?(? ê³  ?´ì—­ ? ì?)

    target_id       UUID            NULL,
    -- ? ê³  ?€??ID
    -- target_type ???°ë¼ ì°¸ì¡° ?Œì´ë¸??¬ë¼ì§?
    -- ?„ì¹˜ ê¸°ë°˜ ? ê³  ??NULL (location ì»¬ëŸ¼?¼ë¡œ ?€ì²?

    target_type     VARCHAR(20)     NOT NULL,
    -- ? ê³  ?€??êµ¬ë¶„
    -- ?˜ê²½ ? ê³ : 'course' / 'spot'
    -- ?¬ìš©??? ê³ : 'course_review' / 'spot_review' / 'user'

    report_category VARCHAR(20)     NOT NULL,
    -- ? ê³  ë¶„ë¥˜
    -- 'environment': ê¸??˜ê²½ ?íƒœ ? ê³ 
    -- 'user': ?¬ìš©??ì½˜í…ì¸?? ê³ 

    reason          VARCHAR(30)     NOT NULL,
    -- ? ê³  ? í˜• (?¸ë? ?¬ìœ )
    -- ?˜ê²½: 'construction' / 'blocked' / 'dangerous' / 'info_error' / 'etc'
    -- ?¬ìš©?? 'spam' / 'abuse' / 'inappropriate' / 'false_info' / 'portrait' / 'etc'

    memo            TEXT            NULL,
    -- ê°„ë‹¨ ë©”ëª¨ (? íƒ ?…ë ¥)

    location        GEOGRAPHY(POINT, 4326)  NULL,
    -- ?°ì±… ì¤??„ì¹˜ ê¸°ë°˜ ? ê³  ??? ê³  ì§€??ì¢Œí‘œ ?€??
    -- ?? ST_Point(126.97, 37.56)::GEOGRAPHY
    -- ?¹ì • ì½”ìŠ¤Â·?¤íŒŸ ID ê¸°ë°˜ ? ê³  ??NULL
    -- ì§€?„ì— ? ê³  ?„ì¹˜ ?€ ?œì‹œ ???¬ìš©
    -- [ì£¼ì˜] target_id ?€ location ì¤??˜ë‚˜??ë°˜ë“œ??ì¡´ì¬?´ì•¼ ??(chk_reports_target ?¼ë¡œ ë³´ì¥)

    photo_url       TEXT            NULL,
    -- ì²¨ë? ?¬ì§„ URL (? íƒ ?…ë ¥, 1??

    status          VARCHAR(20)     NOT NULL DEFAULT 'received',
    -- ì²˜ë¦¬ ?íƒœ
    -- 'received': ?‘ìˆ˜ / 'in_progress': ì²˜ë¦¬ì¤?
    -- 'completed': ?„ë£Œ / 'rejected': ë°˜ë ¤

    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT pk_reports
        PRIMARY KEY (report_id),

    CONSTRAINT fk_reports_reporter
        FOREIGN KEY (reporter_id) REFERENCES users (user_id)
        ON DELETE SET NULL,
    -- ? ê³ ???ˆí‡´ ??? ê³  ?´ì—­ ? ì?, reporter_id ë§?NULL ë¡?ë³€ê²?

    CONSTRAINT uq_reports_duplicate
        UNIQUE (reporter_id, target_id, target_type),
    -- ?™ì¼ ?¬ìš©?ê? ?™ì¼ ?€??ì¤‘ë³µ ? ê³  ë°©ì? (ëª…ì„¸ ?”êµ¬?¬í•­)

    CONSTRAINT chk_reports_target
        CHECK (
            (target_id IS NOT NULL AND location IS NULL)   -- ID ê¸°ë°˜ ? ê³ 
            OR
            (target_id IS NULL AND location IS NOT NULL)   -- ?„ì¹˜ ê¸°ë°˜ ? ê³ 
        ),
    -- target_id (ID ê¸°ë°˜) ?ëŠ” location (?„ì¹˜ ê¸°ë°˜) ì¤??˜ë‚˜??ë°˜ë“œ??ì¡´ì¬
    -- ????NULL ?´ê±°??????NOT NULL ??ê²½ìš° ì°¨ë‹¨

    CONSTRAINT chk_reports_target_type
        CHECK (
            (target_type IN ('course', 'spot', 'course_review', 'spot_review', 'user') AND target_id IS NOT NULL)
            OR
            (target_type = 'location' AND location IS NOT NULL)
        ),
    -- target_type = 'location': ?„ì¹˜ ê¸°ë°˜ ? ê³  (?°ì±… ì¤??¹ì • ì§€??? ê³ )
    -- ?˜ë¨¸ì§€ target_type: ID ê¸°ë°˜ ? ê³ 

    CONSTRAINT chk_reports_category
        CHECK (report_category IN ('environment', 'user')),

    CONSTRAINT chk_reports_reason
        CHECK (reason IN (
            'construction', 'blocked', 'dangerous', 'info_error',
            'spam', 'abuse', 'inappropriate', 'false_info', 'portrait', 'etc'
        )),

    CONSTRAINT chk_reports_status
        CHECK (status IN ('received', 'in_progress', 'completed', 'rejected'))
    -- [ì£¼ì˜] target_id FK ë¶ˆê? (target_type ???°ë¼ ì°¸ì¡° ?Œì´ë¸??¬ë¼ì§?
    --        ?±ë‹¨ validation ?¼ë¡œ target_id ? íš¨??ê²€ì¦??„ìš”
);

-- ê´€ë¦¬ì ? ê³  ëª©ë¡ ì¡°íšŒ??
-- ?íƒœë³„Â·ìµœ? ìˆœ ?„í„° ì¡°íšŒ ë¹ˆë„ ?’ìŒ
CREATE INDEX IF NOT EXISTS ix_reports_status
    ON reports (status, created_at DESC);

-- ?€?ë³„ ? ê³  ??ì§‘ê³„??
-- ?¼ì • ? ê³  ???´ìƒ ???ë™ ?¨ê?Â·ê´€ë¦¬ì ?Œë¦¼ ì²˜ë¦¬???¬ìš©
CREATE INDEX IF NOT EXISTS ix_reports_target
    ON reports (target_type, target_id)
    WHERE target_id IS NOT NULL;

-- ?„ì¹˜ ê¸°ë°˜ ? ê³  ê³µê°„ ê²€?‰ìš© GiST ?¸ë±??
-- ?¹ì • ë°˜ê²½ ??? ê³  ?„ì¹˜ ì¡°íšŒ ???¬ìš©
-- ?? ST_DWithin(location, ST_Point(:lng, :lat)::GEOGRAPHY, 500)
CREATE INDEX IF NOT EXISTS ix_reports_location
    ON reports USING GIST (location)
    WHERE location IS NOT NULL;

-- updated_at ?ë™ ê°±ì‹  ?¸ë¦¬ê±?
CREATE OR REPLACE TRIGGER trg_reports_updated_at
    BEFORE UPDATE ON reports
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ================================================
-- TABLE: notifications
-- ?¸ì•± ?Œë¦¼ ?Œì´ë¸?
-- ?„ì¬ ? ê³  ì²˜ë¦¬ ?„ë£Œ ?Œë¦¼ë§?ì¡´ì¬
-- ?Œë¦¼ ? í˜• ì¶”ê? ??target_type CHECK ê°?ì¶”ê? ?„ìš”
-- ================================================
CREATE TABLE IF NOT EXISTS notifications (
    notification_id     UUID            NOT NULL DEFAULT gen_random_uuid(),
    -- PK: UUID ?¬ìš©

    user_id             UUID            NOT NULL,
    -- ?Œë¦¼ ?˜ì‹  ?¬ìš©?? users.user_id ì°¸ì¡°

    target_id           UUID            NULL,
    -- ?Œë¦¼ ê´€???€??ID
    -- target_type = 'report' -> reports.report_id
    -- ?Œë¦¼ ? í˜•???°ë¼ NULL ê°€??
    -- [ì£¼ì˜] target_id FK ë¶ˆê? (target_type ???°ë¼ ì°¸ì¡° ?Œì´ë¸??¬ë¼ì§?
    --        ?±ë‹¨ validation ?¼ë¡œ target_id ? íš¨??ê²€ì¦??„ìš”

    target_type         VARCHAR(20)     NULL,
    -- ?Œë¦¼ ?€??êµ¬ë¶„
    -- 'report': ? ê³  ì²˜ë¦¬ ?„ë£Œ ?Œë¦¼

    message             TEXT            NOT NULL,
    -- ?Œë¦¼ ë©”ì‹œì§€ ?´ìš©
    -- ?? '? ê³ ?˜ì‹  ?´ìš©??ì²˜ë¦¬?˜ì—ˆ?µë‹ˆ??'

    is_read             BOOLEAN         NOT NULL DEFAULT FALSE,
    -- ?½ìŒ ?¬ë?
    -- FALSE: ë¯¸ì½??/ TRUE: ?½ìŒ

    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT pk_notifications
        PRIMARY KEY (notification_id),

    CONSTRAINT fk_notifications_user
        FOREIGN KEY (user_id) REFERENCES users (user_id)
        ON DELETE CASCADE,
    -- ?Œì› ?ˆí‡´ ???Œë¦¼???¨ê»˜ ?? œ

    CONSTRAINT chk_notifications_target_type
        CHECK (target_type IN ('report'))
    -- ?„ì¬ ? ê³  ì²˜ë¦¬ ?„ë£Œ ?Œë¦¼ë§?ì¡´ì¬
    -- ?Œë¦¼ ? í˜• ì¶”ê? ??CHECK ê°?ì¶”ê? ?„ìš”
);

-- ?¬ìš©?ë³„ ë¯¸ì½???Œë¦¼ ì¡°íšŒ??
-- ???ë‹¨ ?Œë¦¼ ë±ƒì?, ?Œë¦¼ ëª©ë¡ ì¡°íšŒ ???¬ìš©
CREATE INDEX IF NOT EXISTS ix_notifications_user_read
    ON notifications (user_id, is_read, created_at DESC);


-- ================================================
-- TABLE: spot_ai_contents
-- ?¤íŒŸ AI ?Œì„± ?ˆë‚´ ?€ë³¸Â·ìŒ???Œì¼ ?€??
--
-- [??•  êµ¬ë¶„]
-- spots.content_* : ê´€ë¦¬ìê°€ ?‘ì„±???ë³¸ ?ŒìŠ¤ ?ìŠ¤??
--                   AI ?€ë³??ì„±Â·?¬ìƒ?±ì˜ ê¸°ë°˜ ?°ì´??
-- spot_ai_contents: ?ë³¸??AI ê°€ ê°€ê³µí•œ ê²°ê³¼ë¬??€??
--                   ?€ë³?script) + TTS ?Œì„± ?Œì¼(audio_url)
--
-- [?°ì´???ë¦„]
-- spots.content_history (?ë³¸)
--     ??AI API ë¡?ê°€ê³?
--     ??script (?€ë³? ?€??
--     ??TTS ë³€??
--     ??audio_url (?Œì„± ?Œì¼ URL) ?€??
--
-- [?°ì±… ì¤??¬ìƒ ?ë¦„]
-- ?¤íŒŸ ë°˜ê²½ ì§„ì…
--     ???¬ìš©??? íƒ ì½˜í…ì¸?? í˜• ?•ì¸
--     ??spot_ai_contents WHERE spot_id AND content_type ì¡°íšŒ
--     ??audio_url ?ˆìœ¼ë©??¬ìƒ
--     ??audio_url ?†ìœ¼ë©?script ë¡??¤ì‹œê°?TTS ?ì„± ???¬ìƒ + audio_url ?€??
--
-- [?Œì„± OFF ëª¨ë“œ]
-- audio_url ?¬ìƒ ?€??script ë¥??ìŠ¤???ì—…?¼ë¡œ ?œì‹œ
--
-- [ì½”ìŠ¤?€??ê´€ê³?
-- spot_ai_contents ??ì½”ìŠ¤?€ ë¬´ê??˜ê²Œ ?¤íŒŸ??ê·€??
-- ê°™ì? ?¤íŒŸ???¬ëŸ¬ ì½”ìŠ¤???¬í•¨?˜ì–´??1?Œë§Œ ?ì„±?˜ë©´ ?¬ì‚¬??ê°€??
--
-- [?¤ì‹œê°?TTS ì²˜ë¦¬ ??ª© - DB ?€??ë¶ˆí•„??
-- ?°ì±… ?œì‘ ?ˆë‚´: ?±ë‹¨ ?œí”Œë¦?+ courses.nameÂ·estimated_durationÂ·route(?¤íŒŸ ??
-- ê¸??ˆë‚´(ë°©í–¥): ì§€??API ?¤ë¹„ê²Œì´???¤ì‹œê°?ì²˜ë¦¬
-- ?°ì±… ì¢…ë£Œ ?ˆë‚´: ?±ë‹¨ ?œí”Œë¦?+ walk_records.total_distance + ë°©ë¬¸ ?¤íŒŸ ??JSONB/ST_DWithin ì§‘ê³„)
-- ================================================
CREATE TABLE IF NOT EXISTS spot_ai_contents (
    spot_id             UUID            NOT NULL,
    -- PK(ë³µí•©) + FK: spots.spot_id ì°¸ì¡°
    -- ?¤íŒŸ ?? œ ??AI ì½˜í…ì¸ ë„ ?¨ê»˜ ?? œ

    content_type        VARCHAR(20)     NOT NULL,
    -- ì½˜í…ì¸?? í˜•
    -- 'place'  : ?¥ì†Œ ?ˆë‚´ (spots.content_place ê¸°ë°˜)
    -- 'history': ??‚¬ ?´ì„¤ (spots.content_history ê¸°ë°˜)
    -- 'tour'   : ê´€ê´??ˆë‚´ (spots.content_tour ê¸°ë°˜)

    script              TEXT            NOT NULL,
    -- AI ê°€ ?ì„±???Œì„± ?ˆë‚´ ?€ë³??ìŠ¤??
    -- [?Œì„± OFF] ?ìŠ¤???ì—… ?œì‹œ???¬ìš©
    -- ?Œì„± ?Œì¼ ?¬ìƒ???„ìš” ???ë³¸ ?€ë³¸ìœ¼ë¡??œìš©

    audio_url           TEXT            NULL,
    -- TTS ë³€?˜ëœ ?Œì„± ?Œì¼ URL (S3 ???¤í† ë¦¬ì?)
    -- [?Œì„± ON] ?¬ìƒ???¬ìš©
    -- NULL: ?„ì§ ?Œì„± ?Œì¼ ë¯¸ìƒ???íƒœ
    --       ?¤íŒŸ ì§„ì… ???¤ì‹œê°?TTS ?ì„± ???€??

    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT pk_spot_ai_contents
        PRIMARY KEY (spot_id, content_type),
    -- ë³µí•© PK: spot_ai_content_id ?†ì´ (spot_id + content_type) ?¼ë¡œ ? ì¼ ?ë³„
    -- UNIQUE (spot_id, content_type) ê³??™ì¼ ?¨ê³¼ ??ë³„ë„ UNIQUE ë¶ˆí•„??

    CONSTRAINT fk_spot_ai_contents_spot
        FOREIGN KEY (spot_id) REFERENCES spots (spot_id)
        ON DELETE CASCADE,
    -- ?¤íŒŸ ?? œ ??AI ì½˜í…ì¸ ë„ ?¨ê»˜ ?? œ

    CONSTRAINT chk_spot_ai_content_type
        CHECK (content_type IN ('place', 'history', 'tour'))
    -- content_type ?ˆìš©ê°????…ë ¥ ì°¨ë‹¨
);

-- ?¤íŒŸë³?AI ì½˜í…ì¸?ì¡°íšŒ??
-- ?¤íŒŸ ë°˜ê²½ ì§„ì… ??spot_id + content_type ?¼ë¡œ ì¡°íšŒ
CREATE INDEX IF NOT EXISTS ix_spot_ai_contents_spot_id
    ON spot_ai_contents (spot_id);

-- updated_at ?ë™ ê°±ì‹  ?¸ë¦¬ê±?
CREATE OR REPLACE TRIGGER trg_spot_ai_contents_updated_at
    BEFORE UPDATE ON spot_ai_contents
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
