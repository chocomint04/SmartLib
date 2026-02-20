import { db } from "../firebase/firebase.js";
import { collection, query, where, getDocs, limit } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

const leftCol = document.getElementById('resultsColumnLeft');

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

async function loadCategory(){
    if(!leftCol) return;
    const params = new URLSearchParams(location.search);
    const category = params.get('category');
    if(!category){ leftCol.innerHTML = '<p>No category specified.</p>'; return; }
    try{
        const q = query(collection(db,'resources'), where('category','==',category), limit(10));
        const snap = await getDocs(q);
        if(snap.empty){ leftCol.innerHTML = '<p>No results found.</p>'; return; }
        leftCol.innerHTML = '';
        snap.forEach(doc=>{
            leftCol.insertAdjacentHTML('beforeend', renderItem(doc));
        });
    }catch(err){
        console.error('Error fetching category resources', err);
        leftCol.innerHTML = '<p>Error loading resources.</p>';
    }
}

loadCategory();
