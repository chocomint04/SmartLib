import { db, auth } from "../firebase/firebase.js";
import { doc, getDoc, collection, addDoc, deleteDoc, getDocs, query, where, serverTimestamp, updateDoc, limit, runTransaction } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

const loadingOverlay = document.getElementById('resourceDetailsLoading');

function setLoadingOverlay(visible) {
    if(!loadingOverlay) return;
    loadingOverlay.classList.toggle('hidden', !visible);
    loadingOverlay.setAttribute('aria-busy', visible ? 'true' : 'false');
}

function safeText(v){ return v?String(v):'' }

function formatStatus(status) {
    const text = safeText(status || 'Unknown');
    return text ? text.charAt(0).toUpperCase() + text.slice(1).toLowerCase() : 'Unknown';
}

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
        const borrowBtn = document.querySelector('.borrow-btn');
        const accessionNo = safeText(data.accession_no || accession || '');
        const userId = auth && auth.currentUser ? auth.currentUser.uid : null;
        let activeBorrowRequestDocId = null;
        let currentAvailabilityStatus = safeText(data.availability_status || 'Unknown').toLowerCase();
        let borrowActionInFlight = false;
        const isGradOnly = !!data.grad_only;

        // Fetch current user's role to enforce grad-only restriction
        let userRole = null;
        if (userId) {
            try {
                const userSnap = await getDoc(doc(db, 'users', userId));
                if (userSnap.exists()) userRole = userSnap.data().role;
            } catch(e) { console.warn('Could not fetch user role', e); }
        }
        const canAccessGradOnly = userRole === 'admin' || userRole === 'staff' || userRole === 'graduate';

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
        if(statusLabel) statusLabel.textContent = formatStatus(currentAvailabilityStatus);
        
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
                    where('accession_no', '==', accessionNo)
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
                            accession_no: accessionNo,
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

        if (borrowBtn) {
            const setBorrowButtonState = (label, disabled) => {
                borrowBtn.textContent = label;
                borrowBtn.classList.toggle('disabled', disabled);
                borrowBtn.setAttribute('aria-disabled', disabled ? 'true' : 'false');
            };

            const refreshBorrowState = () => {
                if (borrowActionInFlight) {
                    setBorrowButtonState('Processing...', true);
                    return;
                }
                if (!userId || !accessionNo) {
                    setBorrowButtonState('Borrow', true);
                    return;
                }
                // Block borrow if grad-only and user doesn't have access
                if (isGradOnly && !canAccessGradOnly) {
                    setBorrowButtonState('Grad Access Only', true);
                    return;
                }
                if (activeBorrowRequestDocId) {
                    setBorrowButtonState('Cancel Borrow', false);
                    return;
                }
                setBorrowButtonState('Borrow', currentAvailabilityStatus !== 'available');
            };

            if (userId && accessionNo) {
                const activeRequestQuery = query(
                    collection(db, 'borrowing_transactions'),
                    where('user_id', '==', userId),
                    where('accession_no', '==', accessionNo),
                    where('status', '==', 'requested'),
                    limit(1)
                );
                const activeRequestSnap = await getDocs(activeRequestQuery);
                if (!activeRequestSnap.empty) {
                    activeBorrowRequestDocId = activeRequestSnap.docs[0].id;
                }
            }

            refreshBorrowState();

            borrowBtn.addEventListener('click', async (e) => {
                e.preventDefault();

                if (!auth || !auth.currentUser) {
                    alert('Please log in to borrow resources.');
                    return;
                }
                if (!accessionNo || borrowActionInFlight) {
                    return;
                }
                if (isGradOnly && !canAccessGradOnly) {
                    alert('This resource is restricted to graduate students only.');
                    return;
                }
                if (!activeBorrowRequestDocId && currentAvailabilityStatus !== 'available') {
                    return;
                }

                const resourceRef = doc(db, 'resources', docId);

                try {
                    borrowActionInFlight = true;
                    refreshBorrowState();

                    if (activeBorrowRequestDocId) {
                        const borrowRef = doc(db, 'borrowing_transactions', activeBorrowRequestDocId);

                        await runTransaction(db, async (transaction) => {
                            const resourceSnap = await transaction.get(resourceRef);
                            const borrowSnap = await transaction.get(borrowRef);

                            if (!resourceSnap.exists()) {
                                throw new Error('Resource not found.');
                            }
                            if (!borrowSnap.exists()) {
                                throw new Error('Borrow request not found.');
                            }

                            transaction.update(resourceRef, { availability_status: 'available' });
                            transaction.update(borrowRef, { status: 'cancelled' });
                        });

                        activeBorrowRequestDocId = null;
                        currentAvailabilityStatus = 'available';
                        if (statusLabel) statusLabel.textContent = formatStatus(currentAvailabilityStatus);
                        alert('Borrow request cancelled.');
                    } else {
                        let newBorrowRequestRef = null;

                        await runTransaction(db, async (transaction) => {
                            const resourceSnap = await transaction.get(resourceRef);
                            if (!resourceSnap.exists()) {
                                throw new Error('Resource not found.');
                            }

                            const latestStatus = safeText(resourceSnap.data().availability_status).toLowerCase();
                            if (latestStatus !== 'available') {
                                throw new Error('Resource is currently unavailable.');
                            }

                            newBorrowRequestRef = doc(collection(db, 'borrowing_transactions'));
                            transaction.set(newBorrowRequestRef, {
                                accession_no: accessionNo,
                                request_date: serverTimestamp(),
                                status: 'requested',
                                user_id: auth.currentUser.uid
                            });
                            transaction.update(resourceRef, { availability_status: 'unavailable' });
                        });

                        if (newBorrowRequestRef) {
                            activeBorrowRequestDocId = newBorrowRequestRef.id;
                        }
                        currentAvailabilityStatus = 'unavailable';
                        if (statusLabel) statusLabel.textContent = formatStatus(currentAvailabilityStatus);
                        alert('Borrow request sent.');
                    }
                } catch (err) {
                    console.error('Error processing borrow action:', err);
                    alert(err.message || 'Borrow operation failed.');
                } finally {
                    borrowActionInFlight = false;
                    refreshBorrowState();
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
