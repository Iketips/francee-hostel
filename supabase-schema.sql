create extension if not exists btree_gist with schema extensions;

create table if not exists public.staff_members (
	user_id uuid primary key references auth.users(id) on delete cascade,
	display_name text not null check (length(trim(display_name)) > 0),
	created_at timestamptz not null default now()
);

create table if not exists public.guests (
	id uuid primary key default gen_random_uuid(),
	full_name text not null check (length(trim(full_name)) > 0),
	email text,
	phone text,
	nationality text,
	notes text,
	created_at timestamptz not null default now()
);

create table if not exists public.rooms (
	id uuid primary key default gen_random_uuid(),
	name text not null unique check (length(trim(name)) > 0),
	floor_level text not null check (floor_level in ('ground', 'first')),
	side_row integer check (side_row between 1 and 2),
	room_position integer check (room_position between 1 and 8),
	room_type text not null default 'Single room · private toilet, bath & kitchen',
	capacity integer not null default 1 check (capacity in (1, 2)),
	rent_amount numeric(12, 2) not null check (rent_amount >= 0),
	currency text not null default 'GHS' check (currency ~ '^[A-Z]{3}$'),
	rate_period text not null default 'academic_year' check (rate_period = 'academic_year'),
	status text not null default 'active' check (status in ('active', 'maintenance')),
	created_at timestamptz not null default now(),
	unique (floor_level, side_row, room_position)
);

alter table public.rooms add column if not exists floor_level text;
alter table public.rooms add column if not exists side_row integer;
alter table public.rooms add column if not exists room_position integer;
alter table public.rooms add column if not exists rent_amount numeric(12, 2);
alter table public.rooms add column if not exists currency text not null default 'GHS';
alter table public.rooms add column if not exists rate_period text not null default 'academic_year';
alter table public.rooms alter column side_row drop not null;
alter table public.rooms alter column room_position drop not null;
alter table public.rooms drop constraint if exists rooms_capacity_check;
alter table public.rooms add constraint rooms_capacity_check check (capacity in (1, 2));

create unique index if not exists rooms_floor_position_idx
	on public.rooms (floor_level, side_row, room_position)
	where floor_level is not null and side_row is not null and room_position is not null;

create table if not exists public.beds (
	id uuid primary key default gen_random_uuid(),
	room_id uuid not null references public.rooms(id) on delete restrict,
	label text not null check (length(trim(label)) > 0),
	status text not null default 'active' check (status in ('active', 'inactive')),
	created_at timestamptz not null default now()
);

drop index if exists public.beds_one_per_room_idx;
alter table public.beds drop constraint if exists beds_room_id_key;
create unique index if not exists beds_room_label_idx on public.beds (room_id, label);

create or replace function public.create_single_bed_for_room()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
	insert into public.beds (room_id, label, status)
	select new.id,
		case when new.capacity = 2 then 'Bed ' || bed_number::text else 'Single bed' end,
		'active'
	from generate_series(1, new.capacity) as numbers(bed_number)
	on conflict (room_id, label) do nothing;
	return new;
end;
$$;

drop trigger if exists create_single_bed_for_room on public.rooms;
create trigger create_single_bed_for_room
	after insert on public.rooms
	for each row execute function public.create_single_bed_for_room();

create table if not exists public.bookings (
	id uuid primary key default gen_random_uuid(),
	guest_id uuid not null references public.guests(id) on delete restrict,
	bed_id uuid not null references public.beds(id) on delete restrict,
	check_in date not null,
	check_out date not null,
	rate_amount numeric(12, 2) not null check (rate_amount >= 0),
	currency text not null default 'GHS' check (currency ~ '^[A-Z]{3}$'),
	rate_period text not null default 'academic_year' check (rate_period = 'academic_year'),
	status text not null default 'confirmed'
		check (status in ('pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled')),
	created_at timestamptz not null default now(),
	check (check_out > check_in and check_out <= (check_in + interval '8 months')::date),
	exclude using gist (
		bed_id with =,
		daterange(check_in, check_out, '[)') with &&
	) where (status in ('pending', 'confirmed', 'checked_in'))
);

alter table public.bookings add column if not exists rate_amount numeric(12, 2) not null default 0 check (rate_amount >= 0);
alter table public.bookings add column if not exists currency text not null default 'GHS' check (currency ~ '^[A-Z]{3}$');
alter table public.bookings add column if not exists rate_period text not null default 'academic_year' check (rate_period = 'academic_year');

