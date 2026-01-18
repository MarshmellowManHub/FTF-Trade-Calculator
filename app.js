import { initCalculator } from "./calculator.js";
// Import Firebase SDKs
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- FIREBASE CONFIGURATION ---
const firebaseConfig = {
  apiKey: "AIzaSyC0n2lUju7wTRIgIzUR5QsUIeXwE_oLXOw",
  authDomain: "fleedata.firebaseapp.com",
  projectId: "fleedata",
  storageBucket: "fleedata.firebasestorage.app",
  messagingSenderId: "916267709880",
  appId: "1:916267709880:web:87ffece735b256e4b68b4d"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// State
let currentUser = null;
let robloxId = "";
let generatedCode = "";
let allItemsData = [];
let draftAd = { yours: [], theirs: [], theirsType: 'specific' };
let valModeHV = false;
let currentValueFilter = 'all';

// Elements
const authOverlay = document.getElementById('auth-overlay');
const limitMsg = document.getElementById('ads-left-msg');
const openPostBtn = document.getElementById('open-post-ad-btn');
const postModal = document.getElementById('post-ad-modal');
const postYoursGrid = document.getElementById('post-yours-grid');
const postTheirsGrid = document.getElementById('post-theirs-grid');
const postTheirsContainer = document.getElementById('post-theirs-grid-container');
const discordInput = document.getElementById('discord-input');
const tradeFeed = document.getElementById('trade-feed');
const valuesList = document.getElementById('values-list');
const valuesSearch = document.getElementById('values-search');
const sortSelect = document.getElementById('values-sort');

window.onload = async () => {
    try {
        const res = await fetch('ftf_items.json');
        const data = await res.json();
        allItemsData = data.items;
        
        // Init Systems
        renderValuesPage();
        initCalculator();
        setupTradeListeners();
        setupValuesListeners();
        
        // LOAD ADS FROM FIREBASE
        loadTradeFeed();
    } catch(e) { console.error("Initialization Error:", e); }

    const savedUser = localStorage.getItem('ftf_user');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        robloxId = currentUser.id;
        enterApp();
    }
};

// --- AUTHENTICATION (FIXED) ---
document.getElementById('generate-btn').addEventListener('click', async () => {
    const user = document.getElementById('roblox-username').value.trim();
    if(!user) return;
    
    document.getElementById('auth-loader').style.display = 'block';
    document.getElementById('auth-error').textContent = ""; // Clear old errors

    try {
        // 1. Search for user via reliable proxy
        const url = `https://users.roblox.com/v1/users/search?keyword=${user}&limit=10`;
        const res = await fetch(`https://corsproxy.io/?${encodeURIComponent(url)}`);
        
        if (!res.ok) throw new Error(`Proxy Error: ${res.status}`);

        // FIX: Direct JSON (No .contents wrapper)
        const data = await res.json();
        console.log("Roblox Search Data:", data);

        // 2. Find exact match
        const target = data.data.find(u => u.name.toLowerCase() === user.toLowerCase());
        
        if(!target) {
            throw new Error(`User '${user}' not found.`);
        }

        // 3. Success
        robloxId = target.id;
        currentUser = { username: target.name, id: target.id };
        generatedCode = `FTF-${Math.floor(Math.random()*10000)}`;
        
        document.getElementById('verification-phrase').textContent = generatedCode;
        document.getElementById('step-1').style.display = 'none';
        document.getElementById('step-2').style.display = 'block';

    } catch(e) { 
        console.error("Login Error:", e);
        document.getElementById('auth-error').textContent = e.message || "Connection failed."; 
    } finally { 
        document.getElementById('auth-loader').style.display = 'none'; 
    }
});

