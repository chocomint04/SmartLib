import { db } from "../firebase/firebase.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

function safeText(v){ return v?String(v):'' }

async function loadResource(){
    const params = new URLSearchParams(location.search);
    const docId = params.get('doc');
    if(!docId){ console.warn('No doc id'); return; }
    try{
        const dref = doc(db, 'resources', docId);
        const snap = await getDoc(dref);
        if(!snap.exists()){
            console.warn('Resource not found');
            return;
        }
        const data = snap.data();
        const coverEl = document.querySelector('.big-cover');
        const titleEl = document.querySelector('.resource-title');
        const editionEl = document.querySelector('.resource-edition');
        const metaEl = document.querySelector('.resource-meta');
        const statusLabel = document.querySelector('.status-label');

        const cover = data.cover_url || '';
        const img = cover.startsWith('//') ? 'https:' + cover : cover;
        if(coverEl){
            if(img) coverEl.innerHTML = `<img src="${img}" alt="cover" style="max-width:220px;display:block">`;
        }
        if(titleEl) titleEl.textContent = safeText(data.title);
        if(editionEl) editionEl.textContent = safeText(data.edition || '');
        if(metaEl) metaEl.innerHTML = `<p>${safeText(data.author)}</p><p>${safeText(data.publish_year)}</p><p>Published by ${safeText(data.publisher)}</p>`;
        if(statusLabel) statusLabel.textContent = safeText(data.availability_status || 'Unknown');
        // description content
        const tabsBody = document.querySelector('.tabs-body');
        if(tabsBody) tabsBody.innerHTML = `<p>${(data.description || '').replace(/\n/g,'<br>')}</p>`;

    }catch(err){
        console.error('Error loading resource', err);
    }
}

loadResource();
