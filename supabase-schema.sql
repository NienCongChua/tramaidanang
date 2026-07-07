create table if not exists public.notices (
  id text primary key,
  title text not null,
  body text not null,
  notice_time text not null default '',
  type text not null default 'general',
  featured boolean not null default false,
  audio_enabled boolean not null default false,
  audio_repeat_count integer not null default 1 check (audio_repeat_count between 1 and 10),
  audio_play_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table if not exists public.notice_audio_state (
  notice_id text primary key references public.notices(id) on delete cascade,
  signature text not null,
  played integer not null default 0,
  last_claimed_at timestamptz
);

alter table public.notices enable row level security;
alter table public.notice_audio_state enable row level security;

drop policy if exists "public read notices" on public.notices;
create policy "public read notices"
on public.notices for select
using (true);

drop policy if exists "public write notices" on public.notices;
create policy "public write notices"
on public.notices for all
using (true)
with check (true);

drop policy if exists "public read audio state" on public.notice_audio_state;
create policy "public read audio state"
on public.notice_audio_state for select
using (true);

drop policy if exists "public write audio state" on public.notice_audio_state;
create policy "public write audio state"
on public.notice_audio_state for all
using (true)
with check (true);

create or replace function public.claim_notice_audio()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  notice_record public.notices%rowtype;
  state_record public.notice_audio_state%rowtype;
  notice_signature text;
  next_play_at timestamptz;
begin
  perform pg_advisory_xact_lock(hashtext('tram_ai_notice_audio_claim'));

  for notice_record in
    select *
    from public.notices
    where audio_enabled = true
    order by created_at asc
  loop
    notice_signature :=
      coalesce(notice_record.updated_at::text, notice_record.created_at::text, '') || '|' ||
      coalesce(notice_record.title, '') || '|' ||
      coalesce(notice_record.body, '') || '|' ||
      case when notice_record.audio_enabled then '1' else '0' end || '|' ||
      coalesce(notice_record.audio_repeat_count::text, '1') || '|' ||
      coalesce(notice_record.audio_play_at::text, '');

    select *
    into state_record
    from public.notice_audio_state
    where notice_id = notice_record.id
    for update;

    if not found then
      insert into public.notice_audio_state (notice_id, signature, played)
      values (notice_record.id, notice_signature, 0)
      returning * into state_record;
    elsif state_record.signature <> notice_signature then
      update public.notice_audio_state
      set signature = notice_signature,
          played = 0,
          last_claimed_at = null
      where notice_id = notice_record.id
      returning * into state_record;
    end if;

    if state_record.played >= notice_record.audio_repeat_count then
      continue;
    end if;

    if notice_record.audio_play_at is not null and notice_record.audio_play_at > now() then
      if next_play_at is null or notice_record.audio_play_at < next_play_at then
        next_play_at := notice_record.audio_play_at;
      end if;
      continue;
    end if;

    update public.notice_audio_state
    set played = state_record.played + 1,
        last_claimed_at = now()
    where notice_id = notice_record.id
    returning * into state_record;

    return jsonb_build_object(
      'post', to_jsonb(notice_record),
      'played', state_record.played,
      'repeatCount', notice_record.audio_repeat_count,
      'nextPlayAt', null
    );
  end loop;

  return jsonb_build_object(
    'post', null,
    'played', 0,
    'repeatCount', 0,
    'nextPlayAt', next_play_at
  );
end;
$$;

grant select, insert, update, delete on public.notices to anon, authenticated;
grant select, insert, update, delete on public.notice_audio_state to anon, authenticated;
grant execute on function public.claim_notice_audio() to anon, authenticated;

insert into public.notices (
  id,
  title,
  body,
  notice_time,
  type,
  featured,
  audio_enabled,
  audio_repeat_count,
  audio_play_at,
  created_at,
  updated_at
)
values
  (
    'seed-main',
    'Ngày mai vào lúc 07:00 họp dân tại Nhà Văn Hóa bản',
    'Kính đề nghị bà con sắp xếp thời gian tham dự đầy đủ.',
    '02/07/2026',
    'meeting',
    true,
    false,
    1,
    null,
    '2026-07-01T10:25:00.000Z',
    null
  ),
  (
    'seed-health',
    'Lịch tiêm phòng cho đàn gia súc đợt 2',
    'Thời gian: 05/07/2026',
    '05/07/2026',
    'health',
    false,
    false,
    1,
    null,
    '2026-07-01T09:10:00.000Z',
    null
  ),
  (
    'seed-weather',
    'Cảnh báo nguy cơ sạt lở đất',
    'Từ ngày 03/07 - 05/07, hạn chế đi qua taluy cao khi mưa lớn.',
    '03/07 - 05/07',
    'weather',
    false,
    false,
    1,
    null,
    '2026-07-01T08:15:00.000Z',
    null
  ),
  (
    'seed-agri',
    'Hướng dẫn phòng trừ sâu bệnh hại ngô',
    'Xem chi tiết tại trạm hoặc liên hệ cán bộ nông nghiệp.',
    'Trong tuần',
    'agriculture',
    false,
    false,
    1,
    null,
    '2026-07-01T07:40:00.000Z',
    null
  )
on conflict (id) do nothing;