do $$
begin
	if exists (
		select 1 from information_schema.columns
		where table_schema = 'public' and table_name = 'bookings' and column_name = 'nightly_rate'
	) then
		execute 'update public.bookings set rate_amount = nightly_rate where rate_amount = 0 and nightly_rate > 0';
		execute 'alter table public.bookings alter column nightly_rate drop not null';
	end if;
end;
$$;

create table if not exists public.payments (
	id uuid primary key default gen_random_uuid(),
	booking_id uuid not null references public.bookings(id) on delete restrict,
	amount numeric(12, 2) not null check (amount >= 0),
	currency text not null default 'GHS' check (currency ~ '^[A-Z]{3}$'),
	method text not null default 'cash'
		check (method in ('cash', 'card', 'bank_transfer', 'online', 'other')),
	status text not null default 'paid'
		check (status in ('paid', 'pending', 'refunded', 'failed')),
	paid_at date not null default current_date,
	created_at timestamptz not null default now()
);

create table if not exists public.expenses (
	id uuid primary key default gen_random_uuid(),
	category text not null check (length(trim(category)) > 0),
	amount numeric(12, 2) not null check (amount >= 0),
	currency text not null default 'GHS' check (currency ~ '^[A-Z]{3}$'),
	incurred_on date not null default current_date,
	vendor text,
	description text,
	created_at timestamptz not null default now()
);

create table if not exists public.room_requests (
	id uuid primary key,
	full_name text not null check (length(trim(full_name)) between 1 and 120),
	phone text not null check (length(trim(phone)) between 7 and 32),
	email text check (email is null or length(trim(email)) between 3 and 254),
	room_name text not null check (room_name in (
		'Ground-floor single room',
		'First-floor single room',
		'Ground-floor double room'
	)),
	guest_count integer not null check (guest_count in (1, 2)),
	check_in date not null,
	check_out date not null,
	identity_path text not null,
	status text not null default 'identity_pending'
		check (status in ('identity_pending', 'pending', 'reviewing', 'approved', 'declined')),
	created_at timestamptz not null default now(),
	check (email is not null or phone is not null),
	check (
		(room_name = 'Ground-floor double room' and guest_count between 1 and 2)
		or (room_name in ('Ground-floor single room', 'First-floor single room') and guest_count = 1)
	),
	check (check_out > check_in and check_out <= (check_in + interval '8 months')::date),
	check (identity_path = id::text || '/identity')
);

create index if not exists room_requests_created_at_idx on public.room_requests (created_at desc);

