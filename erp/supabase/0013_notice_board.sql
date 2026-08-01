-- Notice Board — company-wide announcements, meeting notices/agendas/minutes,
-- policies, SOPs, templates, adverts, flyers, and the organogram. Unlike
-- staff_memos (HR-only, addressed to one employee or everyone, no
-- attachments), this is visible to every access tier and supports
-- image/PDF attachments so documents can be posted directly instead of
-- just described in text.

create table notice_board_posts (
  id          text primary key,
  title       text not null,
  category    text not null default 'Announcement'
              check (category in (
                'Announcement', 'Meeting Notice', 'Agenda', 'Minutes', 'Policy',
                'SOP', 'Template', 'Organogram', 'Advert', 'Flyer', 'Other'
              )),
  body        text,
  attachments jsonb not null default '[]'::jsonb,
  pinned      boolean not null default false,
  date        date not null default current_date,
  posted_by   text references employees(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index idx_notice_board_posts_date on notice_board_posts(date);
create trigger trg_notice_board_posts_updated_at before update on notice_board_posts
  for each row execute function set_updated_at();

alter table notice_board_posts enable row level security;
create policy notice_board_posts_anon_all on notice_board_posts for all to authenticated using (true) with check (true);
