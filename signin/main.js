document.addEventListener('DOMContentLoaded', () => {
	const API_BASE = "http://fizzle-backend-production.up.railway.app:5000";

	const form = document.getElementById('signin');
	const submitBtn = document.getElementById('submitBtn');
	const fields = {
		email: document.getElementById('email'),
		password: document.getElementById('password')
	};

	// If already remembered on the backend, skip signin page and go to main
	(async function checkRemembered(){
		try{
			console.log('signin: checking remembered session...', {api: API_BASE + '/api/current'});
			const res = await fetch(API_BASE + '/api/current', {credentials:'include'});
			const data = await res.json().catch(()=>({}));
			console.log('signin: /api/current response', data, 'document.cookie=', document.cookie, 'localStorage.fizzle_current=', localStorage.getItem('fizzle_current'));
			if (data && data.user){
				// prompt before redirect so we can capture logs in-browser
				if (confirm('You appear to be signed in. Go to main page?')){
					window.location.href = '../';
				}
			}
		}catch(e){ /* ignore */ }
	})();

	// Toggle password visibility
	document.querySelectorAll('.toggle-password').forEach(btn => {
		btn.addEventListener('click', (e) => {
			const parent = e.target.closest('.field');
			if (!parent) return;
			const input = parent.querySelector('input[type="password"], input[type="text"]');
			if (!input) return;
			if (input.type === 'password'){
				input.type = 'text';
				e.target.textContent = 'Hide';
			} else {
				input.type = 'password';
				e.target.textContent = 'Show';
			}
		});
	});

	function showError(id, message){
		const el = document.getElementById(id + '-error');
		if(el) el.textContent = message || '';
	}

	function validate(){
		let ok = true;
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((fields.email.value || '').trim())){
			showError('email','Please enter a valid email address'); ok=false;
		} else showError('email','');

		if ((fields.password.value || '').length < 8){
			showError('password','Password must be at least 8 characters'); ok=false;
		} else showError('password','');

		submitBtn.disabled = !ok;
		return ok;
	}

	// Live validation
	Object.values(fields).forEach(f => {
		if (!f) return;
		f.addEventListener('input', validate);
		if (f.type === 'checkbox') f.addEventListener('change', validate);
	});

	form.addEventListener('submit', (e) => {
		e.preventDefault();
		if (!validate()) return;

		submitBtn.disabled = true;
		submitBtn.textContent = 'Signing in...';

		const payload = {
			email: (fields.email.value || '').trim(),
			password: fields.password.value
		};

		console.log('Signing in to', API_BASE + '/api/signin', payload.email);

		fetch(API_BASE + '/api/signin', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			credentials: 'include',
			body: JSON.stringify(payload)
		})
		.then(async res => {
			let data = {};
			try { data = await res.json(); } catch (e) {}
			if (!res.ok) {
				if (data && data.errors) {
					Object.entries(data.errors).forEach(([k, v]) => showError(k, v));
				} else {
					alert(data.message || 'Sign-in failed');
				}
				return;
			}
			// store temporary session so frontend can show UI immediately if cookie isn't yet available
			try{ if (data && data.user) localStorage.setItem('fizzle_current', JSON.stringify(data.user)); else localStorage.setItem('fizzle_current', JSON.stringify({email: payload.email})); }catch(e){}
			// Redirect to main page to show the message app
			window.location.href = '../';
		})
		.catch(err => {
			alert('Network error: ' + (err && err.message ? err.message : err));
		})
		.finally(() => {
			submitBtn.textContent = 'Sign in';
			submitBtn.disabled = false;
		});
	});

	// initial validation state
	validate();
});
