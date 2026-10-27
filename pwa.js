(() => {
	const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
	const installButton = document.createElement('button');
	const status = document.createElement('div');
	let installPrompt = null;
	let statusTimer;

	installButton.className = 'pwa-install-button';
	installButton.type = 'button';
	installButton.textContent = 'Install app';
	installButton.setAttribute('aria-label', 'Install FranCee Hostel app');
	installButton.hidden = isStandalone;

	status.className = 'pwa-install-status';
	status.setAttribute('role', 'status');
	status.setAttribute('aria-live', 'polite');
	status.hidden = true;

	document.body.append(installButton, status);

	function showStatus(message) {
		window.clearTimeout(statusTimer);
		status.textContent = message;
		status.hidden = false;
		statusTimer = window.setTimeout(() => {
			status.hidden = true;
		}, 9000);
	}

	window.addEventListener('beforeinstallprompt', event => {
		event.preventDefault();
		installPrompt = event;
	});

	window.addEventListener('appinstalled', () => {
		installPrompt = null;
		installButton.hidden = true;
		showStatus('FranCee Hostel is installed on this device.');
	});

	installButton.addEventListener('click', async () => {
		if (!installPrompt) {
			showStatus('To install, open your browser menu and choose “Install app” or “Add to Home Screen”.');
			return;
		}

		installButton.disabled = true;
		try {
			await installPrompt.prompt();
			const choice = await installPrompt.userChoice;
			if (choice.outcome === 'accepted') installButton.hidden = true;
			installPrompt = null;
		} catch (error) {
			console.error('Could not open the app install prompt.', error);
			showStatus('The install prompt could not be opened. Try your browser menu instead.');
		} finally {
			installButton.disabled = false;
		}
	});

	if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
		window.addEventListener('load', () => {
			navigator.serviceWorker.register('./sw.js')
				.catch(error => console.error('FranCee Hostel offline support could not be enabled.', error));
		});
	}
})();
