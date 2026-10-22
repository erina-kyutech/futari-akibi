-- ふたりの予定: 共有データベースのスキーマ（Neon Postgres）
-- calendars   : 共有カレンダー。invite_code は招待リンク用の秘密、rev は変更のたびに増える版番号
-- members     : 参加者。1カレンダーにつき最大2人（slot 1/2 の一意制約でDB側が保証）
--               token_hash は本人トークンの SHA-256。生のトークンは保存しない
--               presets は本人の「よく使う空き方」(JSON)。平日と夜それぞれ最大3つ
-- availability: 空き状況。(カレンダー, 参加者, 日付, 時間帯) ごとに独立した1行。行がある=空き
--               code は空きの範囲: F=終日 / U18=18時まで / S21=21時から（平日と土日祝の夜で使う）

create table if not exists calendars (
  id          uuid primary key,
  invite_code text not null,
  rev         bigint not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists members (
  id          uuid primary key,
  calendar_id uuid not null references calendars(id) on delete cascade,
  slot        smallint not null check (slot in (1, 2)),
  name        text not null check (char_length(name) between 1 and 40),
  token_hash  text not null unique,
  created_at  timestamptz not null default now(),
  unique (calendar_id, slot),
  unique (calendar_id, id)
);

create table if not exists availability (
  calendar_id uuid not null,
  member_id   uuid not null,
  day         date not null,
  period      text not null check (period in ('all', 'noon', 'night')),
  updated_at  timestamptz not null default now(),
  primary key (calendar_id, member_id, day, period),
  foreign key (calendar_id, member_id) references members(calendar_id, id) on delete cascade
);

-- 時間帯パターン機能の追加分（既存DBにも何度実行しても安全。既存の行は code='F'=終日になる）
alter table availability add column if not exists code text not null default 'F' check (code ~ '^(F|[US]([1-9]|1[0-9]|2[0-3]))$');
alter table members add column if not exists presets jsonb;
