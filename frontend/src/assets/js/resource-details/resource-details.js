import { db, auth } from "../firebase/firebase.js";
import { doc, getDoc, collection, addDoc, deleteDoc, getDocs, query, where, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

const loadingOverlay = document.getElementById('resourceDetailsLoading');

function setLoadingOverlay(visible) {
    if(!loadingOverlay) return;
    loadingOverlay.classList.toggle('hidden', !visible);
    loadingOverlay.setAttribute('aria-busy', visible ? 'true' : 'false');
}

function safeText(v){ return v?String(v):'' }

function getCoverUrl(data) {
    if (data.isbn) {
        let isbn = String(data.isbn).replace(/\s*\(.*\)/, '').trim();
        if (isbn) {
            return `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`;
        }
    }
    const cover = data.cover_url || '';
    if (cover.startsWith('//')) return 'https:' + cover;
    return cover;
}

async function loadResource(){
    setLoadingOverlay(true);
    const params = new URLSearchParams(location.search);
    let docId = params.get('doc');
    const accession = params.get('accession');

    try{
        // If no doc id provided but an accession is, resolve the Firestore doc by accession_no
        if(!docId && accession) {
            const q = query(collection(db, 'resources'), where('accession_no', '==', accession));
            const snap = await getDocs(q);
            if(!snap.empty) {
                docId = snap.docs[0].id;
            } else {
                console.warn('No resource found for accession', accession);
                return;
            }
        }

        if(!docId){ console.warn('No doc id'); return; }

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
        const typeLeftEl = document.querySelector('.status-left');
        const saveBtn = document.querySelector('.save-btn');

        const img = getCoverUrl(data);
        if(coverEl){
            if(img) coverEl.innerHTML = `<img src="${img}" alt="cover" style="width:100%;height:100%;object-fit:cover">`;
            else coverEl.innerHTML = '';
        }
        if(titleEl) titleEl.textContent = safeText(data.title || data.title_of_material);
        if(editionEl) editionEl.textContent = safeText(data.year || '');
        
        // Build meta with author and program
        if(metaEl) {
            metaEl.innerHTML = `<p>${safeText(data.author)}</p><p>Program - ${safeText(data.program || '')}</p>`;
        }
        
        // Set type to collection value
        if(typeLeftEl) typeLeftEl.textContent = safeText(data.collection || 'Unknown');
        
        // Capitalize availability status
        const status = safeText(data.availability_status || 'Unknown');
        if(statusLabel) statusLabel.textContent = status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
        
        // description content - show "Description not available." if empty
        const tabsBody = document.querySelector('.tabs-body');
        const desc = (data.description || '').trim();
        if(tabsBody) {
            if(desc) {
                tabsBody.innerHTML = `<p>${desc.replace(/\n/g,'<br>')}</p>`;
            } else {
                tabsBody.innerHTML = `<p>Description not available.</p>`;
            }
        }
        
        // Add save/unsave functionality
        if(saveBtn) {
            // Check if already saved by current user
            let isSaved = false;
            let savedDocId = null;
            
            if(auth && auth.currentUser) {
                const savedQuery = query(
                    collection(db, 'saved_resources'),
                    where('user_id', '==', auth.currentUser.uid),
                    where('accession_no', '==', data.accession_no || '')
                );
                const savedSnap = await getDocs(savedQuery);
                if(!savedSnap.empty) {
                    isSaved = true;
                    savedDocId = savedSnap.docs[0].id;
                }
            }
            
            // Set initial button state
            if(isSaved) {
                saveBtn.textContent = 'Unsave';
            } else {
                saveBtn.textContent = 'Save';
            }
            
            // Add click handler
            saveBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                if(!auth || !auth.currentUser) {
                    alert('Please log in to save resources.');
                    return;
                }
                try {
                    if(isSaved && savedDocId) {
                        // Unsave
                        await deleteDoc(doc(db, 'saved_resources', savedDocId));
                        alert('Resource removed from library.');
                        saveBtn.textContent = 'Save';
                        isSaved = false;
                    } else {
                        // Save
                        const docRef = await addDoc(collection(db, 'saved_resources'), {
                            user_id: auth.currentUser.uid,
                            accession_no: data.accession_no || '',
                            saved_date: serverTimestamp()
                        });
                        alert('Resource saved!');
                        saveBtn.textContent = 'Unsave';
                        isSaved = true;
                        savedDocId = docRef.id;
                    }
                } catch(err) {
                    console.error('Error toggling save:', err);
                    alert('Operation failed.');
                }
            });
        }

    }catch(err){
        console.error('Error loading resource', err);
    }finally{
        setLoadingOverlay(false);
    }
}

loadResource();
