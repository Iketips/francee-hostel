(function () {
	'use strict';

	const CONFIG_KEY = 'staykind.supabase.config';
	const setupPanel = document.getElementById('setup-panel');
	const loginPanel = document.getElementById('login-panel');
	const staffPanel = document.getElementById('staff-panel');
	const workspace = document.getElementById('staff-workspace');
	const setupMessage = document.getElementById('setup-message');
	const loginMessage = document.getElementById('login-message');
	const dashboardMessage = document.getElementById('dashboard-message');
	const configForm = document.getElementById('config-form');
	const loginForm = document.getElementById('login-form');
	const reportPeriod = document.getElementById('report-period');
	const reportCurrency = document.getElementById('report-currency');
	let supabaseClient;
	let latestRooms = [];
	let latestGuests = [];
	let latestBeds = [];
	let latestBookings = [];
	let sessionRequest = 0;

	function setMessage(element, text, kind) {
		element.textContent = text || '';
		element.className = 'form-message' + (kind ? ' ' + kind : '');
	}

	function showPanels({ setup = false, login = false, staff = false } = {}) {
		setupPanel.hidden = !setup;
		loginPanel.hidden = !login;
		staffPanel.hidden = !staff;
	}

	function errorText(error) {
		return error && error.message ? error.message : 'An unexpected error occurred.';
	}

	function showError(element, prefix, error) {
		setMessage(element, prefix + ': ' + errorText(error), 'error');
	}

	function formatDate(value) {
		if (!value) return '';
		return new Date(value + 'T12:00:00').toLocaleDateString();
	}

	function formatMoney(value, currency) {
		const amount = Number(value || 0);
		try {
			return new Intl.NumberFormat(undefined, {
				style: 'currency',
				currency: currency,
				maximumFractionDigits: 2
			}).format(amount);
		} catch (error) {
			return currency + ' ' + amount.toFixed(2);
		}
	}

	function addOption(select, value, label) {
		const option = document.createElement('option');
		option.value = value;
		option.textContent = label;
		select.append(option);
	}

	function fillSelect(select, rows, valueFor, labelFor, placeholder) {
		const oldValue = select.value;
		select.replaceChildren();
		addOption(select, '', placeholder);
		rows.forEach(row => addOption(select, valueFor(row), labelFor(row)));
		if (rows.some(row => valueFor(row) === oldValue)) {
			select.value = oldValue;
		}
	}

	function renderList(id, rows, labelFor, limit = 8) {
		const list = document.getElementById(id);
		list.replaceChildren();
		rows.slice(0, limit).forEach(row => {
			const item = document.createElement('p');
			item.textContent = labelFor(row);
			list.append(item);
		});
	}

	function renderRecordLists(data) {
		renderList('guest-list', data.guests, row => row.full_name + (row.email ? ' · ' + row.email : ''));
		renderList('room-list', data.rooms, row => row.name + ' · ' + floorName(row.floor_level) + (row.side_row ? ' · row ' + row.side_row + ', position ' + row.room_position : '') + ' · ' + row.capacity + (row.capacity === 1 ? ' person' : ' people') + ' · ' + formatMoney(row.rent_amount, row.currency || 'GHS') + ' / person / academic year · ' + row.status, 40);
		renderList('booking-list', data.bookings, row =>
			row.guests.full_name + ' · ' + row.beds.rooms.name + ' / ' + row.beds.label + ' · ' +
			formatDate(row.check_in) + ' – ' + formatDate(row.check_out) + ' · ' + formatMoney(row.rate_amount, row.currency) + ' / academic year · ' + row.status
		);
		renderList('payment-list', data.payments, row =>
			formatMoney(row.amount, row.currency) + ' · ' + row.status + ' · ' + formatDate(row.paid_at)
		);
		renderList('expense-list', data.expenses, row =>
			row.category + ' · ' + formatMoney(row.amount, row.currency) + ' · ' + formatDate(row.incurred_on)
		);
	}

	function renderRoomRequests(requests) {
		const list = document.getElementById('room-request-list');
		list.replaceChildren();
		if (!requests.length) {
			const empty = document.createElement('p');
			empty.textContent = 'No room requests have been received.';
			list.append(empty);
			return;
		}
		requests.forEach(request => {
			const item = document.createElement('article');
			item.className = 'room-request-item';
			const details = document.createElement('p');
			details.textContent = request.full_name + ' · ' + request.room_name + ' · ' +
				formatDate(request.check_in) + ' – ' + formatDate(request.check_out) + ' · ' +
				request.guest_count + (request.guest_count === 1 ? ' person' : ' people') +
				' · Phone: ' + request.phone + (request.email ? ' · Email: ' + request.email : '') +
				' · ' + request.status.replace('_', ' ') + ' · Ref ' + request.id;
			item.append(details);
			if (request.identity_path && request.status !== 'identity_pending') {
				const button = document.createElement('button');
				button.className = 'secondary-button';
				button.type = 'button';
				button.textContent = 'Prepare private ID link';
				button.addEventListener('click', async () => {
					button.disabled = true;
					try {
						const { data, error } = await supabaseClient.storage
							.from('room-request-identities')
							.createSignedUrl(request.identity_path, 60, { download: true });
						if (error) throw error;
						const link = document.createElement('a');
						link.className = 'request-document-link';
						link.href = data.signedUrl;
						link.target = '_blank';
						link.rel = 'noopener noreferrer';
						link.textContent = 'Download identity document (link expires in 60 seconds)';
						button.replaceWith(link);
					} catch (error) {
						button.disabled = false;
						showError(dashboardMessage, 'Could not prepare the private identity link', error);
					}
				});
				item.append(button);
			} else {
				const unavailable = document.createElement('p');
				unavailable.textContent = 'Identity upload is incomplete. Contact the student before reviewing this request.';
				item.append(unavailable);
			}
			list.append(item);
		});
	}

	function renderRoomIssues(issues) {
		const list = document.getElementById('room-issue-list');
		list.replaceChildren();
		if (!issues.length) {
			const empty = document.createElement('p');
			empty.textContent = 'No student room issues have been reported.';
			list.append(empty);
			return;
		}
		issues.forEach(issue => {
			const item = document.createElement('article');
			item.className = 'room-issue-item';
			const summary = document.createElement('p');
			const heading = document.createElement('strong');
			heading.textContent = issue.room_name + ' · ' + issue.category + ' · ' +
				(issue.priority === 'high' ? 'Urgent' : 'Normal');
			summary.append(heading, document.createElement('br'));
			summary.append(
				document.createTextNode(
					issue.student_name + ' · ' + issue.phone + ' · ' + formatDate(issue.created_at.slice(0, 10))
				)
			);
			const description = document.createElement('p');
			description.className = 'room-issue-description';
			description.textContent = issue.description;
			const actions = document.createElement('div');
			actions.className = 'room-issue-actions';
			const status = document.createElement('select');
			status.setAttribute('aria-label', 'Issue status for ' + issue.room_name);
			[
				['open', 'Open'],
				['in_progress', 'In progress'],
				['resolved', 'Resolved']
			].forEach(([value, label]) => addOption(status, value, label));
			status.value = issue.status;
			const save = document.createElement('button');
			save.type = 'button';
			save.textContent = 'Update status';
			save.addEventListener('click', async () => {
				save.disabled = true;
				try {
					const { error } = await supabaseClient
						.from('room_issues')
						.update({ status: status.value, updated_at: new Date().toISOString() })
						.eq('id', issue.id);
					if (error) throw error;
					setMessage(dashboardMessage, 'Issue status updated for ' + issue.room_name + '.', 'success');
					await loadRecords();
				} catch (error) {
					save.disabled = false;
					showError(dashboardMessage, 'Could not update room issue', error);
				}
			});
			actions.append(status, save);
			item.append(summary, description, actions);
			list.append(item);
		});
	}

	function floorName(floor) {
		return floor === 'ground' ? 'Ground floor' : floor === 'first' ? 'First floor' : 'Floor not set';
	}

	function roomOptionLabel(bed) {
		const room = bed.rooms;
		const location = room.side_row ? ' · row ' + room.side_row + ', position ' + room.room_position : '';
		return room.name + ' · ' + floorName(room.floor_level) + location + ' · ' +
			room.capacity + (room.capacity === 1 ? ' person' : ' people') + ' · ' +
			formatMoney(room.rent_amount, room.currency) + ' / person / academic year';
	}

	function updateBookingRate() {
		const bedId = document.querySelector('#booking-form [name="bed_id"]').value;
		const bed = latestBeds.find(item => item.id === bedId);
		document.getElementById('booking-rate-label').textContent = bed
			? 'Rate: ' + formatMoney(bed.rooms.rent_amount, bed.rooms.currency) + ' per person for the full academic year.'
			: 'Select a room to see its academic-year rate.';
	}

	function updateRecordSelects() {
		fillSelect(
			document.querySelector('#booking-form [name="guest_id"]'),
			latestGuests,
			guest => guest.id,
			guest => guest.full_name,
			'Select a guest'
		);
		const requestedCheckIn = document.querySelector('#booking-form [name="check_in"]').value;
		const requestedCheckOut = document.querySelector('#booking-form [name="check_out"]').value;
		const availableBeds = latestBeds.filter(bed => {
			if (bed.status !== 'active' || bed.rooms.status !== 'active') return false;
			if (!requestedCheckIn || !requestedCheckOut) return true;
			return !latestBookings.some(booking =>
				booking.bed_id === bed.id &&
				['pending', 'confirmed', 'checked_in'].includes(booking.status) &&
				booking.check_in < requestedCheckOut &&
				booking.check_out > requestedCheckIn
			);
		});
		fillSelect(
			document.querySelector('#booking-form [name="bed_id"]'),
			availableBeds,
			bed => bed.id,
			roomOptionLabel,
			'Select an active bed'
		);
		fillSelect(
			document.querySelector('#payment-form [name="booking_id"]'),
			latestBookings,
			booking => booking.id,
			booking => booking.guests.full_name + ' · ' + formatDate(booking.check_in) + ' · ' + booking.status,
			'Select a booking'
		);
		updateBookingRate();
	}

	async function loadRecords() {
		const [guests, rooms, beds, bookings, payments, expenses, roomRequests, roomIssues] = await Promise.all([
			supabaseClient.from('guests').select('id,full_name,email,phone,nationality,notes,created_at').order('created_at', { ascending: false }).limit(500),
			supabaseClient.from('rooms').select('id,name,floor_level,side_row,room_position,room_type,capacity,rent_amount,currency,rate_period,status,created_at').order('floor_level').order('side_row').order('room_position').limit(500),
			supabaseClient.from('beds').select('id,room_id,label,status,rooms(id,name,floor_level,side_row,room_position,room_type,capacity,rent_amount,currency,rate_period,status)').order('created_at', { ascending: false }).limit(500),
			supabaseClient.from('bookings').select('id,guest_id,bed_id,check_in,check_out,rate_amount,currency,rate_period,status,created_at,guests(full_name),beds(label,rooms(id,name,floor_level,side_row,room_position,rent_amount,currency,rate_period))').order('created_at', { ascending: false }).limit(500),
			supabaseClient.from('payments').select('id,booking_id,amount,currency,status,paid_at,created_at').order('created_at', { ascending: false }).limit(8),
			supabaseClient.from('expenses').select('id,category,amount,currency,incurred_on,vendor,description,created_at').order('created_at', { ascending: false }).limit(8),
			supabaseClient.from('room_requests').select('id,full_name,phone,email,room_name,guest_count,check_in,check_out,identity_path,status,created_at').order('created_at', { ascending: false }).limit(100),
			supabaseClient.from('room_issues').select('id,room_name,category,priority,student_name,phone,description,status,created_at,updated_at').order('created_at', { ascending: false }).limit(200)
		]);
		const results = [guests, rooms, beds, bookings, payments, expenses, roomRequests, roomIssues];
		const failed = results.find(result => result.error);
		if (failed) throw failed.error;

		latestGuests = guests.data;
		latestRooms = rooms.data;
		latestBeds = beds.data.filter(bed => bed.rooms);
		latestBookings = bookings.data.filter(booking => booking.guests && booking.beds && booking.beds.rooms);
		renderRecordLists({
			guests: latestGuests,
			rooms: latestRooms,
			beds: latestBeds,
			bookings: latestBookings,
			payments: payments.data,
			expenses: expenses.data
		});
		renderRoomRequests(roomRequests.data);
		renderRoomIssues(roomIssues.data);
		updateRecordSelects();
	}

	function appendMetric(container, label, value) {
		const card = document.createElement('div');
		card.className = 'metric-card';
		const name = document.createElement('span');
		name.textContent = label;
		const amount = document.createElement('strong');
		amount.textContent = value;
		card.append(name, amount);
		container.append(card);
	}

	function renderMonthlyChart(months, currency) {
		const chart = document.getElementById('monthly-chart');
		chart.replaceChildren();
		const maxBookings = Math.max(1, ...months.map(month => Number(month.bookings)));
		const maxRevenue = Math.max(1, ...months.map(month => Number(month.revenue)));
		months.forEach(month => {
			const column = document.createElement('div');
			column.className = 'bar-month';
			const pair = document.createElement('div');
			pair.className = 'bar-pair';
			const bookings = document.createElement('div');
			bookings.className = 'bar booking-bar';
			bookings.style.height = Number(month.bookings) ? Math.max(2, Number(month.bookings) / maxBookings * 100) + '%' : '0%';
			bookings.title = month.bookings + ' bookings';
			const revenue = document.createElement('div');
			revenue.className = 'bar revenue-bar';
			revenue.style.height = Number(month.revenue) ? Math.max(2, Number(month.revenue) / maxRevenue * 100) + '%' : '0%';
			revenue.title = formatMoney(month.revenue, currency);
			pair.append(bookings, revenue);
			const label = document.createElement('small');
			label.textContent = month.month;
			label.title = month.month;
			column.append(pair, label);
			chart.append(column);
		});
	}

	function renderAvailability(status) {
		const metrics = document.getElementById('admin-availability-metrics');
		metrics.replaceChildren();
		[
			['People accommodated', status.people_accommodated],
			['Rooms remaining today', status.rooms_remaining],
			['Total active rooms', status.total_rooms],
			['Beds available today', status.beds_remaining]
		].forEach(([label, value]) => appendMetric(metrics, label, String(value)));
		const occupied = Number(status.rooms_occupied);
		const total = Number(status.total_rooms);
		const percent = total ? Math.min(100, occupied / total * 100) : 0;
		document.getElementById('admin-availability-progress').style.width = percent + '%';
		document.getElementById('admin-availability-caption').textContent =
			occupied + ' of ' + total + ' active rooms occupied or reserved today · refreshed ' +
			new Date().toLocaleTimeString();
	}

	async function loadAvailability() {
		if (!window.FranCeeHostel || typeof window.FranCeeHostel.getStatus !== 'function') {
			throw new Error('The shared hostel availability service is unavailable.');
		}
		renderAvailability(await window.FranCeeHostel.getStatus());
	}

	async function loadReport() {
		const periodDays = Number(reportPeriod.value);
		const currency = reportCurrency.value;
		const { data, error } = await supabaseClient.rpc('get_hostel_report', {
			p_period_days: periodDays,
			p_currency: currency
		});
		if (error) throw error;

		const availableCurrencies = Array.isArray(data.currencies) ? data.currencies : ['GHS'];
		const currentCurrency = availableCurrencies.includes(currency) ? currency : 'GHS';
		if (currentCurrency !== currency) {
			reportCurrency.value = currentCurrency;
			return loadReport();
		}
		const currencies = availableCurrencies.length ? availableCurrencies : ['GHS'];
		const oldCurrency = reportCurrency.value;
		reportCurrency.replaceChildren();
		currencies.forEach(code => addOption(reportCurrency, code, code));
		reportCurrency.value = currencies.includes(oldCurrency) ? oldCurrency : 'GHS';

		const metrics = document.getElementById('report-metrics');
		metrics.replaceChildren();
		const revenue = Number(data.revenue || 0);
		const expenses = Number(data.expenses || 0);
		appendMetric(metrics, 'Bookings created', String(data.bookings || 0));
		appendMetric(metrics, 'Paid revenue · ' + currentCurrency, formatMoney(revenue, currentCurrency));
		appendMetric(metrics, 'Expenses · ' + currentCurrency, formatMoney(expenses, currentCurrency));
		appendMetric(metrics, 'Net · ' + currentCurrency, formatMoney(revenue - expenses, currentCurrency));

		const totalRooms = Number(data.total_rooms || 0);
		const occupiedRooms = Number(data.occupied_rooms || 0);
		const occupancy = totalRooms ? Math.min(100, occupiedRooms / totalRooms * 100) : 0;
		document.getElementById('occupancy-progress').style.width = occupancy + '%';
		document.getElementById('occupancy-caption').textContent = totalRooms
			? occupiedRooms + ' of ' + totalRooms + ' active rooms occupied (' + Math.round(occupancy) + '%)'
			: 'No active rooms recorded yet.';
		renderMonthlyChart(Array.isArray(data.monthly) ? data.monthly : [], currentCurrency);
	}

	async function refreshDashboard() {
		await Promise.all([loadRecords(), loadReport()]);
		try {
			await loadAvailability();
		} catch (error) {
			showError(dashboardMessage, 'Could not load shared availability', error);
		}
	}

	async function handleSession(session) {
		const request = ++sessionRequest;
		workspace.hidden = true;
		if (!session) {
			showPanels({ setup: false, login: Boolean(supabaseClient), staff: false });
			return;
		}
		showPanels({ staff: true });
		document.getElementById('staff-status').textContent = 'Signed in as ' + session.user.email;
		setMessage(dashboardMessage, 'Checking staff access…');
		try {
			const { data, error } = await supabaseClient
				.from('staff_members')
				.select('display_name')
				.eq('user_id', session.user.id)
				.maybeSingle();
			if (error) throw error;
			if (request !== sessionRequest) return;
			if (!data) {
				setMessage(dashboardMessage, 'This account is not on the staff list. Ask a project administrator to add it to public.staff_members.', 'error');
				return;
			}
			workspace.hidden = false;
			setMessage(dashboardMessage, '');
			await refreshDashboard();
		} catch (error) {
			if (request === sessionRequest) {
				showError(dashboardMessage, 'Could not load staff records', error);
			}
		}
	}

	function startClient(config) {
		if (!window.supabase || typeof window.supabase.createClient !== 'function') {
			showPanels({ setup: true });
			setMessage(setupMessage, 'The Supabase client library did not load. Check your internet connection and reload this page.', 'error');
			return;
		}
		try {
			const parsedUrl = new URL(config.url);
			if (parsedUrl.protocol !== 'https:' && parsedUrl.hostname !== 'localhost') {
				throw new Error('Use an HTTPS Supabase project URL.');
			}
			if (!config.key) throw new Error('Enter the publishable / anon key from your Supabase project.');
			supabaseClient = window.supabase.createClient(config.url, config.key);
			showPanels({ login: true });
			supabaseClient.auth.onAuthStateChange((_event, session) => {
				queueMicrotask(() => handleSession(session));
			});
			supabaseClient.auth.getSession().then(({ data, error }) => {
				if (error) throw error;
				return handleSession(data.session);
			}).catch(error => {
				showPanels({ login: true });
				showError(loginMessage, 'Could not restore sign-in', error);
			});
		} catch (error) {
			supabaseClient = undefined;
			showPanels({ setup: true });
			showError(setupMessage, 'Could not connect', error);
		}
	}

	configForm.addEventListener('submit', event => {
		event.preventDefault();
		const formData = new FormData(configForm);
		const config = {
			url: String(formData.get('url')).trim().replace(/\/+$/, ''),
			key: String(formData.get('key')).trim()
		};
		try {
			const parsedUrl = new URL(config.url);
			if (parsedUrl.protocol !== 'https:' && parsedUrl.hostname !== 'localhost') {
				throw new Error('The project URL must use HTTPS.');
			}
			if (!config.key) throw new Error('Enter the publishable / anon key.');
			localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
			setMessage(setupMessage, 'Project settings saved in this browser.', 'success');
			startClient(config);
		} catch (error) {
			showError(setupMessage, 'Could not save settings', error);
		}
	});

	loginForm.addEventListener('submit', async event => {
		event.preventDefault();
		const formData = new FormData(loginForm);
		setMessage(loginMessage, 'Signing in…');
		try {
			const { error } = await supabaseClient.auth.signInWithPassword({
				email: String(formData.get('email')).trim(),
				password: String(formData.get('password'))
			});
			if (error) throw error;
			loginForm.reset();
			setMessage(loginMessage, '');
		} catch (error) {
			showError(loginMessage, 'Sign-in failed', error);
		}
	});

	document.getElementById('change-project-button').addEventListener('click', async () => {
		setMessage(loginMessage, 'Disconnecting current project…');
		try {
			if (supabaseClient) {
				const { error } = await supabaseClient.auth.signOut();
				if (error) throw error;
			}
			localStorage.removeItem(CONFIG_KEY);
			supabaseClient = undefined;
			showPanels({ setup: true });
			setMessage(setupMessage, 'Enter the project URL and publishable / anon key for this browser.');
		} catch (error) {
			showError(loginMessage, 'Could not disconnect project', error);
		}
	});

	document.getElementById('signout-button').addEventListener('click', async () => {
		setMessage(dashboardMessage, 'Signing out…');
		try {
			const { error } = await supabaseClient.auth.signOut();
			if (error) throw error;
			setMessage(dashboardMessage, '');
		} catch (error) {
			showError(dashboardMessage, 'Could not sign out', error);
		}
	});

	const roomFloor = document.querySelector('#room-form [name="floor_level"]');
	const roomRent = document.querySelector('#room-form [name="rent_amount"]');
	const roomType = document.querySelector('#room-form [name="room_type"]');
	const roomCapacity = document.querySelector('#room-form [name="capacity"]');
	function updateRoomRate() {
		const isDouble = roomCapacity.value === '2';
		const firstFloorOption = roomFloor.querySelector('option[value="first"]');
		firstFloorOption.disabled = isDouble;
		if (isDouble) {
			roomFloor.value = 'ground';
			document.querySelector('#room-form [name="side_row"]').value = '';
			document.querySelector('#room-form [name="room_position"]').value = '';
		}
		roomRent.value = isDouble ? '5500' : roomFloor.value === 'first' ? '8000' : '7000';
	}
	roomFloor.addEventListener('change', updateRoomRate);
	roomCapacity.addEventListener('change', () => {
		roomType.value = roomCapacity.value === '2'
			? 'Double room · two separate beds, no bunks, private toilet, bath & kitchen'
			: 'Single room · private toilet, bath & kitchen';
		updateRoomRate();
	});
	roomType.addEventListener('change', () => {
		roomCapacity.value = roomType.value.startsWith('Double room') ? '2' : '1';
		updateRoomRate();
	});

	document.querySelectorAll('.record-form').forEach(form => {
		form.addEventListener('submit', async event => {
			event.preventDefault();
			const formData = new FormData(form);
			const values = Object.fromEntries(formData.entries());
			let table;
			let row;
			switch (form.id) {
				case 'guest-form':
					table = 'guests';
					row = {
						full_name: values.full_name.trim(),
						email: values.email.trim() || null,
						phone: values.phone.trim() || null,
						nationality: values.nationality.trim() || null,
						notes: values.notes.trim() || null
					};
					break;
				case 'room-form':
					table = 'rooms';
					row = {
						name: values.name.trim(),
						floor_level: values.floor_level,
						side_row: values.side_row ? Number(values.side_row) : null,
						room_position: values.room_position ? Number(values.room_position) : null,
						room_type: values.room_type.trim(),
						capacity: Number(values.capacity),
						rent_amount: Number(values.rent_amount),
						currency: 'GHS',
						rate_period: 'academic_year',
						status: values.status
					};
					if (row.capacity === 1 && (!row.side_row || !row.room_position)) {
						setMessage(dashboardMessage, 'Single rooms need a row and position in the 16-room floor layout.', 'error');
						return;
					}
					if (row.capacity === 2 && (row.floor_level !== 'ground' || row.side_row || row.room_position)) {
						setMessage(dashboardMessage, 'Additional double rooms are on the ground floor and outside the 16-room single-room layout.', 'error');
						return;
					}
					break;
				case 'booking-form':
					table = 'bookings';
					const selectedBed = latestBeds.find(bed => bed.id === values.bed_id);
					if (!selectedBed) {
						setMessage(dashboardMessage, 'Select an available room before saving this booking.', 'error');
						return;
					}
					row = {
						guest_id: values.guest_id,
						bed_id: values.bed_id,
						check_in: values.check_in,
						check_out: values.check_out,
						rate_amount: Number(selectedBed.rooms.rent_amount),
						currency: selectedBed.rooms.currency,
						rate_period: selectedBed.rooms.rate_period,
						status: values.status
					};
					if (row.check_out <= row.check_in) {
						setMessage(dashboardMessage, 'Check-out must be after check-in.', 'error');
						return;
					}
					if (row.check_out > dateAfterMonths(row.check_in, 8)) {
						setMessage(dashboardMessage, 'The maximum stay is 8 calendar months.', 'error');
						return;
					}
					break;
				case 'payment-form':
					table = 'payments';
					row = {
						booking_id: values.booking_id,
						amount: Number(values.amount),
						currency: values.currency.trim().toUpperCase(),
						method: values.method,
						status: values.status,
						paid_at: values.paid_at
					};
					break;
				case 'expense-form':
					table = 'expenses';
					row = {
						category: values.category.trim(),
						amount: Number(values.amount),
						currency: values.currency.trim().toUpperCase(),
						incurred_on: values.incurred_on,
						vendor: values.vendor.trim() || null,
						description: values.description.trim() || null
					};
					break;
				default:
					return;
			}

			setMessage(dashboardMessage, 'Saving record…');
			try {
				const { error } = await supabaseClient.from(table).insert(row);
				if (error) throw error;
				form.reset();
				if (form.id === 'room-form') updateRoomRate();
				setMessage(dashboardMessage, 'Record saved.', 'success');
				await refreshDashboard();
			} catch (error) {
				showError(dashboardMessage, 'Could not save record', error);
			}
		});
	});

	function dateAfterMonths(isoDate, months) {
		const [year, month, day] = isoDate.split('-').map(Number);
		const targetFirst = new Date(year, month - 1 + months, 1, 12);
		const lastDay = new Date(targetFirst.getFullYear(), targetFirst.getMonth() + 1, 0).getDate();
		targetFirst.setDate(Math.min(day, lastDay));
		return [
			targetFirst.getFullYear(),
			String(targetFirst.getMonth() + 1).padStart(2, '0'),
			String(targetFirst.getDate()).padStart(2, '0')
		].join('-');
	}

	const bookingCheckIn = document.querySelector('#booking-form [name="check_in"]');
	const bookingCheckOut = document.querySelector('#booking-form [name="check_out"]');
	function updateBookingDateLimits() {
		if (!bookingCheckIn.value) {
			bookingCheckOut.removeAttribute('min');
			bookingCheckOut.removeAttribute('max');
			updateRecordSelects();
			return;
		}
		const [year, month, day] = bookingCheckIn.value.split('-').map(Number);
		const next = new Date(year, month - 1, day + 1, 12);
		const tomorrow = [
			next.getFullYear(),
			String(next.getMonth() + 1).padStart(2, '0'),
			String(next.getDate()).padStart(2, '0')
		].join('-');
		bookingCheckOut.min = tomorrow;
		bookingCheckOut.max = dateAfterMonths(bookingCheckIn.value, 8);
		if (bookingCheckOut.value && (bookingCheckOut.value < tomorrow || bookingCheckOut.value > bookingCheckOut.max)) {
			bookingCheckOut.value = '';
		}
		updateRecordSelects();
	}
	bookingCheckIn.addEventListener('change', updateBookingDateLimits);
	bookingCheckOut.addEventListener('change', updateRecordSelects);
	document.querySelector('#booking-form [name="bed_id"]').addEventListener('change', updateBookingRate);

	reportPeriod.addEventListener('change', () => {
		loadReport().catch(error => showError(dashboardMessage, 'Could not update report', error));
	});
	reportCurrency.addEventListener('change', () => {
		loadReport().catch(error => showError(dashboardMessage, 'Could not update report', error));
	});

	window.setInterval(() => {
		if (!workspace.hidden && !document.hidden) {
			loadAvailability().catch(error => showError(dashboardMessage, 'Could not update live availability', error));
		}
	}, 60000);

	async function start() {
		showPanels({ setup: true });
		try {
			const sharedConfig = window.FRANCEE_SUPABASE_CONFIG;
			if (
				sharedConfig &&
				typeof sharedConfig.url === 'string' &&
				typeof sharedConfig.key === 'string' &&
				sharedConfig.url.trim() &&
				sharedConfig.key.trim()
			) {
				startClient({
					url: sharedConfig.url.trim().replace(/\/+$/, ''),
					key: sharedConfig.key.trim()
				});
				return;
			}
			const saved = localStorage.getItem(CONFIG_KEY);
			if (!saved) {
				setMessage(setupMessage, 'Set up a Supabase project and apply supabase-schema.sql before connecting.');
				return;
			}
			const config = JSON.parse(saved);
			if (typeof config.url !== 'string' || typeof config.key !== 'string') {
				throw new Error('Saved project settings are invalid. Re-enter them below.');
			}
			startClient(config);
		} catch (error) {
			showPanels({ setup: true });
			showError(setupMessage, 'Could not read project settings', error);
		}
	}

	start();
}());
