import { db, auth } from "../firebase/firebase.js";
import { collection, getDocs, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

const container = document.getElementById('resultsContainer');
const leftCol = document.getElementById('resultsColumnLeft') || (container ? container.querySelector('.results-column') : null);

function setupBackButton(){
    const backBtn = document.querySelector('.back-arrow');
    if(!backBtn) return;

    backBtn.addEventListener('click', (event) => {
        const fallbackHref = backBtn.getAttribute('href') || '../catalog/catalog.html';
        const hasSameOriginReferrer = document.referrer && new URL(document.referrer).origin === location.origin;

        event.preventDefault();

        if(window.history.length > 1){
            window.history.back();
            return;
        }

        if(hasSameOriginReferrer){
            window.location.href = document.referrer;
            return;
        }

        window.location.href = fallbackHref;
    });
}

function safeText(v){ return v?String(v):'' }

function getCoverUrl(data){
    if(data.isbn){
        const isbn = String(data.isbn).replace(/\s*\(.*\)/, '').trim();
        if(isbn) return `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg`;
    }
    const cover = data.cover_url || '';
    return cover.startsWith('//') ? 'https:' + cover : cover;
}

function getCurrentUserId(){
    if(auth && auth.currentUser && auth.currentUser.uid) return auth.currentUser.uid;
    try{
        const raw = localStorage.getItem('user');
        if(!raw) return '';
        const parsed = JSON.parse(raw);
        return parsed && parsed.uid ? String(parsed.uid) : '';
    }catch(_){
        return '';
    }
}

async function recordSearchQuery(rawQuery){
    const queryText = String(rawQuery || '').trim();
    if(!queryText) return;

    const userId = getCurrentUserId();
    if(!userId) return;

    try{
        await addDoc(collection(db, 'search_history'), {
            user_id: userId,
            search_query: queryText,
            search_date: serverTimestamp()
        });
    }catch(err){
        console.error('Error recording search history', err);
    }
}

function renderItem(doc){
    const d = doc.data();
    const img = getCoverUrl(d);
    const badge = safeText(d.type || d.collection || d.program || 'Resource');
    const title = safeText(d.title || d.title_of_material || 'Untitled');
    const year = safeText(d.year || d.edition || '');
    const author = safeText(d.author || 'Unknown author');
    const publisherOrProgram = safeText(d.publisher || d.program || '');
    return `
    <div class="result-item">
        <div class="result-cover" style="background-image:url('${img}');background-size:cover;background-position:center"></div>
        <div class="result-info">
            <span class="type-badge">${badge}</span>
            <h3>${title}</h3>
            <p><strong>${year}</strong></p>
            <p>${author}</p>
            <p>${publisherOrProgram}</p>
        </div>
        <a href="../resource-details/resource-details.html?doc=${doc.id}" class="details-btn">View Details</a>
    </div>
    <hr>
    `;
}

async function doSearch(){
    if(!container || !leftCol) return;
    const params = new URLSearchParams(location.search);
    const rawQuery = (params.get('query') || '').trim();
    const q = rawQuery.toLowerCase();
    const resultsHeader = document.querySelector('.result-count') || document.querySelector('.results-header p');
    const searchInput = document.querySelector('.search-box input[name="query"]');
    if(searchInput) searchInput.value = rawQuery;

    await recordSearchQuery(rawQuery);

    try{
        const snap = await getDocs(collection(db,'resources'));
        const docs = [];
        snap.forEach(d=>docs.push({id:d.id,data:d.data(), ref:d}));

        // relevance scoring by presence in title, author, program, description, year, and isbn
        const scored = docs.map(item=>{
            const title = (item.data.title || item.data.title_of_material || '').toLowerCase();
            const author = (item.data.author||'').toLowerCase();
            const program = (item.data.program || '').toLowerCase();
            const description = (item.data.description || '').toLowerCase();
            const year = String(item.data.year || '').toLowerCase();
            const isbn = String(item.data.isbn || '').toLowerCase();
            let score = 0;
            if(!q) score = 0;
            else{
                if(title === q) score += 10;
                else if(title.startsWith(q)) score += 6;
                else if(title.includes(q)) score += 3;
                if(author.includes(q)) score += 2;
                if(program.includes(q)) score += 2;
                if(description.includes(q)) score += 1;
                if(year.includes(q)) score += 1;
                if(isbn.includes(q)) score += 2;
            }
            return {item, score};
        }).filter(s=>s.score>0 || q==='');

        scored.sort((a,b)=>b.score-a.score);
        const top = scored.slice(0,10).map(s=>s.item.ref);
        const totalMatches = scored.length;

        leftCol.innerHTML = '';
        top.forEach((docRef)=>{
            const html = renderItem(docRef);
            leftCol.insertAdjacentHTML('beforeend', html);
        });

        if(resultsHeader){
            if(totalMatches === 0) resultsHeader.textContent = `0 results for "${rawQuery}"`;
            else resultsHeader.textContent = `1 - ${top.length} of ${totalMatches} results for "${rawQuery}"`;
        }
    }catch(err){
        console.error('Search error', err);
    }
}

setupBackButton();
doSearch();
