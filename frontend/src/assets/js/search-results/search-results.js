import { db } from "../firebase/firebase.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

const container = document.getElementById('resultsContainer');
const leftCol = container ? container.querySelectorAll('.results-column')[0] : null;
const rightCol = container ? container.querySelectorAll('.results-column')[1] : null;

function safeText(v){ return v?String(v):'' }

function renderItem(doc){
    const d = doc.data();
    const cover = d.cover_url || '';
    const img = cover.startsWith('//') ? 'https:' + cover : cover;
    return `
    <div class="result-item">
        <div class="result-cover" style="background-image:url('${img}');background-size:cover;background-position:center;width:80px;height:110px;border-radius:4px"></div>
        <div class="result-info">
            <span class="type-badge">${safeText(d.type)}</span>
            <h3>${safeText(d.title)}</h3>
            <p><strong>${safeText(d.edition)}</strong></p>
            <p>${safeText(d.author)}</p>
            <p>${safeText(d.publisher)}</p>
        </div>
        <a href="../resource-details/resource-details.html?doc=${doc.id}" class="details-btn">View Details</a>
    </div>
    <hr>
    `;
}

async function doSearch(){
    if(!container || !leftCol || !rightCol) return;
    const params = new URLSearchParams(location.search);
    const q = (params.get('query') || '').trim().toLowerCase();
    try{
        const snap = await getDocs(collection(db,'resources'));
        const docs = [];
        snap.forEach(d=>docs.push({id:d.id,data:d.data(), ref:d}));

        // basic relevance scoring by presence in title and author
        const scored = docs.map(item=>{
            const title = (item.data.title||'').toLowerCase();
            const author = (item.data.author||'').toLowerCase();
            let score = 0;
            if(!q) score = 0;
            else{
                if(title === q) score += 10;
                else if(title.startsWith(q)) score += 6;
                else if(title.includes(q)) score += 3;
                if(author.includes(q)) score += 2;
            }
            return {item, score};
        }).filter(s=>s.score>0 || q==='');

        scored.sort((a,b)=>b.score-a.score);
        const top = scored.slice(0,10).map(s=>s.item.ref);

        leftCol.innerHTML = '';
        rightCol.innerHTML = '';
        top.forEach((docRef, idx)=>{
            const html = renderItem(docRef);
            if(idx % 2 === 0) leftCol.insertAdjacentHTML('beforeend', html);
            else rightCol.insertAdjacentHTML('beforeend', html);
        });
    }catch(err){
        console.error('Search error', err);
    }
}

doSearch();