create table if not exists public.room_issues (
	id uuid primary key default gen_random_uuid(),
	room_name text not null check (
		room_name ~ '^(GF-(0[1-9]|1[0-6])|FF-(0[1-9]|1[0-6])|GF-D01)$'
	),
	category text not null check (
		category in ('Plumbing', 'Electrical', 'Cleaning', 'Furniture', 'Internet', 'Security', 'Other')
	),
	priority text not null default 'normal' check (priority in ('normal', 'high')),
	student_name text not null check (length(trim(student_name)) between 1 and 120),
	phone text not null check (length(trim(phone)) between 7 and 32),
	description text not null check (length(trim(description)) between 10 and 2000),
	status text not null default 'open' check (status in ('open', 'in_progress', 'resolved')),
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index if not exists room_issues_created_at_idx on public.room_issues (created_at desc);
create index if not exists room_issues_room_status_idx on public.room_issues (room_name, status);

alter table public.payments alter column currency set default 'GHS';
alter table public.expenses alter column currency set default 'GHS';

insert into public.rooms (
	name, floor_level, side_row, room_position, room_type, capacity,
	rent_amount, currency, rate_period, status
)
select
	floor_data.prefix || lpad(((row_data.side_row - 1) * 8 + positions.room_position)::text, 2, '0'),
	floor_data.floor_level,
	row_data.side_row,
	positions.room_position,
	'Single room · private toilet, bath & kitchen',
	1,
	floor_data.rent_amount,
	'GHS',
	'academic_year',
	'active'
from (values ('ground', 'GF-', 7000), ('first', 'FF-', 8000))
	as floor_data(floor_level, prefix, rent_amount)
cross join (values (1), (2)) as row_data(side_row)
cross join generate_series(1, 8) as positions(room_position)
on conflict (name) do nothing;

insert into public.rooms (
	name, floor_level, side_row, room_position, room_type, capacity,
	rent_amount, currency, rate_period, status
)
values (
	'GF-D01', 'ground', null, null,
	'Double room · two separate beds, no bunks, private toilet, bath & kitchen',
	2, 5500, 'GHS', 'academic_year', 'active'
)
on conflict (name) do update set
	floor_level = excluded.floor_level,
	side_row = excluded.side_row,
	room_position = excluded.room_position,
	room_type = excluded.room_type,
	capacity = excluded.capacity,
	rent_amount = excluded.rent_amount,
	currency = excluded.currency,
	rate_period = excluded.rate_period;

update public.beds bed
set label = 'Bed 1'
from public.rooms room
where bed.room_id = room.id
	and room.name = 'GF-D01'
	and room.capacity = 2
	and bed.label = 'Single bed'
	and not exists (
		select 1 from public.beds existing
		where existing.room_id = room.id and existing.label = 'Bed 1'
	);

insert into public.beds (room_id, label, status)
select room.id,
	case when room.capacity = 2 then 'Bed ' || bed_number::text else 'Single bed' end,
	'active'
from public.rooms room
cross join generate_series(1, room.capacity) as numbers(bed_number)
where room.floor_level in ('ground', 'first')
on conflict (room_id, label) do nothing;

create index if not exists bookings_dates_idx on public.bookings (check_in, check_out);
create index if not exists bookings_guest_idx on public.bookings (guest_id);
create index if not exists bookings_bed_idx on public.bookings (bed_id);
create index if not exists payments_date_status_idx on public.payments (paid_at, status);
create index if not exists expenses_date_idx on public.expenses (incurred_on);
create index if not exists beds_room_idx on public.beds (room_id);

alter table public.staff_members enable row level security;
alter table public.guests enable row level security;
alter table public.rooms enable row level security;
alter table public.beds enable row level security;
alter table public.bookings enable row level security;
alter table public.payments enable row level security;
alter table public.expenses enable row level security;
alter table public.room_requests enable row level security;
alter table public.room_issues enable row level security;

revoke all on public.staff_members, public.guests, public.rooms, public.beds,
	public.bookings, public.payments, public.expenses, public.room_requests, public.room_issues from anon, authenticated;
grant select on public.staff_members to authenticated;
grant select, insert, update, delete on public.guests, public.rooms, public.beds,
	public.bookings, public.payments, public.expenses to authenticated;
grant insert on public.room_requests to anon, authenticated;
grant select, update, delete on public.room_requests to authenticated;
grant insert on public.room_issues to anon, authenticated;
grant select, update on public.room_issues to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
	'room-request-identities',
	'room-request-identities',
	false,
	5242880,
	array['image/jpeg', 'image/png', 'application/pdf']
)
on conflict (id) do update set
	public = excluded.public,
	file_size_limit = excluded.file_size_limit,
	allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.can_upload_room_request_identity(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select exists (
		select 1 from public.room_requests request
		where request.identity_path = object_name
			and request.status = 'identity_pending'
			and object_name = request.id::text || '/identity'
	);
$$;

revoke all on function public.can_upload_room_request_identity(text) from public, anon, authenticated;
grant execute on function public.can_upload_room_request_identity(text) to anon, authenticated;

create or replace function public.complete_room_request(request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
	update public.room_requests request
	set status = 'pending'
	where request.id = request_id
		and request.status = 'identity_pending'
		and exists (
			select 1 from storage.objects object
			where object.bucket_id = 'room-request-identities'
				and object.name = request.identity_path
		);
	if not found then
		raise exception 'The room request or its identity document could not be verified.';
	end if;
end;
$$;

revoke all on function public.complete_room_request(uuid) from public, anon, authenticated;
grant execute on function public.complete_room_request(uuid) to anon, authenticated;

drop policy if exists "Staff can view their own membership" on public.staff_members;
create policy "Staff can view their own membership"
	on public.staff_members for select to authenticated
	using (user_id = (select auth.uid()));

drop policy if exists "Students can submit room requests" on public.room_requests;
create policy "Students can submit room requests"
	on public.room_requests for insert to anon, authenticated
	with check (
		status = 'identity_pending'
		and identity_path = id::text || '/identity'
	);

drop policy if exists "Staff manage room requests" on public.room_requests;
create policy "Staff manage room requests"
	on public.room_requests for all to authenticated
	using (exists (select 1 from public.staff_members sm where sm.user_id = (select auth.uid())))
	with check (exists (select 1 from public.staff_members sm where sm.user_id = (select auth.uid())));

drop policy if exists "Students can report room issues" on public.room_issues;
create policy "Students can report room issues"
	on public.room_issues for insert to anon, authenticated
	with check (status = 'open');

drop policy if exists "Staff can view room issues" on public.room_issues;
create policy "Staff can view room issues"
	on public.room_issues for select to authenticated
	using (exists (select 1 from public.staff_members sm where sm.user_id = (select auth.uid())));

drop policy if exists "Staff can update room issues" on public.room_issues;
create policy "Staff can update room issues"
	on public.room_issues for update to authenticated
	using (exists (select 1 from public.staff_members sm where sm.user_id = (select auth.uid())))
	with check (exists (select 1 from public.staff_members sm where sm.user_id = (select auth.uid())));

drop policy if exists "Students can upload requested identity documents" on storage.objects;
create policy "Students can upload requested identity documents"
	on storage.objects for insert to anon, authenticated
	with check (
		bucket_id = 'room-request-identities'
		and public.can_upload_room_request_identity(name)
	);

drop policy if exists "Staff can view requested identity documents" on storage.objects;
create policy "Staff can view requested identity documents"
	on storage.objects for select to authenticated
	using (
		bucket_id = 'room-request-identities'
		and exists (select 1 from public.staff_members sm where sm.user_id = (select auth.uid()))
	);

drop policy if exists "Staff manage guests" on public.guests;
create policy "Staff manage guests"
	on public.guests for all to authenticated
	using (exists (select 1 from public.staff_members sm where sm.user_id = (select auth.uid())))
	with check (exists (select 1 from public.staff_members sm where sm.user_id = (select auth.uid())));

drop policy if exists "Staff manage rooms" on public.rooms;
create policy "Staff manage rooms"
	on public.rooms for all to authenticated
	using (exists (select 1 from public.staff_members sm where sm.user_id = (select auth.uid())))
	with check (exists (select 1 from public.staff_members sm where sm.user_id = (select auth.uid())));

drop policy if exists "Staff manage beds" on public.beds;
create policy "Staff manage beds"
	on public.beds for all to authenticated
	using (exists (select 1 from public.staff_members sm where sm.user_id = (select auth.uid())))
	with check (exists (select 1 from public.staff_members sm where sm.user_id = (select auth.uid())));

drop policy if exists "Staff manage bookings" on public.bookings;
create policy "Staff manage bookings"
	on public.bookings for all to authenticated
	using (exists (select 1 from public.staff_members sm where sm.user_id = (select auth.uid())))
	with check (exists (select 1 from public.staff_members sm where sm.user_id = (select auth.uid())));

drop policy if exists "Staff manage payments" on public.payments;
create policy "Staff manage payments"
	on public.payments for all to authenticated
	using (exists (select 1 from public.staff_members sm where sm.user_id = (select auth.uid())))
	with check (exists (select 1 from public.staff_members sm where sm.user_id = (select auth.uid())));

drop policy if exists "Staff manage expenses" on public.expenses;
create policy "Staff manage expenses"
	on public.expenses for all to authenticated
	using (exists (select 1 from public.staff_members sm where sm.user_id = (select auth.uid())))
	with check (exists (select 1 from public.staff_members sm where sm.user_id = (select auth.uid())));

create or replace function public.get_public_hostel_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
	with active_rooms as (
		select room.id, room.floor_level, room.capacity
		from public.rooms room
		where room.status = 'active'
	),
	active_beds as (
		select bed.id, bed.room_id
		from public.beds bed
		join active_rooms room on room.id = bed.room_id
		where bed.status = 'active'
	),
	unavailable_beds as (
		select distinct bed.id, bed.room_id
		from active_beds bed
		join public.bookings booking on booking.bed_id = bed.id
		where booking.status in ('pending', 'confirmed', 'checked_in')
			and booking.check_in <= current_date
			and booking.check_out > current_date
	),
	unavailable_rooms as (
		select distinct bed.room_id
		from unavailable_beds bed
	)
	select jsonb_build_object(
		'people_accommodated',
			(select count(*) from public.bookings booking
				join active_beds bed on bed.id = booking.bed_id
				where booking.status = 'checked_in'
					and booking.check_in <= current_date
					and booking.check_out > current_date),
		'total_rooms',
			(select count(*) from active_rooms),
		'rooms_occupied',
			(select count(*) from unavailable_rooms),
		'rooms_remaining',
			greatest(
				(select count(*) from active_rooms) -
				(select count(*) from unavailable_rooms),
				0
			),
		'total_beds',
			(select count(*) from active_beds),
		'beds_remaining',
			greatest(
				(select count(*) from active_beds) -
				(select count(*) from unavailable_beds),
				0
			),
		'room_types',
			(select coalesce(jsonb_agg(
				jsonb_build_object(
					'room_name', room_group.room_name,
					'total', room_group.total,
					'available', room_group.available
				) order by room_group.room_name
			), '[]'::jsonb)
			from (
				select
					case
						when room.capacity = 2 then 'Ground-floor double room'
						when room.floor_level = 'first' then 'First-floor single room'
						else 'Ground-floor single room'
					end as room_name,
					count(*) as total,
					count(*) filter (where unavailable.room_id is null) as available
				from active_rooms room
				left join unavailable_rooms unavailable on unavailable.room_id = room.id
				group by room.floor_level, room.capacity
			) as room_group)
	);
$$;

revoke all on function public.get_public_hostel_status() from public, anon, authenticated;
grant execute on function public.get_public_hostel_status() to anon, authenticated;

create or replace function public.get_hostel_report(p_period_days integer, p_currency text)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
	report jsonb;
begin
	if p_period_days not in (30, 90, 365) then
		raise exception 'Report period must be 30, 90, or 365 days.';
	end if;
	if p_currency !~ '^[A-Z]{3}$' then
		raise exception 'Currency must be a three-letter uppercase code.';
	end if;
	if not exists (
		select 1 from public.staff_members sm where sm.user_id = auth.uid()
	) then
		raise exception 'Staff access is required.';
	end if;

	select jsonb_build_object(
		'bookings',
			(select count(*) from public.bookings b
			 where b.created_at >= now() - make_interval(days => p_period_days)
			   and b.status <> 'cancelled'),
		'revenue',
			(select coalesce(sum(p.amount), 0) from public.payments p
			 where p.status = 'paid' and p.currency = p_currency
			   and p.paid_at >= current_date - (p_period_days - 1)),
		'expenses',
			(select coalesce(sum(e.amount), 0) from public.expenses e
			 where e.currency = p_currency
			   and e.incurred_on >= current_date - (p_period_days - 1)),
		'occupied_rooms',
			(select count(distinct room.id) from public.rooms room
			 join public.beds bed on bed.room_id = room.id and bed.status = 'active'
			 where room.status = 'active'
			   and exists (
				   select 1 from public.bookings b
				   where b.bed_id = bed.id
				     and b.status in ('confirmed', 'checked_in')
				     and b.check_in <= current_date and b.check_out > current_date
			   )),
		'total_rooms',
			(select count(*) from public.rooms room where room.status = 'active'),
		'currencies',
			(select coalesce(array_agg(currency_code order by currency_code), array['GHS'])
			 from (
				 select 'GHS'::text as currency_code
				 union
				 select p.currency as currency_code from public.payments p
				 union
				 select e.currency as currency_code from public.expenses e
			 ) as currency_list),
		'monthly',
			(select coalesce(jsonb_agg(
				jsonb_build_object(
					'month', to_char(month_data.month_start, 'YYYY-MM'),
					'bookings', month_data.booking_count,
					'revenue', month_data.revenue
				) order by month_data.month_start
			), '[]'::jsonb)
			from (
				select months.month_start,
					(select count(*) from public.bookings b
					 where b.created_at >= months.month_start
					   and b.created_at < months.month_start + interval '1 month'
					   and b.status <> 'cancelled') as booking_count,
					(select coalesce(sum(p.amount), 0) from public.payments p
					 where p.status = 'paid' and p.currency = p_currency
					   and p.paid_at >= months.month_start::date
					   and p.paid_at < (months.month_start + interval '1 month')::date) as revenue
				from generate_series(
					date_trunc('month', current_date) - interval '5 months',
					date_trunc('month', current_date),
					interval '1 month'
				) as months(month_start)
			) as month_data)
	) into report;

	return report;
end;
$$;

revoke all on function public.get_hostel_report(integer, text) from public, anon;
grant execute on function public.get_hostel_report(integer, text) to authenticated;