document.getElementById('verify-check-btn').addEventListener('click', async () => {
    document.getElementById('auth-loader').style.display = 'block';
    document.getElementById('auth-error').textContent = "";

    try {
        const url = `https://users.roblox.com/v1/users/${robloxId}`;
        const res = await fetch(`https://corsproxy.io/?${encodeURIComponent(url)}`);
        
        if (!res.ok) throw new Error("Failed to fetch bio.");

        const data = await res.json();
        console.log("Bio Data:", data);

        if(data.description && data.description.includes(generatedCode)) {
            localStorage.setItem('ftf_user', JSON.stringify(currentUser));
            enterApp();
        } else {
            throw new Error("Code not found in 'About Me'. Please try again.");
        }
    } catch(e) { 
        console.error("Verify Error:", e);
        document.getElementById('auth-error').textContent = e.message; 
    } finally {
        document.getElementById('auth-loader').style.display = 'none';
    }
});

async function enterApp() {
    document.getElementById('auth-overlay').style.display = 'none';
    document.getElementById('user-info').style.display = 'flex';
    document.getElementById('login-btn').style.display = 'none';
    document.getElementById('header-username').textContent = currentUser.username;
    
    document.getElementById('ads-left-msg').style.display = 'block';
    checkAdLimit();
}

// --- TRADE ADS ---
function setupTradeListeners() {
    openPostBtn.addEventListener('click', () => {
        if(!currentUser) {
            document.getElementById('auth-overlay').style.display = 'flex';
            return;
        }
        if(checkAdLimit()) {
            draftAd = { yours: [], theirs: [], theirsType: 'specific' };
            discordInput.value = "";
            resetTags();
            renderDraftGrids();
            postModal.style.display = 'flex';
        }
    });

    document.getElementById('close-post-modal').addEventListener('click', () => {
        postModal.style.display = 'none';
    });

    document.querySelectorAll('.tag-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            resetTags();
            e.target.classList.add('active');
            draftAd.theirsType = e.target.dataset.tag;
            
            const theirsTotal = document.getElementById('post-theirs-total');
            if(draftAd.theirsType === 'specific') {
                postTheirsContainer.style.display = 'block';
                theirsTotal.style.display = 'block';
            } else {
                postTheirsContainer.style.display = 'none';
                theirsTotal.style.display = 'none';
                draftAd.theirs = [];
            }
        });
    });

    document.getElementById('submit-ad-btn').addEventListener('click', submitAd);
}

function resetTags() {
    document.querySelectorAll('.tag-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.tag-btn[data-tag="specific"]').classList.add('active');
    document.getElementById('post-theirs-total').style.display = 'block';
}

function renderDraftGrids() {
    renderPostGrid(postYoursGrid, draftAd.yours, 'post-yours');
    renderPostGrid(postTheirsGrid, draftAd.theirs, 'post-theirs');
}

function renderPostGrid(container, items, side) {
    container.innerHTML = '';
    let totalValue = 0;

    for(let i=0; i<4; i++) {
        const item = items[i];
        const slot = document.createElement('div');
        slot.className = 'slot';
        if(item) {
             const data = allItemsData.find(d => d.name === item.name);
             if(data) totalValue += data.value;
             slot.innerHTML = `<div class="slot-content"><img src="items/${item.name}.png" class="slot-img" onerror="this.src='items/Default.png'"></div>`;
             slot.onclick = () => { items.splice(i, 1); renderDraftGrids(); };
        } else {
             slot.onclick = () => window.openModal(side);
        }
        container.appendChild(slot);
    }
    const totalEl = document.getElementById(side + '-total');
    if(totalEl) totalEl.textContent = `Total: ${totalValue.toLocaleString()} fv`;
}

// Modal Interception
const originalOpenModal = window.openModal;
window.openModal = function(type) {
    window.activeSide = type;
    if(type.startsWith('post-')) {
         document.getElementById('modal').style.display = 'flex';
         const search = document.getElementById('modal-search');
         if(search) { search.value = ""; search.focus(); }
    } else {
        if(originalOpenModal) originalOpenModal(type);
    }
}

document.getElementById('modal-list').addEventListener('click', (e) => {
    if(window.activeSide && window.activeSide.startsWith('post-')) {
        const card = e.target.closest('.modal-item');
        if(card) {
            const name = card.querySelector('.modal-item-name').innerText.trim();
            const arr = window.activeSide === 'post-yours' ? draftAd.yours : draftAd.theirs;
            if(arr.length < 4) {
                arr.push({ name: name });
                renderDraftGrids();
                window.closeModal(); 
            }
        }
    }
});

