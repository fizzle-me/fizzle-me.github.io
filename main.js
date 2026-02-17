document.addEventListener('DOMContentLoaded', () => {
	const API_BASE = "https://fizzle-backend.up.railway.app:8080";

	const landing = document.getElementById('landing-choices');
	const app = document.getElementById('message-app');
	const signedInAs = document.getElementById('signed-in-as');
	const messagesEl = document.getElementById('messages');
	const msgForm = document.getElementById('message-form');
	const postBtn = document.getElementById('postBtn');
	const togglePost = document.getElementById('toggle-post');
	const postPanel = document.getElementById('post-panel');
	const titleCount = document.getElementById('title-count');
	const formatToolbar = document.getElementById('format-toolbar');

	// global search implementation: fetch all messages then filter locally
	async function performSearch(query){
		if (!messagesEl) return;
		try{
			const res = await fetch(API_BASE + '/api/messages?sort=trending', { credentials: 'include' });
			const data = await res.json().catch(()=>({messages:[]}));
			const all = data.messages || [];
			const q = String(query || '').toLowerCase();
			const matches = all.filter(m => {
				if ((m.title||'').toLowerCase().includes(q)) return true;
				if ((m.body||'').toLowerCase().includes(q)) return true;
				if (Array.isArray(m.comments) && m.comments.some(c => (c.text||'').toLowerCase().includes(q))) return true;
				return false;
			});
			// render simple result list (similar structure to loadMessages but simpler)
			messagesEl.innerHTML = '';
			matches.forEach(m => {
				const score = (m.upvotes||0) - (m.downvotes||0);
				const li = document.createElement('li');
				li.className = 'field';
				li.setAttribute('data-id', String(m.id));
				li.innerHTML = `
					<div style="display:flex;gap:12px;align-items:flex-start">
						<div class="vote-box">
							<button data-id="${m.id}" class="vote-up">▲</button>
							<div class="vote-count">${score}</div>
							<button data-id="${m.id}" class="vote-down">▼</button>
						</div>
						<div class="post-content">
							<div style="display:flex;justify-content:space-between;align-items:center">
									<strong>${renderMarkdown(m.title)}</strong>
									<div class="muted small">${relativeTime(m.ts)}</div>
							</div>
								<div style="margin-top:8px" class="small-note">Comments (${(m.comments||[]).length})</div>
						</div>
					</div>
				`;
				messagesEl.appendChild(li);
				// attach vote handlers similarly
				const vb = li.querySelector('.vote-box');
				const up = vb && vb.querySelector('.vote-up');
				const down = vb && vb.querySelector('.vote-down');
				if (up){ up.addEventListener('click', async (e)=>{ e.stopPropagation(); const current = m.your_vote||0; const send = current === 1 ? 0 : 1; up.disabled = true; if (down) down.disabled = true; try{ const r = await fetch(API_BASE + '/api/messages/' + m.id + '/vote', {method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body: JSON.stringify({vote:send})}); if (!r.ok){ const d = await r.json().catch(()=>({})); alert(d.message || d.errors || 'Vote failed'); } }catch(err){ console.warn(err); } finally{ await performSearch(query); } }); }
				if (down){ down.addEventListener('click', async (e)=>{ e.stopPropagation(); const current = m.your_vote||0; const send = current === -1 ? 0 : -1; down.disabled = true; if (up) up.disabled = true; try{ const r = await fetch(API_BASE + '/api/messages/' + m.id + '/vote', {method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body: JSON.stringify({vote:send})}); if (!r.ok){ const d = await r.json().catch(()=>({})); alert(d.message || d.errors || 'Vote failed'); } }catch(err){ console.warn(err); } finally{ await performSearch(query); } }); }
				li.addEventListener('click', ()=> openPostModal(m));
			});
			if (typeof updatePageInfo === 'function') updatePageInfo(matches.length);
		}catch(err){ console.error('performSearch error', err); alert('Search failed'); }
	}

	// Global search UI (search messages and comments)
	// inserted above the messages list so it's available on all pages
	(function insertSearchUI(){
		try{
			if (!messagesEl) return;
			const searchWrap = document.createElement('div');
			searchWrap.id = 'global-search-wrap';
			searchWrap.style.display = 'flex';
			searchWrap.style.gap = '8px';
			searchWrap.style.marginBottom = '12px';
			searchWrap.innerHTML = `
				<input id="global-search-input" class="input" placeholder="Search messages and comments..." style="flex:1" />
				<button id="global-search-btn" class="primary">Search</button>
				<button id="global-search-reset" class="primary">Reset</button>
			`;
			messagesEl.parentNode.insertBefore(searchWrap, messagesEl);
			const sBtn = document.getElementById('global-search-btn');
			const rBtn = document.getElementById('global-search-reset');
			const sInput = document.getElementById('global-search-input');
			// make search buttons slightly smaller so they don't dominate UI
			if (sBtn){ sBtn.style.padding = '6px 10px'; sBtn.style.fontSize = '0.9rem'; }
			if (rBtn){ rBtn.style.padding = '6px 10px'; rBtn.style.fontSize = '0.9rem'; }
			if (sInput){ sInput.style.fontSize = '0.95rem'; }
			// make search/reset buttons match the input height
			if (sInput && sBtn){
				const h = Math.ceil(sInput.getBoundingClientRect().height);
				sBtn.style.height = h + 'px';
				if (rBtn) rBtn.style.height = h + 'px';
			}
			if (sBtn){ sBtn.addEventListener('click', ()=>{ const q = (sInput && sInput.value||'').trim(); if (q) performSearch(q); }); }
			if (rBtn){ rBtn.addEventListener('click', ()=>{ if (sInput) sInput.value = ''; loadMessages(PAGE); }); }
			if (sInput){ sInput.addEventListener('keydown', (e)=>{ if (e.key === 'Enter'){ e.preventDefault(); const q = (sInput.value||'').trim(); if (q) performSearch(q); } }); }
		}catch(e){ console.warn('insertSearchUI failed', e); }
	})();

	if (togglePost && postPanel){
		togglePost.addEventListener('click', () => {
			const open = postPanel.style.display !== 'none';
			postPanel.style.display = open ? 'none' : 'block';
			togglePost.textContent = open ? 'New post ▾' : 'New post ▴';
			if (!open){
				const titleEl = document.getElementById('message-title');
				if (titleEl) titleEl.focus();
			}
		});
	}

	// formatting toolbar
	if (formatToolbar){
		formatToolbar.addEventListener('click', (e) => {
			const btn = e.target.closest('button');
			if (!btn) return;
			const insert = btn.getAttribute('data-insert');
			const bodyEl = document.getElementById('message-body');
			if (!bodyEl) return;
			insertAtCursor(bodyEl, insert);
		});
	}

	// title character count
	const titleEl = document.getElementById('message-title');
	if (titleEl && titleCount){
		titleCount.textContent = `(0/${titleEl.maxLength||100})`;
		titleEl.addEventListener('input', ()=>{
			const len = titleEl.value.length;
			titleCount.textContent = `(${len}/${titleEl.maxLength||100})`;
		});
	}

	// body character count
	const bodyEl = document.getElementById('message-body');
	const bodyCount = document.getElementById('body-count');
	if (bodyEl && bodyCount){
		bodyCount.textContent = `(0/${bodyEl.maxLength||3000})`;
		bodyEl.addEventListener('input', ()=>{
			const len = bodyEl.value.length;
			bodyCount.textContent = `(${len}/${bodyEl.maxLength||3000})`;
		});
	}

	let CURRENT_USER = null;
	let MESSAGE_CACHE = new Map();
	let PENDING_IMAGE = null; // dataURL stored when user picks a file
	let PAGE = 0;
	const PAGE_SIZE = 50;
	let MODAL_REFRESH = null;
	// inject small helper styles for vote states and pagination
	(function injectStyles(){
		if (document.getElementById('fizzle-dynamic-styles')) return;
		const s = document.createElement('style');
		s.id = 'fizzle-dynamic-styles';
		s.textContent = `
		/* highlight individual arrows when a vote is active */
			.vote-box.voted-up .vote-up, .comment-vote-box.voted-up .comment-vote-up, #modal-vote-box.voted-up #modal-vote-up { background:#e6f7ff !important; color:#0366d6 !important; }
			.vote-box.voted-down .vote-down, .comment-vote-box.voted-down .comment-vote-down, #modal-vote-box.voted-down #modal-vote-down { background:#fff5f5 !important; color:#b91c1c !important; }
			.page-btn.page-active, button.page-active { background:var(--accent) !important; color:#fff !important; font-weight:700 !important; }
		span.page-ellipsis { padding:0 8px; color:#444; }
		#pageButtons { white-space:nowrap; overflow:hidden; }
		`;
		document.head.appendChild(s);
	})();

	function updatePageInfo(total){
		const pageInfo = document.getElementById('pageInfo');
		if (!pageInfo) return;
		const start = PAGE*PAGE_SIZE + 1;
		const end = Math.min((PAGE+1)*PAGE_SIZE, total);
		pageInfo.textContent = `${start}-${end} of ${total}`;
		const pageInfoBottom = document.getElementById('pageInfoBottom');
		if (pageInfoBottom) pageInfoBottom.textContent = `${start}-${end} of ${total}`;
		// render numeric pagination buttons
		const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
		renderPageButtons(pages);
		// hide page controls when only a single page
		const container = document.getElementById('pageButtons');
		const containerBottom = document.getElementById('pageButtonsBottom');
		if (pages <= 1){ if (container) container.style.display = 'none'; if (containerBottom) containerBottom.style.display = 'none'; }
		else { if (container) container.style.display = ''; if (containerBottom) containerBottom.style.display = ''; }
	}

	function renderPageButtons(totalPages){
		const container = document.getElementById('pageButtons');
		if (!container) return;
		container.innerHTML = '';
		const containerBottom = document.getElementById('pageButtonsBottom');
		if (containerBottom) containerBottom.innerHTML = '';
		function makeBtn(label, idx, active){
			const b = document.createElement('button');
			b.type = 'button';
			b.className = 'page-btn';
			b.style.marginRight = '6px';
			if (active) b.classList.add('page-active');
			b.textContent = label;
			b.addEventListener('click', ()=>{
				if (PAGE === idx) return;
				PAGE = idx;
				loadMessages(PAGE);
			});
			return b;
		}

		// display logic: show a few pages with ellipses when many
			if (totalPages <= 9){
				for (let i=0;i<totalPages;i++){
					const btn = makeBtn(String(i+1), i, i===PAGE);
					container.appendChild(btn);
					if (containerBottom) containerBottom.appendChild(makeBtn(String(i+1), i, i===PAGE));
				}
				return;
			}
		// always show first
			const first = makeBtn('1', 0, PAGE===0);
			container.appendChild(first);
			if (containerBottom) containerBottom.appendChild(makeBtn('1', 0, PAGE===0));
			if (PAGE > 3) container.appendChild(Object.assign(document.createElement('span'), {className:'page-ellipsis', textContent:'…'}));
		// middle window
		const start = Math.max(1, PAGE-2);
		const end = Math.min(totalPages-2, PAGE+2);
			for (let i=start;i<=end;i++){
				const btn = makeBtn(String(i+1), i, i===PAGE);
				container.appendChild(btn);
				if (containerBottom) containerBottom.appendChild(makeBtn(String(i+1), i, i===PAGE));
			}
			if (PAGE < totalPages-4) container.appendChild(Object.assign(document.createElement('span'), {className:'page-ellipsis', textContent:'…'}));
			// last
			const last = makeBtn(String(totalPages), totalPages-1, PAGE===totalPages-1);
			container.appendChild(last);
			if (containerBottom) containerBottom.appendChild(makeBtn(String(totalPages), totalPages-1, PAGE===totalPages-1));
	}

	function fmtTime(ts){
		const d = new Date(ts*1000);
		// deprecated: kept for fallback
		return d.toLocaleString();
	}

	function relativeTime(ts){
		const now = Date.now();
		const then = (ts || 0) * 1000;
		const diff = Math.floor((now - then) / 1000); // seconds
		if (diff < 5) return 'just now';
		if (diff < 60) return diff === 1 ? 'a second ago' : `${diff} seconds ago`;
		if (diff < 120) return 'a minute ago';
		if (diff < 3600) return `${Math.floor(diff/60)} minutes ago`;
		if (diff < 7200) return 'an hour ago';
		if (diff < 86400) return `${Math.floor(diff/3600)} hours ago`;
		if (diff < 172800) return 'a day ago';
		if (diff < 2592000) return `${Math.floor(diff/86400)} days ago`;
		if (diff < 31536000) return `${Math.floor(diff/2592000)} months ago`;
		return `${Math.floor(diff/31536000)} years ago`;
	}

	function updateTimeElements(){
		// update timestamp displays for currently-rendered messages using MESSAGE_CACHE
		document.querySelectorAll('.field').forEach(li => {
			const upBtn = li.querySelector('.vote-up');
			if (!upBtn) return;
			const id = upBtn.getAttribute('data-id');
			if (!id) return;
			const msg = MESSAGE_CACHE.get(String(id));
			if (!msg) return;
			const timeEl = li.querySelector('.muted.small');
			if (timeEl) timeEl.textContent = relativeTime(msg.ts);
		});
	}

	async function fetchMessageById(id){
		try{
			const sort = document.getElementById('sort-select') && document.getElementById('sort-select').value || 'trending';
			const res = await fetch(API_BASE + '/api/messages?sort=' + encodeURIComponent(sort), {credentials:'include'});
			const data = await res.json().catch(()=>({messages:[]}));
			const all = data.messages || [];
			return all.find(x => String(x.id) === String(id));
		}catch(e){
			console.warn('fetchMessageById error', e);
			return null;
		}
	}

	function renderMarkdown(raw){
		if (!raw) return '';
		let s = escapeHtml(raw);
		// links: [text](url)
		s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
		// bold **text**
		s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
		// italics *text*
		s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
		// autolink bare urls
		s = s.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
		// preserve newlines in rendered output
		s = s.replace(/\r?\n/g, '<br>');
		return s;
	}

	async function fetchCurrent(){
		try{
			console.log('Fetching current from', API_BASE + '/api/current');
			const res = await fetch(API_BASE + '/api/current', {credentials: 'include'});
			if (!res.ok){
				console.warn('fetchCurrent non-ok', res.status);
				// if unauthorized, return null; otherwise try to parse any useful body
				if (res.status === 401 || res.status === 403) return null;
				const maybe = await res.json().catch(()=>null);
				if (maybe && maybe.user) return maybe.user;
				return null;
			}
			const data = await res.json().catch(()=>null);
			console.log('Current user response', data);
			if (data && data.user) return data.user;
			// fallback: check temporary client-side session set immediately after signup/signin
			try{
				const tmp = localStorage.getItem('fizzle_current');
				if (tmp) return JSON.parse(tmp);
			}catch(e){}
			return null;
		}catch(e){
			console.error('fetchCurrent error', e);
			return null;
		}
	}

	function escapeHtml(str){
		return String(str || '').replace(/[&<>"']/g, tag => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"})[tag]);
	}

	function readFileAsDataURL(file){
		return new Promise((res, rej) => {
			const r = new FileReader();
			r.onload = () => res(r.result);
			r.onerror = rej;
			r.readAsDataURL(file);
		});
	}

	// vote state is provided by server as `your_vote` per message; do not store voter info client-side

	async function loadMessages(page, sort){
			// compatibility: loadMessages(sort) or loadMessages(page, sort)
			if (typeof page === 'string'){
				sort = page;
				page = 0;
			}
			page = Number(page) || 0;
		if (!messagesEl) return;
		// show a small loading indicator but keep existing content to avoid blink
		const loadingNote = document.createElement('li');
		loadingNote.className = 'field';
		loadingNote.id = 'loading-note';
		loadingNote.textContent = 'Loading…';
		if (!document.getElementById('loading-note')) messagesEl.appendChild(loadingNote);
		sort = sort || (document.getElementById('sort-select') && document.getElementById('sort-select').value) || 'trending';
		try{
			const res = await fetch(API_BASE + '/api/messages?sort=' + encodeURIComponent(sort), { credentials: 'include' });
			const data = await res.json();
			// remove loading note
			const ln = document.getElementById('loading-note'); if (ln) ln.remove();
			// refresh message cache and diff-update DOM to avoid blinking
			const all = data.messages || [];
			const total = all.length;
			const start = page * PAGE_SIZE;
			const slice = all.slice(start, start + PAGE_SIZE);
			// build maps of existing items
			const existing = new Map();
			Array.from(messagesEl.children).forEach(child => {
				const id = child.getAttribute && child.getAttribute('data-id');
				if (id) existing.set(id, child);
			});
			const newIds = [];
			const owned = JSON.parse(localStorage.getItem('fizzle_owned') || '[]');

			for (let idx = 0; idx < slice.length; idx++){
				const m = slice[idx];
				const id = String(m.id);
				newIds.push(id);
				MESSAGE_CACHE.set(id, m);
				const score = (m.upvotes||0) - (m.downvotes||0);
				let li = existing.get(id);
				if (li){
					// ensure data-id exists on existing element
					li.setAttribute('data-id', id);
					// rebuild vote box to ensure fresh buttons/listeners
					const vb = li.querySelector('.vote-box');
					if (vb){
						vb.innerHTML = `
							<button data-id="${m.id}" class="vote-up">▲</button>
							<div class="vote-count">${score}</div>
							<button data-id="${m.id}" class="vote-down">▼</button>
						`;
					}
					// attach vote handlers for updated node
					const voteBoxUpdated = li.querySelector('.vote-box');
					if (voteBoxUpdated){
						// ensure vote box stays at natural (left) position
						voteBoxUpdated.style.marginLeft = '';
						voteBoxUpdated.style.alignSelf = '';
						const up = voteBoxUpdated.querySelector('.vote-up');
						const down = voteBoxUpdated.querySelector('.vote-down');
						// clear classes
						voteBoxUpdated.classList.remove('voted-up','voted-down');
						if ((m.your_vote||0) === 1){ voteBoxUpdated.classList.add('voted-up'); }
						if ((m.your_vote||0) === -1){ voteBoxUpdated.classList.add('voted-down'); }
						if (up){
							up.addEventListener('click', async (e) => {
								e.stopPropagation();
								const current = m.your_vote || 0;
								const send = current === 1 ? 0 : 1;
								up.disabled = true; if (down) down.disabled = true;
								try{
									const res = await fetch(API_BASE + '/api/messages/' + m.id + '/vote', {method: 'POST', credentials: 'include', headers:{'Content-Type':'application/json'}, body: JSON.stringify({vote:send})});
									if (!res.ok){ const d = await res.json().catch(()=>({})); alert(d.message || d.errors || 'Vote failed'); }
								}catch(err){ console.warn('vote error', err); }
								await loadMessages(page);
							});
						}
						if (down){
							down.addEventListener('click', async (e) => {
								e.stopPropagation();
								const current = m.your_vote || 0;
								const send = current === -1 ? 0 : -1;
								down.disabled = true; if (up) up.disabled = true;
								try{
									const res = await fetch(API_BASE + '/api/messages/' + m.id + '/vote', {method: 'POST', credentials: 'include', headers:{'Content-Type':'application/json'}, body: JSON.stringify({vote:send})});
									if (!res.ok){ const d = await res.json().catch(()=>({})); alert(d.message || d.errors || 'Vote failed'); }
								}catch(err){ console.warn('vote error', err); }
								await loadMessages(page);
							});
						}
					}
					// update contents in-place
					const voteCount = li.querySelector('.vote-count'); if (voteCount) voteCount.textContent = score;
					const titleEl = li.querySelector('strong'); if (titleEl) titleEl.innerHTML = renderMarkdown(m.title);
					const timeEl = li.querySelector('.post-content .muted.small'); if (timeEl) timeEl.textContent = relativeTime(m.ts);
					// author text intentionally omitted (use owner highlight instead)
					const commentsEl = li.querySelector('.small-note'); if (commentsEl) commentsEl.textContent = `Comments (${(m.comments||[]).length})`;
					const imgWrap = li.querySelector('.post-image');
					if (m.image){
						if (imgWrap){ const img = imgWrap.querySelector('img'); if (img) img.src = m.image; }
						else {
							const pc = li.querySelector('.post-content');
							const div = document.createElement('div'); div.className = 'post-image'; div.innerHTML = `<img src="${m.image}" alt="post image"/>`;
							pc.insertBefore(div, pc.firstChild);
						}
					} else {
						if (imgWrap) imgWrap.remove();
					}
					if (owned.includes(m.id)) li.classList.add('owner'); else li.classList.remove('owner');
					// ensure order
					const currentChild = messagesEl.children[idx];
					if (currentChild !== li) messagesEl.insertBefore(li, currentChild || null);
				} else {
					// create new li
					li = document.createElement('li');
					li.className = 'field';
					li.setAttribute('data-id', id);
					li.innerHTML = `
							<div style="display:flex;gap:12px;align-items:flex-start">
								<div class="vote-box">
									<button data-id="${m.id}" class="vote-up">▲</button>
									<div class="vote-count">${score}</div>
									<button data-id="${m.id}" class="vote-down">▼</button>
								</div>
								<div class="post-content">
									${m.image ? `<div class="post-image"><img src="${m.image}" alt="post image"/></div>` : ''}
									<div style="display:flex;justify-content:space-between;align-items:center">
										<strong>${renderMarkdown(m.title)}</strong>
										<div class="muted small">${relativeTime(m.ts)}</div>
									</div>
									<div style="margin-top:8px" class="small-note">Comments (${(m.comments||[]).length})</div>
								</div>
							</div>
					`;
					if (owned.includes(m.id)) li.classList.add('owner');
					// click to open modal
					li.addEventListener('click', (e) => { if (e.target.closest('button') || e.target.closest('input') || e.target.closest('textarea')) return; openPostModal(m); });
					// insert at correct position
					const ref = messagesEl.children[idx] || null;
					messagesEl.insertBefore(li, ref);
					// ensure vote box sits on the right side
					const vbNew = li.querySelector('.vote-box');
					if (vbNew){ vbNew.style.marginLeft = ''; vbNew.style.alignSelf = ''; }
					// attach vote handlers for new node
					const voteBox = li.querySelector('.vote-box');
					if (voteBox){
						const up = voteBox.querySelector('.vote-up');
						const down = voteBox.querySelector('.vote-down');
						// reflect current vote visually
						voteBox.classList.remove('voted-up','voted-down');
						if ((m.your_vote||0) === 1) voteBox.classList.add('voted-up');
						if ((m.your_vote||0) === -1) voteBox.classList.add('voted-down');
						if (up){
							up.addEventListener('click', async (e) => {
								e.stopPropagation();
								const current = m.your_vote || 0;
								const send = current === 1 ? 0 : 1;
								up.disabled = true; if (down) down.disabled = true;
								try{
									const res = await fetch(API_BASE + '/api/messages/' + m.id + '/vote', {method: 'POST', credentials: 'include', headers:{'Content-Type':'application/json'}, body: JSON.stringify({vote:send})});
									if (!res.ok){ const d = await res.json().catch(()=>({})); alert(d.message || d.errors || 'Vote failed'); }
								}catch(err){ console.warn('vote error', err); }
								await loadMessages(page);
							});
						}
						if (down){
							down.addEventListener('click', async (e) => {
								e.stopPropagation();
								const current = m.your_vote || 0;
								const send = current === -1 ? 0 : -1;
								down.disabled = true; if (up) up.disabled = true;
								try{
									const res = await fetch(API_BASE + '/api/messages/' + m.id + '/vote', {method: 'POST', credentials: 'include', headers:{'Content-Type':'application/json'}, body: JSON.stringify({vote:send})});
									if (!res.ok){ const d = await res.json().catch(()=>({})); alert(d.message || d.errors || 'Vote failed'); }
								}catch(err){ console.warn('vote error', err); }
								await loadMessages(page);
							});
						}
					}
				}
			}

			// remove any old elements that are not in newIds
			existing.forEach((el, id) => { if (!newIds.includes(id)) el.remove(); });

			// update pagination info
			if (typeof updatePageInfo === 'function') updatePageInfo(total);

			// no separate open button; post element is clickable (handled when appended)
		}catch(e){
			messagesEl.innerHTML = '<li class="field">Failed to load messages</li>';
			console.error('loadMessages error', e);
		}
	}

	if (msgForm){
		msgForm.addEventListener('submit', async (e) => {
			e.preventDefault();
			postBtn.disabled = true;
			postBtn.textContent = 'Posting...';
			const titleEl = document.getElementById('message-title');
			const bodyEl = document.getElementById('message-body');
			const fileEl = document.getElementById('message-image');
			const filePreview = document.getElementById('message-image-preview');
			const title = titleEl ? titleEl.value.trim() : '';
			const body = bodyEl ? bodyEl.value.trim() : '';
			if (!title && !body){
				alert('Please enter a title or body for your post.');
				postBtn.disabled = false;
				postBtn.textContent = 'Post';
				return;
			}

			const file = fileEl && fileEl.files ? fileEl.files[0] : null;
			let image = null;
			// prefer in-memory pending image (picked earlier), otherwise read file
			if (PENDING_IMAGE){
				image = PENDING_IMAGE;
			} else if (file){
				try{ image = await readFileAsDataURL(file); }
				catch(err){ alert('Failed to read image file'); console.error(err); postBtn.disabled = false; postBtn.textContent = 'Post'; return; }
			}
			// enforce client-side body limit
			if ((body || '').length > 3000){
				alert('Body must be 3000 characters or fewer');
				postBtn.disabled = false; postBtn.textContent = 'Post';
				return;
			}

			let res;
			try{
				res = await fetch(API_BASE + '/api/messages', {
					method: 'POST',
					credentials: 'include',
					headers: {'Content-Type':'application/json'},
					body: JSON.stringify({title, body, image})
				});
			}catch(err){
				alert('Network error');
				console.error(err);
				postBtn.disabled = false; postBtn.textContent = 'Post';
				return;
			}

			if (!res.ok){
				const d = await res.json().catch(()=>({}));
				if (d && d.errors) { Object.entries(d.errors).forEach(([k,v]) => alert(v)); }
				else { alert(d.message || 'Failed to post'); }
				postBtn.disabled = false; postBtn.textContent = 'Post';
				return;
			}

			const d = await res.json().catch(()=>null);
			if (d && d.item && d.item.id){
				const owned = JSON.parse(localStorage.getItem('fizzle_owned') || '[]');
				if (!owned.includes(d.item.id)){
					owned.push(d.item.id);
					localStorage.setItem('fizzle_owned', JSON.stringify(owned));
				}
			}

			if (titleEl) titleEl.value = '';
			if (bodyEl) bodyEl.value = '';
			if (bodyCount) bodyCount.textContent = `(0/${bodyEl && bodyEl.maxLength ? bodyEl.maxLength : 3000})`;
			if (fileEl) fileEl.value = '';
			const fileNameEl = document.getElementById('message-image-name');
			if (fileNameEl) fileNameEl.textContent = '';
			PENDING_IMAGE = null;
			if (filePreview) { filePreview.src = ''; filePreview.style.display = 'none'; }
			if (postPanel){ postPanel.style.display = 'none'; if (togglePost) togglePost.textContent = 'New post ▾'; }
			if (titleCount) titleCount.textContent = `(0/${titleEl && titleEl.maxLength ? titleEl.maxLength : 100})`;
			await loadMessages(PAGE);
			postBtn.disabled = false; postBtn.textContent = 'Post';
		});
	}

	// Init

	// Modal for fullscreen post view (comments allowed only here)
	function ensureModal(){
		let modal = document.getElementById('post-modal');
		if (modal) return modal;
		modal = document.createElement('div');
		modal.id = 'post-modal';
		modal.innerHTML = `
			<div class="modal-backdrop" id="post-modal-backdrop"></div>
			<div class="modal-content" id="post-modal-content">
				<button id="post-modal-close" class="primary" style="position:absolute;right:12px;top:12px;background:#fff;color:#111;border:1px solid #e6e8ee">Close</button>
				<div id="post-modal-body"></div>
			</div>
		`;
		document.body.appendChild(modal);
		document.getElementById('post-modal-close').addEventListener('click', closePostModal);
		document.getElementById('post-modal-backdrop').addEventListener('click', closePostModal);
		return modal;
	}

	function closePostModal(){
			// clear any modal refresh polling
			if (MODAL_REFRESH){ clearInterval(MODAL_REFRESH); MODAL_REFRESH = null; }
			const modal = document.getElementById('post-modal');
			if (modal) modal.remove();
	}


	 async function openPostModal(m){
	 		ensureModal();
	 		// fetch latest copy of message (includes fresh comments and your_vote)
	 		const fresh = await fetchMessageById(m.id) || m;
	 		m = fresh;
	 		const body = document.getElementById('post-modal-body');
	 		body.innerHTML = '';
		const container = document.createElement('div');
		container.style.maxWidth = '900px';
		container.style.margin = '40px auto';
		container.style.background = '#fff';
		container.style.borderRadius = '10px';
		container.style.padding = '20px';

		const owned = JSON.parse(localStorage.getItem('fizzle_owned') || '[]');
		const isOwner = owned.includes(m.id);

		const header = document.createElement('div');
		header.innerHTML = `<h2 style="margin:0">${escapeHtml(m.title)}</h2><div class="muted small">${relativeTime(m.ts)}</div>`;
		// place image at top in fullscreen view (full-width)
		if (m.image){
			const imageDiv = document.createElement('div');
			imageDiv.className = 'modal-post-image';
			imageDiv.innerHTML = `<img src="${m.image}" alt="post image"/>`;
			container.appendChild(imageDiv);
		}

		// below image: votes left, meta (timestamp, title, body) to the right
		const contentRow = document.createElement('div');
		contentRow.style.display = 'flex';
		contentRow.style.gap = '12px';
		contentRow.style.alignItems = 'flex-start';

		// votes on left
		const voteArea = document.createElement('div');
		voteArea.className = 'modal-vote-area';
		voteArea.innerHTML = `<div id="modal-vote-box" class="vote-box" style="display:flex;flex-direction:column;align-items:center;">
			<button id="modal-vote-up" class="vote-up" style="background:transparent;border:none;cursor:pointer">▲</button>
			<div id="modal-vote-count" style="font-weight:700;">${(m.upvotes||0)-(m.downvotes||0)}</div>
			<button id="modal-vote-down" class="vote-down" style="background:transparent;border:none;cursor:pointer">▼</button>
		</div>`;
		contentRow.appendChild(voteArea);

		// meta content on right: timestamp and title only
		const meta = document.createElement('div');
		meta.style.flex = '1';
		meta.style.minWidth = '0';
		// timestamp on top (to the right of voter)
		const ts = document.createElement('div');
		ts.className = 'muted small';
		ts.textContent = relativeTime(m.ts);
		meta.appendChild(ts);
		// title below timestamp
		const titleEl = document.createElement('h2');
		titleEl.style.margin = '6px 0 0';
		titleEl.textContent = m.title || '';
		meta.appendChild(titleEl);
		if (isOwner){ const on = document.createElement('div'); on.style.marginTop = '8px'; on.style.color = '#0ea5e9'; on.style.fontWeight = '600'; on.textContent = 'You'; meta.appendChild(on); }

		contentRow.appendChild(meta);
		container.appendChild(contentRow);

		// body below everything, make it full-width to match the image
		const bodyFull = document.createElement('div');
		bodyFull.style.marginTop = '12px';
		bodyFull.innerHTML = renderMarkdown(m.body || '');
		container.appendChild(bodyFull);

		// polling for updated comments will be started after modal comment UI is fully wired

		// top comment area: toggled form that stays open after submit
		const topCommentWrap = document.createElement('div');
		topCommentWrap.style.marginTop = '12px';
		topCommentWrap.innerHTML = `
			<button id="modal-comment-toggle" class="primary" type="button">Post a comment ▾</button>
			<div id="modal-comment-top-panel" style="display:none;margin-top:8px">
				<form id="modal-comment-top-form">
					<div style="display:flex;justify-content:space-between;align-items:center">
						<textarea id="modal-comment-top-text" rows="3" class="input" placeholder="Add a comment" maxlength="200"></textarea>
						<span id="modal-comment-top-count" class="muted small">(0/200)</span>
					</div>
					<div style="margin-top:8px"><button id="modal-comment-top-post" class="primary" type="submit">Post comment</button></div>
				</form>
			</div>
		`;
		// do not append top comment panel yet - we'll place it below the comments list

		// comments list with sort + pagination
		const commentsWrap = document.createElement('div');
		commentsWrap.style.marginTop = '12px';
		commentsWrap.innerHTML = `
			<h3>Comments (${(m.comments||[]).length})</h3>
			<!-- post toggle placed directly under comments header -->
			<div style="margin-top:8px;margin-bottom:8px">
				<button id="modal-comment-toggle" class="primary" type="button">Post a comment ▾</button>
				<div id="modal-comment-top-panel" style="display:none;margin-top:8px">
					<form id="modal-comment-top-form">
						<div style="display:flex;justify-content:space-between;align-items:center">
							<textarea id="modal-comment-top-text" rows="3" class="input" placeholder="Add a comment" maxlength="200"></textarea>
							<span id="modal-comment-top-count" class="muted small">(0/200)</span>
						</div>
						<div style="margin-top:8px"><button id="modal-comment-top-post" class="primary" type="submit">Post comment</button></div>
					</form>
				</div>
			</div>
			<div style="display:flex;justify-content:space-between;align-items:center">
				<div>
					<label style="font-size:0.9rem">Sort: 
						<select id="modal-comments-sort" class="input">
							<option value="trending">Trending</option>
							<option value="new">New</option>
							<option value="top">Top</option>
						</select>
					</label>
				</div>
				<div id="modal-comments-pages" style="white-space:nowrap"></div>
			</div>
			<div id="modal-comments-list"></div>
		`;
		container.appendChild(commentsWrap);

		// append top comment toggle panel below comments as requested
		container.appendChild(topCommentWrap);

		// modal bottom controls: duplicate comment pages and back-to-top inside modal
		const modalBottom = document.createElement('div');
		modalBottom.style.display = 'flex';
		modalBottom.style.justifyContent = 'space-between';
		modalBottom.style.alignItems = 'center';
		modalBottom.style.marginTop = '8px';
		modalBottom.innerHTML = `
			<div id="modal-comments-pages-bottom" style="white-space:nowrap"></div>
			<button id="modal-back-to-top" class="page-btn modal-back-to-top">Back to top</button>
		`;
		container.appendChild(modalBottom);

		// comment form (only in modal)
		// NOTE: top comment form inserted earlier; keep a small note here if not signed in
		if (!CURRENT_USER){
			const note = document.createElement('div'); note.className = 'small-note'; note.textContent = 'Sign in to comment.'; container.appendChild(note);
		}

		body.appendChild(container);

		// comment pagination/sorting state
		let commentsPage = 0;
		const COMMENTS_PAGE_SIZE = 20;
		let commentsSort = 'trending';

		// wire up top comment toggle + form
		const topToggle = document.getElementById('modal-comment-toggle');
		const topPanel = document.getElementById('modal-comment-top-panel');
		const topForm = document.getElementById('modal-comment-top-form');
		const topText = document.getElementById('modal-comment-top-text');
		const topCount = document.getElementById('modal-comment-top-count');
		if (topToggle){
			topToggle.addEventListener('click', ()=>{ if (topPanel) topPanel.style.display = topPanel.style.display === 'none' ? 'block' : 'none'; });
		}
		if (topText && topCount){ topCount.textContent = `(${topText.value.length}/${topText.maxLength||200})`; topText.addEventListener('input', ()=> topCount.textContent = `(${topText.value.length}/${topText.maxLength||200})`); }
		if (topForm){
			topForm.addEventListener('submit', async (e)=>{
				e.preventDefault();
				const btn = document.getElementById('modal-comment-top-post');
				if (!topText) return;
				const text = topText.value.trim();
				if (!text) { alert('Comment cannot be empty'); return; }
				if (text.length > 200){ alert('Comment must be 200 characters or fewer'); return; }
				btn.disabled = true;
				try{
					const res = await fetch(API_BASE + '/api/messages/' + m.id + '/comments', {method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body: JSON.stringify({text})});
					if (res.ok){
						await fetchMessageById(m.id).then(f => { if (f) m = f; });
						topText.value = '';
						if (topCount) topCount.textContent = `(0/${topText.maxLength||200})`;
						renderComments();
						await loadMessages(PAGE);
					} else {
						const d = await res.json().catch(()=>({})); alert(d.message || d.errors || 'Failed to post comment');
					}
				}catch(err){ console.warn(err); alert('Network error'); }
				finally{ btn.disabled = false; }
			});
		}

		const commentsSortEl = document.getElementById('modal-comments-sort');
		const commentsPagesEl = document.getElementById('modal-comments-pages');
		function renderComments(){
			const list = document.getElementById('modal-comments-list');
			list.innerHTML = '';
			// update comments header count
			if (commentsWrap){ const hh = commentsWrap.querySelector('h3'); if (hh) hh.textContent = `Comments (${(m.comments||[]).length})`; }
			const all = (m.comments || []).slice();
			const now = Date.now() / 1000;
			if (commentsSort === 'new'){
				all.sort((a,b) => (b.ts||0) - (a.ts||0));
			} else if (commentsSort === 'top'){
				all.sort((a,b) => ((b.upvotes||0)-(b.downvotes||0)) - ((a.upvotes||0)-(a.downvotes||0)));
			} else {
				all.sort((a,b) => {
					const sa = ((a.upvotes||0)-(a.downvotes||0)) / Math.max(1, (now - (a.ts||now))/3600);
					const sb = ((b.upvotes||0)-(b.downvotes||0)) / Math.max(1, (now - (b.ts||now))/3600);
					return sb - sa;
				});
			}
			const total = all.length;
			const pages = Math.max(1, Math.ceil(total / COMMENTS_PAGE_SIZE));
			if (commentsPage >= pages) commentsPage = pages - 1;
			// render page buttons (simple) in both top and bottom pages container
			commentsPagesEl.innerHTML = '';
			const commentsPagesBottomEl = document.getElementById('modal-comments-pages-bottom');
			if (commentsPagesBottomEl) commentsPagesBottomEl.innerHTML = '';
			function cp(label, idx){ const b = document.createElement('button'); b.type='button'; b.className='page-btn'; b.style.marginRight='6px'; if (idx===commentsPage) b.classList.add('page-active'); b.textContent = label; b.addEventListener('click', ()=>{ commentsPage = idx; renderComments(); }); return b; }
			if (pages > 1){
				if (pages <= 7){ for (let i=0;i<pages;i++){ const btn = cp(String(i+1), i); commentsPagesEl.appendChild(btn); if (commentsPagesBottomEl) commentsPagesBottomEl.appendChild(cp(String(i+1), i)); } }
				else { const first = cp('1',0); commentsPagesEl.appendChild(first); if (commentsPagesBottomEl) commentsPagesBottomEl.appendChild(cp('1',0)); if (commentsPage>3) commentsPagesEl.appendChild(Object.assign(document.createElement('span'), {className:'page-ellipsis', textContent:'…'})); const s = Math.max(1, commentsPage-2); const e = Math.min(pages-2, commentsPage+2); for (let i=s;i<=e;i++){ const btn = cp(String(i+1), i); commentsPagesEl.appendChild(btn); if (commentsPagesBottomEl) commentsPagesBottomEl.appendChild(cp(String(i+1), i)); } if (commentsPage < pages-4) commentsPagesEl.appendChild(Object.assign(document.createElement('span'), {className:'page-ellipsis', textContent:'…'})); const last = cp(String(pages), pages-1); commentsPagesEl.appendChild(last); if (commentsPagesBottomEl) commentsPagesBottomEl.appendChild(cp(String(pages), pages-1)); }
				if (commentsPagesEl) commentsPagesEl.style.display = '';
				if (commentsPagesBottomEl) commentsPagesBottomEl.style.display = '';
			} else {
				if (commentsPagesEl) commentsPagesEl.style.display = 'none';
				if (commentsPagesBottomEl) commentsPagesBottomEl.style.display = 'none';
			}

			const start = commentsPage * COMMENTS_PAGE_SIZE;
			const chunk = all.slice(start, start + COMMENTS_PAGE_SIZE);
			chunk.forEach(c => {
				const el = document.createElement('div');
				el.style.borderTop = '1px solid #f1f5f9';
				el.style.padding = '8px 0';
				const up = c.upvotes || 0;
				const down = c.downvotes || 0;
				const your = c.your_vote || 0;
				el.innerHTML = `
					<div style="display:flex;gap:12px;align-items:flex-start">
						<div class="vote-box comment-vote-box" style="display:flex;flex-direction:column;align-items:center;margin-right:8px;">
							<button data-cid="${c.id}" class="comment-vote-up" style="background:transparent;border:none;cursor:pointer">▲</button>
							<div class="comment-vote-count">${up-down}</div>
							<button data-cid="${c.id}" class="comment-vote-down" style="background:transparent;border:none;cursor:pointer">▼</button>
						</div>
						<div style="flex:1">
							<div class="muted small">${relativeTime(c.ts)}</div>
							<div style="margin-top:6px">${renderMarkdown(c.text)}</div>
						</div>
					</div>
				`;
				list.appendChild(el);
				const voteBox = el.querySelector('.comment-vote-box');
				const upBtn = el.querySelector('.comment-vote-up');
				const downBtn = el.querySelector('.comment-vote-down');
				// reflect current vote visually on both box and arrow buttons
				if (voteBox){
					voteBox.classList.remove('voted-up','voted-down');
					if (your === 1){ voteBox.classList.add('voted-up'); if (upBtn) upBtn.classList.add('voted-up'); }
					if (your === -1){ voteBox.classList.add('voted-down'); if (downBtn) downBtn.classList.add('voted-down'); }
				}
				if (upBtn){
					upBtn.addEventListener('click', async (e)=>{
						e.stopPropagation();
						const current = c.your_vote || 0;
						const send = current === 1 ? 0 : 1;
						upBtn.disabled = true; if(downBtn) downBtn.disabled = true;
						try{
							const res = await fetch(API_BASE + `/api/messages/${m.id}/comments/${c.id}/vote`, {method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body: JSON.stringify({vote:send})});
							if (!res.ok){ const d = await res.json().catch(()=>({})); alert(d.message || d.errors || 'Vote failed'); return; }
						}catch(err){ console.warn(err); }
						m = await fetchMessageById(m.id) || m;
						renderComments();
						upBtn.disabled = false; if(downBtn) downBtn.disabled = false;
					});
				}
				if (downBtn){
					downBtn.addEventListener('click', async (e)=>{
						e.stopPropagation();
						const current = c.your_vote || 0;
						const send = current === -1 ? 0 : -1;
						downBtn.disabled = true; if(upBtn) upBtn.disabled = true;
						try{
							const res = await fetch(API_BASE + `/api/messages/${m.id}/comments/${c.id}/vote`, {method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body: JSON.stringify({vote:send})});
							if (!res.ok){ const d = await res.json().catch(()=>({})); alert(d.message || d.errors || 'Vote failed'); return; }
						}catch(err){ console.warn(err); }
						m = await fetchMessageById(m.id) || m;
						renderComments();
						downBtn.disabled = false; if(upBtn) upBtn.disabled = false;
					});
				}
			});
		}
		renderComments();

		// modal back-to-top button behavior
		const modalBackBtn = document.getElementById('modal-back-to-top');
		if (modalBackBtn){ modalBackBtn.addEventListener('click', ()=>{ const modalContent = document.getElementById('post-modal-content'); if (modalContent) modalContent.scrollTo({top:0,behavior:'smooth'}); }); }

		// start polling for updated comments while modal is open
		if (MODAL_REFRESH) clearInterval(MODAL_REFRESH);
		MODAL_REFRESH = setInterval(async ()=>{
			try{
				const fresh = await fetchMessageById(m.id);
				if (fresh){ m = fresh; renderComments(); const commentsHeader = commentsWrap && commentsWrap.querySelector('h3'); if (commentsHeader) commentsHeader.textContent = `Comments (${(m.comments||[]).length})`; }
				// also refresh main list counts
				loadMessages(PAGE);
			}catch(e){ console.warn('modal refresh error', e); }
		}, 5000);
		if (commentsSortEl){ commentsSortEl.addEventListener('change', (e)=>{ commentsSort = e.target.value || 'trending'; commentsPage = 0; renderComments(); }); }

		// voting in modal — use server `your_vote` status
		const mvUp = document.getElementById('modal-vote-up');
		const mvDown = document.getElementById('modal-vote-down');
		const mvCount = document.getElementById('modal-vote-count');
		const modalVoteBox = document.getElementById('modal-vote-box');
		const mid = String(m.id);
		// reflect current vote visually on the whole vote-box
		if (modalVoteBox){
			modalVoteBox.classList.remove('voted-up','voted-down');
			if ((m.your_vote || 0) === 1) modalVoteBox.classList.add('voted-up');
			if ((m.your_vote || 0) === -1) modalVoteBox.classList.add('voted-down');
			if (mvUp) mvUp.classList.toggle('voted-up', (m.your_vote||0) === 1);
			if (mvDown) mvDown.classList.toggle('voted-down', (m.your_vote||0) === -1);
		}

		mvUp.addEventListener('click', async ()=>{
			const current = m.your_vote || 0;
			const send = current === 1 ? 0 : 1;
			mvUp.disabled = true; mvDown.disabled = true;
			try{
				const res = await fetch(API_BASE + '/api/messages/' + m.id + '/vote', {method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body: JSON.stringify({vote:send})});
				if (!res.ok){ const d = await res.json().catch(()=>({})); alert(d.message || d.errors || 'Vote failed'); }
			}catch(e){ console.warn(e); }
			// refresh modal content in-place
			m = await fetchMessageById(m.id) || m;
			if (mvCount) mvCount.textContent = (m.upvotes||0)-(m.downvotes||0);
			if (modalVoteBox){
				modalVoteBox.classList.toggle('voted-up', (m.your_vote||0) === 1);
				modalVoteBox.classList.toggle('voted-down', (m.your_vote||0) === -1);
				if (mvUp) mvUp.classList.toggle('voted-up', (m.your_vote||0) === 1);
				if (mvDown) mvDown.classList.toggle('voted-down', (m.your_vote||0) === -1);
			}
			renderComments();
			mvUp.disabled = false; mvDown.disabled = false;
		});

		mvDown.addEventListener('click', async ()=>{
			const current = m.your_vote || 0;
			const send = current === -1 ? 0 : -1;
			mvUp.disabled = true; mvDown.disabled = true;
			try{
				const res = await fetch(API_BASE + '/api/messages/' + m.id + '/vote', {method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body: JSON.stringify({vote:send})});
				if (!res.ok){ const d = await res.json().catch(()=>({})); alert(d.message || d.errors || 'Vote failed'); }
			}catch(e){ console.warn(e); }
			// refresh modal content in-place
			m = await fetchMessageById(m.id) || m;
			if (mvCount) mvCount.textContent = (m.upvotes||0)-(m.downvotes||0);
			if (modalVoteBox){
				modalVoteBox.classList.toggle('voted-up', (m.your_vote||0) === 1);
				modalVoteBox.classList.toggle('voted-down', (m.your_vote||0) === -1);
				if (mvUp) mvUp.classList.toggle('voted-up', (m.your_vote||0) === 1);
				if (mvDown) mvDown.classList.toggle('voted-down', (m.your_vote||0) === -1);
			}
			renderComments();
			mvUp.disabled = false; mvDown.disabled = false;
		});

		// comment submit handler
		const modalForm = document.getElementById('modal-comment-form');
		if (modalForm){
			// wire up live counter for modal comment textarea
			const modalCommentText = document.getElementById('modal-comment-text');
			const modalCommentCount = document.getElementById('modal-comment-count');
			if (modalCommentText && modalCommentCount){
				modalCommentCount.textContent = `(${modalCommentText.value.length}/${modalCommentText.maxLength||200})`;
				modalCommentText.addEventListener('input', ()=>{
					modalCommentCount.textContent = `(${modalCommentText.value.length}/${modalCommentText.maxLength||200})`;
				});
			}
			modalForm.addEventListener('submit', async (e)=>{
				e.preventDefault();
				const submitBtn = document.getElementById('modal-comment-post');
				const textEl = document.getElementById('modal-comment-text');
				const text = textEl.value.trim();
				if (!text){ alert('Comment cannot be empty'); return; }
				if (text.length > 200){ alert('Comment must be 200 characters or fewer'); return; }
				submitBtn.disabled = true;
				try{
					const res = await fetch(API_BASE + '/api/messages/' + m.id + '/comments', {method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body: JSON.stringify({text})});
					if (res.ok){
						// refresh message from server so comment and your_vote fields are accurate
						await fetchMessageById(m.id).then(f => { if (f) m = f; });
						renderComments();
						textEl.value = '';
						if (modalCommentCount) modalCommentCount.textContent = `(0/${modalCommentText && modalCommentText.maxLength ? modalCommentText.maxLength : 200})`;
						await loadMessages(PAGE);
					} else {
						const d = await res.json().catch(()=>({}));
						alert(d.message || d.errors || 'Failed to post comment');
					}
				}catch(err){ console.warn(err); alert('Network error'); }
				finally{ submitBtn.disabled = false; }
			});
		}
		}

	(async ()=>{
		// immediate local fallback: if a temporary client session exists, show app immediately
		let tmpUser = null;
		try{ tmpUser = JSON.parse(localStorage.getItem('fizzle_current') || 'null'); }catch(e){ tmpUser = null; }
		if (tmpUser){
			CURRENT_USER = tmpUser;
			if (landing) landing.style.display = 'none';
			if (app) app.style.display = 'block';
			if (signedInAs) signedInAs.textContent = 'Signed in as: ' + (tmpUser.email || '');
		}

		// then confirm with server; if server returns a user, use it; if not, keep tmpUser
		const user = await fetchCurrent();
		if (user){
			CURRENT_USER = user;
			if (landing) landing.style.display = 'none';
			if (app) app.style.display = 'block';
			if (signedInAs) signedInAs.textContent = 'Signed in as: ' + user.email;
			const signoutBtn = document.getElementById('signoutBtn');
			if (signoutBtn){
				signoutBtn.addEventListener('click', async ()=>{
					try{
						await fetch(API_BASE + '/api/signout', {method:'POST', credentials:'include'});
					}catch(e){console.warn(e)}
					CURRENT_USER = null;
					try{ localStorage.removeItem('fizzle_current'); }catch(e){}
					if (landing) landing.style.display = 'block';
					if (app) app.style.display = 'none';
				});
			}
		} else if (!tmpUser){
			if (landing) landing.style.display = 'block';
			if (app) app.style.display = 'none';
		}

		// wire file chooser nicer UI
		const fileBtn = document.querySelector('.file-btn');
		const fileInput = document.getElementById('message-image');
		const fileName = document.getElementById('message-image-name');
		const filePreview = document.getElementById('message-image-preview');
		if (fileBtn && fileInput){
			// if `fileBtn` is a <label for="message-image"> then the browser
			// already opens the picker; avoid programmatic `.click()` which
			// causes a duplicate dialog on some browsers.
			const isLabel = fileBtn.tagName === 'LABEL' && fileBtn.getAttribute('for') === (fileInput.id || '');
			if (!isLabel) fileBtn.addEventListener('click', ()=> fileInput.click());
			fileInput.addEventListener('change', async ()=>{
				const f = fileInput.files && fileInput.files[0];
				fileName.textContent = f ? f.name : '';
				if (f && filePreview){
					try{
						// store dataURL so submission uses same data without re-reading
						PENDING_IMAGE = await readFileAsDataURL(f);
						filePreview.src = PENDING_IMAGE;
						filePreview.style.display = 'block';
					}catch(e){
						console.warn('preview read error', e);
						PENDING_IMAGE = null;
						filePreview.style.display = 'none';
					}
				} else if (filePreview){
					PENDING_IMAGE = null;
					filePreview.style.display = 'none';
				}
			});
		}
		await loadMessages(PAGE);

		// auto-refresh messages from other users every 5s and update relative timestamps
		setInterval(()=>{ loadMessages(PAGE); }, 5000);
		setInterval(()=>{ updateTimeElements(); }, 15000);

		// show bottom pagination (always visible near messages) and back-to-top when user scrolls near bottom
		const bottomBar = document.getElementById('bottomPagination');
		const backBtn = document.getElementById('backToTop');
		function checkBottom(){
			const threshold = 0.85; // show when scrolled past 85%
			const scrolled = (window.scrollY + window.innerHeight) / document.documentElement.scrollHeight;
			// bottomBar should always be shown directly after messages (so keep visible)
			if (bottomBar) bottomBar.style.display = 'flex';
			if (scrolled >= threshold){ if (backBtn) backBtn.style.display = 'inline-block'; }
			else { if (backBtn) backBtn.style.display = 'none'; }
		}
		window.addEventListener('scroll', checkBottom, {passive:true});
		checkBottom();
		if (backBtn){ backBtn.addEventListener('click', ()=> window.scrollTo({top:0,behavior:'smooth'})); }
		
		const sortEl = document.getElementById('sort-select');
		if (sortEl) sortEl.addEventListener('change', (e)=> loadMessages(PAGE, e.target.value));
	})();
});

