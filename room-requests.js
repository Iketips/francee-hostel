(function () {
	'use strict';

	const CONFIG_KEY = 'staykind.supabase.config';
	let supabaseClient;

	function createClient(config) {
		const parsedUrl = new URL(config.url);
		if ((parsedUrl.protocol !== 'https:' && parsedUrl.hostname !== 'localhost') || !config.key) {
			throw new Error('Use an HTTPS Supabase project URL and its publishable/anon key.');
		}
		supabaseClient = window.supabase.createClient(
			parsedUrl.toString().replace(/\/+$/, ''),
			config.key,
			{ auth: { storageKey: 'francee.student.auth' } }
		);
		return supabaseClient;
	}

	function client() {
		if (supabaseClient) return supabaseClient;
		if (!window.supabase || typeof window.supabase.createClient !== 'function') {
			throw new Error('The shared hostel service is unavailable. Please try again later.');
		}
		const shared = window.FRANCEE_SUPABASE_CONFIG;
		if (
			shared &&
			typeof shared.url === 'string' &&
			typeof shared.key === 'string' &&
			shared.url.trim() &&
			shared.key.trim()
		) {
			return createClient({
				url: shared.url.trim(),
				key: shared.key.trim()
			});
		}
		const saved = localStorage.getItem(CONFIG_KEY);
		if (!saved) throw new Error('The online request service is not connected yet. Please contact hostel staff.');
		const config = JSON.parse(saved);
		return createClient(config);
	}

	async function getStatus() {
		const { data, error } = await client().rpc('get_public_hostel_status');
		if (error) throw new Error('Could not load live hostel availability. ' + error.message);
		if (
			!data ||
			!Number.isInteger(Number(data.total_rooms)) ||
			!Number.isInteger(Number(data.rooms_remaining)) ||
			!Number.isInteger(Number(data.people_accommodated)) ||
			!Number.isInteger(Number(data.rooms_occupied)) ||
			!Number.isInteger(Number(data.beds_remaining)) ||
			!Array.isArray(data.room_types)
		) {
			throw new Error('The live hostel availability response is invalid.');
		}
		return data;
	}

	async function submitRequest(details) {
		const supabaseClient = client();
		const id = crypto.randomUUID();
		const identityPath = id + '/identity';
		const { error: requestError } = await supabaseClient.from('room_requests').insert({
			id: id,
			full_name: details.full_name,
			phone: details.phone,
			email: details.email || null,
			room_name: details.room_name,
			guest_count: details.guest_count,
			check_in: details.check_in,
			check_out: details.check_out,
			identity_path: identityPath,
			status: 'identity_pending'
		});
		if (requestError) {
			throw new Error('The request could not be saved. No request was submitted. ' + requestError.message);
		}
		const { error: uploadError } = await supabaseClient.storage
			.from('room-request-identities')
			.upload(identityPath, details.identity, {
				contentType: details.identity.type,
				upsert: false
			});
		if (uploadError) {
			throw new Error('The request record was saved, but the identity upload failed. Contact hostel staff and quote reference ' + id + '.');
		}
		const { error: completionError } = await supabaseClient.rpc('complete_room_request', {
			request_id: id
		});
		if (completionError) {
			throw new Error('The identity document was uploaded, but final confirmation failed. Contact hostel staff and quote reference ' + id + '.');
		}
		return { id: id };
	}

	async function submitIssue(issue) {
		const id = crypto.randomUUID();
		const { error } = await client()
			.from('room_issues')
			.insert({
				id: id,
				room_name: issue.room_name,
				category: issue.category,
				priority: issue.priority,
				student_name: issue.student_name,
				phone: issue.phone,
				description: issue.description,
				status: 'open'
			});
		if (error) {
			throw new Error('The issue could not be sent. Please try again or contact hostel staff. ' + error.message);
		}
		return { id: id };
	}

	async function getStudentSession() {
		const { data, error } = await client().auth.getSession();
		if (error) throw new Error('Could not check your student account. ' + error.message);
		return data.session;
	}

	async function signUpStudent({ fullName, email, password }) {
		const { data, error } = await client().auth.signUp({
			email: email,
			password: password,
			options: {
				data: { full_name: fullName }
			}
		});
		if (error) throw new Error(error.message);
		return data;
	}

	async function signInStudent({ email, password }) {
		const { data, error } = await client().auth.signInWithPassword({
			email: email,
			password: password
		});
		if (error) throw new Error(error.message);
		return data;
	}

	async function signOutStudent() {
		const { error } = await client().auth.signOut();
		if (error) throw new Error(error.message);
	}

	function onStudentAuthStateChange(callback) {
		const { data } = client().auth.onAuthStateChange((_event, session) => {
			callback(session);
		});
		return data.subscription;
	}

	window.FranCeeHostel = {
		getStatus: getStatus,
		submitRequest: submitRequest,
		submitIssue: submitIssue,
		getStudentSession: getStudentSession,
		signUpStudent: signUpStudent,
		signInStudent: signInStudent,
		signOutStudent: signOutStudent,
		onStudentAuthStateChange: onStudentAuthStateChange
	};
}());
