import { db } from "../firebase/firebase.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

const featuredGrid = document.getElementById('featuredGrid');
const allCategoriesGrid = document.getElementById('allCategoriesGrid');

function humanize(name){
    return String(name).replace(/_/g,' ');
}

async function loadCategories(){
    if(!featuredGrid || !allCategoriesGrid) return;
    try{
        const snap = await getDocs(collection(db, 'resources'));
        const counts = {};
        const programs = new Set();
        snap.forEach(d => {
            const data = d.data();
            const prog = data.program || 'Uncategorized';
            programs.add(prog);
            counts[prog] = (counts[prog] || 0) + 1;
        });

        const top = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,8);
        featuredGrid.innerHTML = top.map(([prog,cnt]) => `
            <a class="category-card" href="category.html?program=${encodeURIComponent(prog)}">
                <h3>${humanize(prog)}</h3>
                <p>${cnt} books</p>
            </a>
        `).join('');

        const cats = Array.from(programs).sort();
        const cols = [[],[],[],[]];
        cats.forEach((c,i)=> cols[i%4].push(c));
        allCategoriesGrid.innerHTML = cols.map(col=>`<div class="cat-col">${col.map(c=>`<a href="category.html?program=${encodeURIComponent(c)}">${humanize(c)}</a>`).join('')}</div>`).join('');
    }catch(err){
        console.error('Error loading categories', err);
    }
}

loadCategories();
