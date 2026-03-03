import { db } from "../firebase/firebase.js";
import { collection, query, where, getDocs, limit } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

const leftCol = document.getElementById('resultsColumnLeft');

function humanize(name){
    return String(name).replace(/_/g,' ');
}

function safeText(v){ return v?String(v):'' }

/**
 * Build a cover URL using ISBN if available, otherwise fall back to
 * any explicit `cover_url` field.  The new dataset stores only an
 * ISBN and some of them contain “(paperback)” or “(hardback)”.
 */
function getCoverUrl(data) {
    if (data.isbn) {
        let isbn = String(data.isbn).replace(/\s*\(.*\)/, '').trim();
        if (isbn) {
            return `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg`;
        }
    }
    const cover = data.cover_url || '';
    if (cover.startsWith('//')) return 'https:' + cover;
    return cover;
}

function renderItem(doc){
    const d = doc.data();
    const img = getCoverUrl(d);
    const badge = safeText(d.type || d.collection || d.program);
    const title = safeText(d.title || d.title_of_material);
    return `
    <div class="result-item">
        <div class="result-cover" style="background-image:url('${img}');background-size:cover;background-position:center"></div>
        <div class="result-info">
            <span class="type-badge">${badge}</span>
            <h3>${title}</h3>
            <p><strong>${safeText(d.year)}</strong></p>
            <p>${safeText(d.author)}</p>
            <p>${safeText(d.publisher || d.program || '')}</p>
        </div>
        <a href="../resource-details/resource-details.html?doc=${doc.id}" class="details-btn">View Details</a>
    </div>
    <hr>
    `;
}

async function loadCategory(){
    if(!leftCol) return;
    const params = new URLSearchParams(location.search);
    const program = params.get('program');
    const titleEl = document.querySelector('.category-title h2');
    const countEl = document.querySelector('.result-count');
    if(titleEl && program){
        titleEl.textContent = 'Browsing ' + humanize(program);
    }
    if(!program){ leftCol.innerHTML = '<p>No program specified.</p>'; return; }
    try{
        // removed the hard limit so the page will show all matching
        // documents; we can always add pagination later if needed.
        const q = query(collection(db,'resources'), where('program','==',program));
        const snap = await getDocs(q);
        if(snap.empty){ leftCol.innerHTML = '<p>No results found.</p>'; 
            if(countEl) countEl.textContent = '0 results';
            return; }
        leftCol.innerHTML = '';
        let idx = 0;
        snap.forEach(doc=>{
            idx += 1;
            leftCol.insertAdjacentHTML('beforeend', renderItem(doc));
        });
        if(countEl) countEl.textContent = `1 - ${idx} of ${idx} results`;
    }catch(err){
        console.error('Error fetching category resources', err);
        leftCol.innerHTML = '<p>Error loading resources.</p>';
        if(countEl) countEl.textContent = 'Error';
    }
}

loadCategory();