// --- SUBMIT TO FIREBASE ---
async function submitAd() {
    const discord = discordInput.value.trim();
    if(draftAd.yours.length === 0) return alert("Add items to your side.");
    if(!discord) return alert("Discord handle required.");

    const submitBtn = document.getElementById('submit-ad-btn');
    submitBtn.disabled = true;
    submitBtn.innerText = "Posting...";

    const newAd = {
        username: currentUser.username,
        discord: discord,
        timestamp: Date.now(),
        displayTime: new Date().toLocaleTimeString(),
        yours: draftAd.yours,
        theirs: draftAd.theirs,
        theirsType: draftAd.theirsType
    };

    try {
        await addDoc(collection(db, "trade_ads"), newAd);
        incrementAdCount();
        postModal.style.display = 'none';
        loadTradeFeed();
    } catch (e) {
        console.error("Error posting ad: ", e);
        alert("Failed to post ad. Check connection.");
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = "Post Trade Ad";
    }
}

// --- LOAD FROM FIREBASE ---
async function loadTradeFeed() {
    tradeFeed.innerHTML = '<div style="text-align:center; padding:20px; color:#888;">Loading trades...</div>';
    
    try {
        const q = query(collection(db, "trade_ads"), orderBy("timestamp", "desc"), limit(50));
        const querySnapshot = await getDocs(q);
        
        tradeFeed.innerHTML = "";
        
        if (querySnapshot.empty) {
            tradeFeed.innerHTML = '<div style="color:#666;text-align:center;padding:20px;">No active trades. Post one!</div>';
            return;
        }

        const now = Date.now();
        const oneDay = 24 * 60 * 60 * 1000;

        querySnapshot.forEach((doc) => {
            const ad = doc.data();
            if (now - ad.timestamp > oneDay) return; // Expired

            const card = document.createElement('div');
            card.className = 'trade-card';
            
            const renderSide = (items) => {
                return `<div class="trade-grid-small">` + items.map(i => {
                    const d = allItemsData.find(x => x.name === i.name) || { value:0, demand:0, stability:'Stable' };
                    let icon = '<i class="fas fa-minus status-flat"></i>';
                    if(d.stability.includes("➕")) icon = '<i class="fas fa-arrow-up status-up"></i>';
                    else if(d.stability.includes("➖")) icon = '<i class="fas fa-arrow-down status-down"></i>';

                    return `
                    <div class="mini-slot">
                        <div class="status-icon">${icon}</div>
                        <div class="demand-badge">D: ${d.demand}</div>
                        <img src="items/${i.name}.png" onerror="this.src='items/Default.png'">
                        <div class="item-name">${i.name}</div>
                        <div class="value-badge">${d.value} fv</div>
                    </div>`;
                }).join('') + `</div>`;
            };

            let yoursHtml = renderSide(ad.yours);
            let theirsHtml = ad.theirsType === 'specific' 
                ? renderSide(ad.theirs)
                : `<div class="generic-tag">${ad.theirsType}</div>`;

            let timeStr = ad.displayTime || new Date(ad.timestamp).toLocaleTimeString();

            card.innerHTML = `
                <div class="trade-card-header"><span>Trading</span><span>${timeStr}</span></div>
                <div class="trade-card-body">
                    <div class="trade-side">${yoursHtml}</div>
                    <div class="trade-divider"><i class="fas fa-exchange-alt"></i></div>
                    <div class="trade-side">${theirsHtml}</div>
                </div>
                <div class="trade-card-footer"><i class="fab fa-discord"></i> ${ad.discord} | ${ad.username}</div>
            `;
            tradeFeed.appendChild(card);
        });

    } catch (e) {
        console.error("Error loading feed:", e);
        tradeFeed.innerHTML = '<div style="color:red;text-align:center;">Error loading trades. Try refreshing.</div>';
    }
}

