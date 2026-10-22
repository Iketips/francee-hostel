(function () {
	'use strict';

	const rooms = [
		{
			name: 'Ground-floor single room',
			type: 'Ground-floor single room',
			floor: 'Ground floor',
			price: 'GHS 7,000',
			capacity: 1,
			image: 'photo-1566665797739-1674de7a421a',
			features: ['One person', 'Regular bed · no bunks', 'Private toilet & bath', 'Private kitchen']
		},
		{
			name: 'First-floor single room',
			type: 'First-floor single room',
			floor: 'First floor',
			price: 'GHS 8,000',
			capacity: 1,
			image: 'photo-1611892440504-42a792e24d32',
			features: ['One person', 'Regular bed · no bunks', 'Private toilet & bath', 'Private kitchen']
		},
		{
			name: 'Ground-floor double room',
			type: 'Ground-floor double room',
			floor: 'Ground floor',
			price: 'GHS 5,500',
			capacity: 2,
			image: 'photo-1616594039964-ae9021a400a0',
			features: ['One or two people', 'Two regular beds · no bunks', 'Private toilet & bath', 'Private kitchen']
		}
	];
	const roomGrid = document.getElementById('student-room-grid');
	const requestDialog = document.getElementById('request-dialog');
	const requestForm = document.getElementById('room-request-form');
	const requestStatus = document.getElementById('request-status');
	const checkIn = document.getElementById('request-checkin');
	const checkOut = document.getElementById('request-checkout');
	const guests = document.getElementById('request-guests');
	const issueForm = document.getElementById('room-issue-form');
	const issueStatus = document.getElementById('issue-status');
	const signupForm = document.getElementById('student-signup-form');
	const signinForm = document.getElementById('student-signin-form');
	const accountForms = document.getElementById('student-account-forms');
	const accountLabel = document.getElementById('student-account-session-label');
	const signoutButton = document.getElementById('student-signout');
	let selectedRoom;
	let statusLoading = false;
	let carouselIndex = 0;
	let carouselTimer;
	let authSubscription;

	const carouselSlides = [
		{
			src: 'https://images.unsplash.com/photo-1566665797739-1674de7a421a?auto=format&fit=crop&w=1600&q=85',
			alt: 'Private ground-floor hostel bedroom with a regular bed',
			caption: 'Private ground-floor room'
		},
		{
			src: 'https://images.unsplash.com/photo-1611892440504-42a792e24d32?auto=format&fit=crop&w=1600&q=85',
			alt: 'Bright first-floor hostel bedroom with a regular bed',
			caption: 'Comfortable first-floor room'
		},
		{
			src: 'https://images.unsplash.com/photo-1616594039964-ae9021a400a0?auto=format&fit=crop&w=1600&q=85',
			alt: 'Shared double hostel room with two regular beds',
			caption: 'A room for two, without bunks'
		}
	];

	function renderCarousel() {
		const slide = carouselSlides[carouselIndex];
		const image = document.getElementById('student-carousel-image');
		image.src = slide.src;
		image.alt = slide.alt;
		image.classList.remove('photo-change');
		window.requestAnimationFrame(() => image.classList.add('photo-change'));
		document.getElementById('student-carousel-caption').textContent = slide.caption;
		document.getElementById('student-carousel-count').textContent =
			'Photo ' + (carouselIndex + 1) + ' of ' + carouselSlides.length;
		document.querySelectorAll('.student-carousel-dot').forEach((button, index) => {
			const active = index === carouselIndex;
			button.classList.toggle('active', active);
			button.setAttribute('aria-current', active ? 'true' : 'false');
			button.setAttribute('aria-label', 'Show photo ' + (index + 1) + ': ' + carouselSlides[index].caption);
		});
	}

	function moveCarousel(offset) {
		carouselIndex = (carouselIndex + offset + carouselSlides.length) % carouselSlides.length;
		renderCarousel();
	}

	function startCarousel() {
		window.clearInterval(carouselTimer);
		if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
			carouselTimer = window.setInterval(() => moveCarousel(1), 6000);
		}
	}

	function setAccountStatus(id, message, kind) {
		const status = document.getElementById(id);
		status.textContent = message || '';
		status.className = 'student-account-status' + (kind ? ' ' + kind : '');
	}

	function renderStudentSession(session) {
		const signedIn = Boolean(session);
		accountForms.hidden = signedIn;
		signoutButton.hidden = !signedIn;
		accountLabel.textContent = signedIn
			? 'Signed in as ' + session.user.email
			: 'You are browsing as a guest. Student accounts are optional.';
		if (signedIn) {
			setAccountStatus('signup-status', '', '');
			setAccountStatus('signin-status', '', '');
		} else if (authSubscription) {
			setAccountStatus('signup-status', '', '');
		}
	}

	async function initializeStudentAuth() {
		try {
			if (!window.FranCeeHostel) {
				throw new Error('The online account service is unavailable. You can continue as a guest.');
			}
			authSubscription = window.FranCeeHostel.onStudentAuthStateChange(renderStudentSession);
			renderStudentSession(await window.FranCeeHostel.getStudentSession());
		} catch (error) {
			accountLabel.textContent = 'Student accounts are unavailable right now. Guest access remains available.';
			setAccountStatus('signup-status', error.message, 'error');
			setAccountStatus('signin-status', error.message, 'error');
		}
	}

	signupForm.addEventListener('submit', async event => {
		event.preventDefault();
		if (!signupForm.reportValidity()) return;
		const button = signupForm.querySelector('button[type="submit"]');
		button.disabled = true;
		setAccountStatus('signup-status', 'Creating your student account…');
		try {
			const result = await window.FranCeeHostel.signUpStudent({
				fullName: signupForm.elements.full_name.value.trim(),
				email: signupForm.elements.email.value.trim(),
				password: signupForm.elements.password.value
			});
			if (result.session) {
				renderStudentSession(result.session);
				signupForm.reset();
				setAccountStatus('signup-status', 'Your account was created and you are signed in.', 'success');
			} else {
				setAccountStatus(
					'signup-status',
					'Account created. Check your email to confirm it, then sign in here.',
					'success'
				);
				signupForm.reset();
			}
		} catch (error) {
			setAccountStatus('signup-status', error.message || 'Could not create your account.', 'error');
		} finally {
			button.disabled = false;
		}
	});

	signinForm.addEventListener('submit', async event => {
		event.preventDefault();
		if (!signinForm.reportValidity()) return;
		const button = signinForm.querySelector('button[type="submit"]');
		button.disabled = true;
		setAccountStatus('signin-status', 'Signing in…');
		try {
			const result = await window.FranCeeHostel.signInStudent({
				email: signinForm.elements.email.value.trim(),
				password: signinForm.elements.password.value
			});
			renderStudentSession(result.session);
			signinForm.reset();
		} catch (error) {
			setAccountStatus('signin-status', error.message || 'Could not sign in.', 'error');
		} finally {
			button.disabled = false;
		}
	});

	signoutButton.addEventListener('click', async () => {
		signoutButton.disabled = true;
		try {
			await window.FranCeeHostel.signOutStudent();
			renderStudentSession(null);
			setAccountStatus('signin-status', 'You have signed out.', 'success');
		} catch (error) {
			setAccountStatus('signin-status', error.message || 'Could not sign out.', 'error');
		} finally {
			signoutButton.disabled = false;
		}
	});

	function dateValue(date) {
		const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
		return local.toISOString().slice(0, 10);
	}

	function addMonths(date, months) {
		const result = new Date(date);
		const day = result.getDate();
		result.setDate(1);
		result.setMonth(result.getMonth() + months);
		result.setDate(Math.min(day, new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate()));
		return result;
	}

	function renderRooms(status) {
		const availability = new Map(
			(status && Array.isArray(status.room_types) ? status.room_types : [])
				.map(item => [item.room_name, Number(item.available)])
		);
		roomGrid.replaceChildren();
		rooms.forEach(room => {
			const card = document.createElement('article');
			card.className = 'student-room-card';
			const photo = document.createElement('div');
			photo.className = 'student-room-photo';
			photo.setAttribute('role', 'img');
			photo.setAttribute('aria-label', room.floor + ' hostel room');
			photo.style.backgroundImage = 'url("https://images.unsplash.com/' + room.image + '?auto=format&fit=crop&w=900&q=80")';
			const content = document.createElement('div');
			content.className = 'student-room-info';
			const title = document.createElement('h3');
			title.textContent = room.name;
			const price = document.createElement('div');
			price.className = 'student-room-price';
			price.textContent = room.price;
			const priceNote = document.createElement('small');
			priceNote.textContent = 'per person · full academic year';
			price.append(priceNote);
			const description = document.createElement('p');
			description.textContent = room.floor + ' · Private toilet, bath, and kitchen.';
			const features = document.createElement('ul');
			room.features.forEach(feature => {
				const item = document.createElement('li');
				item.textContent = feature;
				features.append(item);
			});
			const count = document.createElement('p');
			count.className = 'student-room-count';
			const available = availability.get(room.type);
			count.textContent = available === undefined
				? 'Checking live availability…'
				: available + (available === 1 ? ' room available today' : ' rooms available today');
			const button = document.createElement('button');
			button.type = 'button';
			button.className = 'student-book';
			button.dataset.room = room.name;
			button.textContent = 'Request this room';
			content.append(title, price, description, features, count, button);
			card.append(photo, content);
			roomGrid.append(card);
		});
	}

	function setStat(id, value) {
		document.getElementById(id).textContent = String(value);
	}

	function renderAvailability(status) {
		const totalRooms = Number(status.total_rooms);
		const roomsRemaining = Number(status.rooms_remaining);
		const occupiedRooms = Number(status.rooms_occupied);
		const bedsRemaining = Number(status.beds_remaining);
		if (![totalRooms, roomsRemaining, occupiedRooms, bedsRemaining, Number(status.people_accommodated)].every(Number.isInteger)) {
			throw new Error('The live availability data is incomplete.');
		}
		setStat('people-accommodated', status.people_accommodated);
		setStat('rooms-remaining', roomsRemaining);
		setStat('total-rooms', totalRooms);
		setStat('beds-remaining', bedsRemaining);
		const occupiedPercent = totalRooms ? Math.min(100, occupiedRooms / totalRooms * 100) : 0;
		document.getElementById('student-chart-occupied').style.flex = '0 0 ' + occupiedPercent + '%';
		document.getElementById('student-chart-available').style.flex = '0 0 ' + (100 - occupiedPercent) + '%';
		document.getElementById('availability-caption').textContent =
			occupiedRooms + ' of ' + totalRooms + ' active rooms occupied or reserved today. Updated ' +
			new Date().toLocaleTimeString() + '.';
		document.getElementById('availability-caption').classList.remove('student-request-error');
		const typeList = document.getElementById('room-type-availability');
		typeList.replaceChildren();
		(status.room_types || []).forEach(type => {
			const item = document.createElement('span');
			item.textContent = type.room_name + ': ' + type.available + ' of ' + type.total + ' available today';
			typeList.append(item);
		});
		renderRooms(status);
	}

	async function refreshAvailability() {
		if (statusLoading) return;
		statusLoading = true;
		const caption = document.getElementById('availability-caption');
		const button = document.getElementById('refresh-availability');
		button.disabled = true;
		try {
			if (!window.FranCeeHostel || typeof window.FranCeeHostel.getStatus !== 'function') {
				throw new Error('The shared availability service is unavailable. Please contact hostel staff.');
			}
			renderAvailability(await window.FranCeeHostel.getStatus());
		} catch (error) {
			caption.textContent = error.message || 'Could not load live availability. Try refreshing.';
			caption.classList.add('student-request-error');
		} finally {
			button.disabled = false;
			statusLoading = false;
		}
	}

	function updateDateLimits() {
		checkIn.min = dateValue(new Date());
		if (!checkIn.value) {
			checkOut.min = dateValue(new Date(Date.now() + 86400000));
			checkOut.removeAttribute('max');
			return;
		}
		const start = new Date(checkIn.value + 'T12:00:00');
		const next = new Date(start);
		next.setDate(next.getDate() + 1);
		checkOut.min = dateValue(next);
		checkOut.max = dateValue(addMonths(start, 8));
		if (checkOut.value && (checkOut.value < checkOut.min || checkOut.value > checkOut.max)) {
			checkOut.value = '';
		}
	}

	function populateIssueRooms() {
		const select = document.getElementById('issue-room');
		for (let floorIndex = 0; floorIndex < 2; floorIndex += 1) {
			const prefix = floorIndex === 0 ? 'GF' : 'FF';
			const group = document.createElement('optgroup');
			group.label = floorIndex === 0 ? 'Ground floor' : 'First floor';
			for (let index = 1; index <= 16; index += 1) {
				const roomNumber = prefix + '-' + String(index).padStart(2, '0');
				const option = document.createElement('option');
				option.value = roomNumber;
				option.textContent = roomNumber;
				group.append(option);
			}
			select.append(group);
		}
		const doubleRoom = document.createElement('option');
		doubleRoom.value = 'GF-D01';
		doubleRoom.textContent = 'GF-D01 · ground-floor double room';
		select.append(doubleRoom);
	}

	roomGrid.addEventListener('click', event => {
		const button = event.target.closest('.student-book');
		if (!button) return;
		selectedRoom = rooms.find(room => room.name === button.dataset.room);
		if (!selectedRoom) return;
		requestForm.reset();
		requestStatus.textContent = '';
		requestStatus.className = 'student-request-status';
		document.getElementById('request-title').textContent = 'Request a ' + selectedRoom.name.toLowerCase();
		document.getElementById('request-room-summary').textContent =
			selectedRoom.name + ' · ' + selectedRoom.price + ' per person for the full academic year';
		guests.replaceChildren();
		for (let index = 1; index <= selectedRoom.capacity; index += 1) {
			const option = document.createElement('option');
			option.value = String(index);
			option.textContent = index + (index === 1 ? ' person' : ' people');
			guests.append(option);
		}
		updateDateLimits();
		requestDialog.showModal();
	});

	document.getElementById('request-close').addEventListener('click', () => requestDialog.close());
	requestDialog.addEventListener('close', () => {
		requestForm.reset();
		requestStatus.textContent = '';
	});
	checkIn.addEventListener('change', updateDateLimits);
	document.getElementById('refresh-availability').addEventListener('click', refreshAvailability);
	document.addEventListener('visibilitychange', () => {
		if (!document.hidden) refreshAvailability();
	});

	const carousel = document.querySelector('.student-carousel');
	const carouselDots = document.getElementById('student-carousel-dots');
	carouselSlides.forEach((slide, index) => {
		const button = document.createElement('button');
		button.type = 'button';
		button.className = 'student-carousel-dot';
		button.addEventListener('click', () => {
			carouselIndex = index;
			renderCarousel();
			startCarousel();
		});
		carouselDots.append(button);
	});
	document.getElementById('student-carousel-previous').addEventListener('click', () => {
		moveCarousel(-1);
		startCarousel();
	});
	document.getElementById('student-carousel-next').addEventListener('click', () => {
		moveCarousel(1);
		startCarousel();
	});
	carousel.addEventListener('mouseenter', () => window.clearInterval(carouselTimer));
	carousel.addEventListener('mouseleave', startCarousel);
	carousel.addEventListener('focusin', () => window.clearInterval(carouselTimer));
	carousel.addEventListener('focusout', event => {
		if (!carousel.contains(event.relatedTarget)) startCarousel();
	});

	requestForm.addEventListener('submit', async event => {
		event.preventDefault();
		if (!selectedRoom || !requestForm.reportValidity()) return;
		const file = document.getElementById('request-identity').files[0];
		if (!file || !['image/jpeg', 'image/png', 'application/pdf'].includes(file.type) || file.size > 5 * 1024 * 1024) {
			requestStatus.textContent = 'Choose a JPG, PNG, or PDF identity document no larger than 5 MB.';
			requestStatus.className = 'student-request-status error';
			return;
		}
		if (
			checkOut.value <= checkIn.value ||
			checkOut.value > dateValue(addMonths(new Date(checkIn.value + 'T12:00:00'), 8))
		) {
			requestStatus.textContent = 'Choose a check-out date after check-in and within the 8-month stay limit.';
			requestStatus.className = 'student-request-status error';
			return;
		}
		if (requestForm.elements.website.value) {
			requestDialog.close();
			return;
		}
		const submitButton = document.getElementById('request-submit');
		submitButton.disabled = true;
		requestStatus.textContent = 'Sending your request securely…';
		requestStatus.className = 'student-request-status';
		try {
			const result = await window.FranCeeHostel.submitRequest({
				full_name: requestForm.elements.full_name.value.trim(),
				phone: requestForm.elements.phone.value.trim(),
				email: requestForm.elements.email.value.trim(),
				room_name: selectedRoom.name,
				guest_count: Number(guests.value),
				check_in: checkIn.value,
				check_out: checkOut.value,
				identity: file
			});
			requestStatus.textContent = 'Your request was sent to FranCee Hostel staff. Reference: ' + result.id;
			requestStatus.className = 'student-request-status success';
			requestForm.reset();
			refreshAvailability();
			setTimeout(() => requestDialog.close(), 3500);
		} catch (error) {
			requestStatus.textContent = error.message || 'Your request could not be sent. Please try again.';
			requestStatus.className = 'student-request-status error';
		} finally {
			submitButton.disabled = false;
		}
	});

	issueForm.addEventListener('submit', async event => {
		event.preventDefault();
		if (!issueForm.reportValidity()) return;
		if (issueForm.elements.website.value) {
			issueForm.reset();
			return;
		}
		const submitButton = document.getElementById('issue-submit');
		submitButton.disabled = true;
		issueStatus.textContent = 'Sending your issue to hostel staff…';
		issueStatus.className = 'student-issue-status';
		try {
			const result = await window.FranCeeHostel.submitIssue({
				room_name: issueForm.elements.room_name.value,
				category: issueForm.elements.category.value,
				priority: issueForm.elements.priority.value,
				student_name: issueForm.elements.student_name.value.trim(),
				phone: issueForm.elements.phone.value.trim(),
				description: issueForm.elements.description.value.trim()
			});
			issueStatus.textContent = 'Your issue was sent to the hostel admin. Reference: ' + result.id;
			issueStatus.className = 'student-issue-status success';
			issueForm.reset();
		} catch (error) {
			issueStatus.textContent = error.message || 'Your issue could not be sent. Please try again.';
			issueStatus.className = 'student-issue-status error';
		} finally {
			submitButton.disabled = false;
		}
	});

	populateIssueRooms();
	renderCarousel();
	startCarousel();
	initializeStudentAuth();
	renderRooms();
	refreshAvailability();
	window.setInterval(refreshAvailability, 60000);
}());