function checkAdLimit() {
    if (!currentUser) return false;
    const today = new Date().toDateString();
    let data = JSON.parse(localStorage.getItem(`ad_limit_${robloxId}`)) || { date: today, count: 0 };
    if(data.date !== today) { data = { date: today, count: 0 }; localStorage.setItem(`ad_limit_${robloxId}`, JSON.stringify(data)); }
    limitMsg.textContent = `Ads left today: ${4 - data.count}`;
    if(data.count >= 4) { openPostBtn.disabled = true; openPostBtn.innerHTML = "Limit Reached"; return false; }
    openPostBtn.disabled = false;
    openPostBtn.innerHTML = '<i class="fas fa-plus"></i> Post Ad';
    return true;
}

function incrementAdCount() {
    const today = new Date().toDateString();
    let data = JSON.parse(localStorage.getItem(`ad_limit_${robloxId}`)) || { date: today, count: 0 };
    data.count++;
    localStorage.setItem(`ad_limit_${robloxId}`, JSON.stringify(data));
    checkAdLimit();
}

// --- VALUES PAGE ---
function setupValuesListeners() {
    valuesSearch.addEventListener('input', () => renderValuesPage());
    sortSelect.addEventListener('change', () => renderValuesPage());
    document.getElementById('val-mode-switch').onclick = (e) => {
        if(e.target.dataset.mode) {
            valModeHV = e.target.dataset.mode === 'hv';
            document.querySelectorAll('#val-mode-switch .mode-opt').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            renderValuesPage();
        }
    };
    window.filterValues = (rarity) => {
        currentValueFilter = rarity;
        document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
        const btnMap = {'all':0,'Legendary':1,'Epic':2,'Rare':3,'Common':4};
        const sidebar = document.querySelector('.sidebar');
        if(sidebar && sidebar.children[btnMap[rarity]]) sidebar.children[btnMap[rarity]].classList.add('active');
        renderValuesPage();
    };
}

function renderValuesPage() {
    if(!valuesList) return;
    valuesList.innerHTML = "";
    const search = valuesSearch.value.toLowerCase();
    const sortMode = sortSelect.value;
    const HV_DIVISOR = 40;

    let filtered = allItemsData.filter(item => {
        const matchSearch = item.name.toLowerCase().includes(search);
        const matchRarity = currentValueFilter === 'all' || item.rarity === currentValueFilter;
        return matchSearch && matchRarity;
    });

    filtered.sort((a, b) => {
        if(sortMode === 'val-high') return b.value - a.value;
        if(sortMode === 'val-low') return a.value - b.value;
        if(sortMode === 'dem-high') return b.demand - a.demand;
        if(sortMode === 'dem-low') return a.demand - b.demand;
        if(sortMode === 'status') {
            const getScore = (s) => s.includes('➕') ? 2 : (s.includes('➖') ? 0 : 1);
            return getScore(b.stability) - getScore(a.stability);
        }
        return 0;
    });

    filtered.forEach(item => {
        const div = document.createElement('div');
        div.className = 'value-card';
        const displayVal = valModeHV ? (item.value / HV_DIVISOR).toFixed(2) + " hv" : item.value + " fv";
        let statusIcon = '<i class="fas fa-minus status-flat"></i>';
        if(item.stability.includes("➕")) statusIcon = '<i class="fas fa-arrow-up status-up"></i>';
        if(item.stability.includes("➖")) statusIcon = '<i class="fas fa-arrow-down status-down"></i>';
        if(item.stability.includes("Fluctuating")) statusIcon = '<i class="fas fa-wave-square" style="color:#eab308;font-size:12px;"></i>';

        div.innerHTML = `
            <div class="status-icon">${statusIcon}</div>
            <div class="demand-badge">D: ${item.demand}</div>
            <img src="items/${item.name}.png" onerror="this.src='items/Default.png'" style="width:70px; height:70px; object-fit:contain; margin-top:15px;">
            <div style="font-size:12px;margin-top:10px;color:#eee;font-weight:600;text-align:center;">${item.name}</div>
            <div class="value-badge">${displayVal}</div>
        `;
        valuesList.appendChild(div);
    });
}

window.logout = function() { localStorage.removeItem('ftf_user'); location.reload(); }
